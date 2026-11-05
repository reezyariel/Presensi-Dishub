// Supabase Edge Function: submit-attendance
// Production-grade server-side attendance validation, schedule engine, selfie verification, and idempotency
// Serves Deno / Supabase Edge Functions runtime

/**
 * ARSITEKTUR KEAMANAN & BATASAN SISTEM (SECURITY ARCHITECTURE & BOUNDARIES):
 * 
 * 1. Model Otentikasi Anonim:
 *    - Pegawai CS dan Security melakukan presensi tanpa akun login password/email (portal publik).
 *    - Untuk mencegah manipulasi, sistem menerapkan pengamanan server berlapis:
 *      a. Whitelist Pegawai Aktif: Nama wajib terdaftar persis di tabel `employee_profiles` dengan `is_active = true`.
 *      b. Validasi Divisi: Kategori (CS / Security) wajib sesuai dengan divisi yang terdaftar di database.
 *      c. Waktu Otoritatif Server: Tanggal kerja, jam presensi, dan status dihitung 100% oleh server (Asia/Jakarta).
 *      d. Anti-Duplikasi: Index unik mencegah submit ganda untuk pegawai + tanggal kerja + tipe presensi yang sama.
 *      e. Idempotency Key: Mencegah double-request akibat retry jaringan.
 * 
 * 2. Batasan Validasi Foto Selfie:
 *    - Validasi magic bytes (JPEG/PNG/WebP) dan ukuran maksimal (5 MB) HANYA memverifikasi integritas struktur file biner.
 *    - Validasi magic bytes BUKAN merupakan verifikasi biometrik wajah, identifikasi personal, ataupun bukti keaktifan (liveness detection).
 *    - Foto disimpan dalam Supabase Storage privat ('selfies') yang hanya dapat diakses oleh Administrator terverifikasi via Signed URL.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_BASE64_LENGTH = 7.5 * 1024 * 1024 // ~5.5 MB decoded

/**
 * Normalizes an employee name consistently:
 * - Trims leading & trailing whitespace
 * - Compresses repeated consecutive whitespace characters to a single space
 * - Converts to lowercase
 */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

interface FileValidationResult {
  valid: boolean
  ext: string
  mime: string
  error?: string
}

/**
 * Validate image binary data against known magic bytes
 */
function validateImageMagicBytes(bytes: Uint8Array): FileValidationResult {
  if (bytes.length < 12) {
    return { valid: false, ext: '', mime: '', error: 'Ukuran file foto terlalu kecil atau korup.' }
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, ext: 'jpg', mime: 'image/jpeg' }
  }

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { valid: true, ext: 'png', mime: 'image/png' }
  }

  // WebP: RIFF ... WEBP (0x52, 0x49, 0x46, 0x46 and bytes 8..11 = 0x57, 0x45, 0x42, 0x50)
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { valid: true, ext: 'webp', mime: 'image/webp' }
  }

  return {
    valid: false,
    ext: '',
    mime: '',
    error: 'Format foto tidak valid. Hanya file JPG, PNG, atau WebP yang diizinkan sebagai selfie.',
  }
}

/**
 * Format Date to Jakarta YYYY-MM-DD
 */
function getJakartaDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

/**
 * Format Date to Jakarta HH:mm
 */
function getJakartaTimeString(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Great-circle distance between two GPS coordinates using Haversine formula
 * @returns distance in meters (rounded to nearest integer)
 */
function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (
    Number.isNaN(lat1) || Number.isNaN(lon1) ||
    Number.isNaN(lat2) || Number.isNaN(lon2)
  ) {
    return Infinity
  }

  const R = 6371000 // Earth's mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Konfigurasi server bermasalah: kredensial Supabase tidak ditemukan.')
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // 0. Verify Caller Authentication from Authorization Bearer Header
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
    let callerUser: { id: string; email?: string } | null = null

    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (token) {
        if (token === serviceRoleKey) {
          // Internal service call / admin test runner
          callerUser = { id: 'service-role-admin', email: 'service-role@sipaten.internal' }
        } else {
          const { data: userData, error: userError } = await supabase.auth.getUser(token)
          if (!userError && userData?.user) {
            callerUser = userData.user
          }
        }
      }
    }

    if (!callerUser) {
      return new Response(
        JSON.stringify({ error: 'Akses ditolak: Sesi login pengguna tidak ditemukan atau telah kedaluwarsa. Silakan masuk kembali.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse payload
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: 'Format JSON payload tidak valid.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const employee_name = typeof body.employee_name === 'string' ? body.employee_name.trim() : ''
    const category = body.category as string
    const attendance_type = body.attendance_type as string
    const shift = (typeof body.shift === 'string' && body.shift.trim() ? body.shift.trim() : null) as string | null
    const check_in_record_id = (typeof body.check_in_record_id === 'string' && body.check_in_record_id.trim()) ? body.check_in_record_id.trim() : null
    const selfie_base64 = typeof body.selfie_base64 === 'string' ? body.selfie_base64 : ''
    const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : ''

    // GPS & Reason fields
    const latitude = typeof body.latitude === 'number' ? body.latitude : (body.latitude ? Number(body.latitude) : null)
    const longitude = typeof body.longitude === 'number' ? body.longitude : (body.longitude ? Number(body.longitude) : null)
    const location_accuracy = typeof body.location_accuracy === 'number' ? body.location_accuracy : (body.location_accuracy ? Number(body.location_accuracy) : null)
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    // 1. Validate mandatory fields
    if (!employee_name || employee_name.length < 2 || employee_name.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Nama pegawai wajib diisi (2 - 100 karakter).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (category !== 'CS' && category !== 'Security') {
      return new Response(
        JSON.stringify({ error: 'Kategori pegawai tidak valid. Pilih CS atau Security.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['masuk', 'istirahat', 'pulang'].includes(attendance_type)) {
      return new Response(
        JSON.stringify({ error: 'Tipe absensi tidak valid. Pilih masuk, istirahat, atau pulang.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (category === 'CS') {
      if (shift) {
        return new Response(
          JSON.stringify({ error: 'Kategori Cleaning Service tidak memiliki shift.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // Security
      if (attendance_type === 'istirahat') {
        return new Response(
          JSON.stringify({ error: 'Kategori Security tidak memiliki tipe absensi istirahat.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const validShifts = [
        'Shift 1', 'Shift 2', 'Shift 3',
        'Shift I', 'Shift II', 'Shift III',
        'Sesi Pagi', 'Sesi Malam',
        'shift_1_reguler', 'shift_1_panjang', 'shift_2_malam'
      ]
      if (!shift || !validShifts.includes(shift)) {
        return new Response(
          JSON.stringify({ error: 'Pilih shift yang valid untuk Security (Shift I, Shift II, Shift III, shift_1_reguler, shift_1_panjang, shift_2_malam).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!idempotency_key || idempotency_key.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Idempotency key wajib disertakan untuk mencegah duplikasi.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Validate Selfie Base64 String and Content
    if (!selfie_base64) {
      return new Response(
        JSON.stringify({ error: 'Foto selfie bukti presensi wajib diambil.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (selfie_base64.length > MAX_BASE64_LENGTH) {
      return new Response(
        JSON.stringify({ error: 'Ukuran foto selfie melebihi batas maksimal 5 MB.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let binaryData: Uint8Array
    try {
      const cleanBase64 = selfie_base64.replace(/^data:image\/\w+;base64,/, '')
      const binaryString = atob(cleanBase64)
      binaryData = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        binaryData[i] = binaryString.charCodeAt(i)
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'Data base64 foto selfie rusak atau tidak valid.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (binaryData.length > MAX_PHOTO_BYTES) {
      return new Response(
        JSON.stringify({ error: 'Ukuran file foto selfie melebihi batas 5 MB.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Magic Bytes Verification
    const magicCheck = validateImageMagicBytes(binaryData)
    if (!magicCheck.valid) {
      return new Response(
        JSON.stringify({ error: magicCheck.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Check Idempotency (Safe retry)
    const { data: existingRecord } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('idempotency_key', idempotency_key)
      .maybeSingle()

    if (existingRecord) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Presensi sudah tercatat sebelumnya (idemp-cached).',
          data: existingRecord,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Server-Authoritative Time
    const serverNow = new Date()
    const jakartaDateToday = getJakartaDateString(serverNow)
    const jakartaTimeStr = getJakartaTimeString(serverNow)
    const [currentHour, currentMinute] = jakartaTimeStr.split(':').map(Number)
    const currentMinutesFromMidnight = currentHour * 60 + currentMinute

    // 4b. Strict Whitelist & Identity Verification against employee_profiles (Fail-Safe)
    const normalizedInputName = normalizeName(employee_name)
    let matchedEmployee: {
      id: string
      full_name: string
      normalized_name: string
      employee_role: string
      is_active: boolean
      auth_uid: string | null
    } | null = null

    // Check if caller is an Administrator
    let isCallerAdmin = callerUser?.id === 'service-role-admin'
    if (!isCallerAdmin && callerUser) {
      const { data: adminRecord } = await supabase
        .from('admin_profiles')
        .select('id, full_name, is_active')
        .eq('id', callerUser.id)
        .eq('is_active', true)
        .maybeSingle()
      if (adminRecord) {
        isCallerAdmin = true
      }
    }

    if (isCallerAdmin) {
      // Administrator recording on behalf of an employee
      const { data: empRecord, error: empErr } = await supabase
        .from('employee_profiles')
        .select('id, full_name, normalized_name, employee_role, is_active, auth_uid')
        .eq('normalized_name', normalizedInputName)
        .eq('employee_role', category)
        .maybeSingle()

      if (empErr) {
        console.error('Database query error checking employee_profiles (admin):', empErr)
        return new Response(
          JSON.stringify({ error: 'Gagal memverifikasi data pegawai di server database. Absensi dibatalkan demi keamanan.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      matchedEmployee = empRecord
    } else if (callerUser) {
      // Authenticated employee: verify relationship with callerUser.id
      // 1. Primary check: by caller's auth_uid AND category
      const { data: empByAuth, error: errAuth } = await supabase
        .from('employee_profiles')
        .select('id, full_name, normalized_name, employee_role, is_active, auth_uid')
        .or(`auth_uid.eq.${callerUser.id},id.eq.${callerUser.id}`)
        .eq('employee_role', category)
        .maybeSingle()

      if (errAuth) {
        console.error('Database query error checking employee_profiles by auth_uid:', errAuth)
        return new Response(
          JSON.stringify({ error: 'Gagal memverifikasi data pegawai di server database. Absensi dibatalkan demi keamanan.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (empByAuth) {
        matchedEmployee = empByAuth
      } else {
        // 2. Secondary check: by normalized_name AND category
        const { data: empByName, error: errName } = await supabase
          .from('employee_profiles')
          .select('id, full_name, normalized_name, employee_role, is_active, auth_uid')
          .eq('normalized_name', normalizedInputName)
          .eq('employee_role', category)
          .maybeSingle()

        if (errName) {
          console.error('Database query error checking employee_profiles by name:', errName)
          return new Response(
            JSON.stringify({ error: 'Gagal memverifikasi data pegawai di server database. Absensi dibatalkan demi keamanan.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (empByName) {
          // If profile is already bound to a different auth_uid, reject spoofing
          if (empByName.auth_uid && empByName.auth_uid !== callerUser.id) {
            return new Response(
              JSON.stringify({
                error: `Akses ditolak: Akun Anda tidak berwenang untuk melakukan presensi atas nama pegawai "${empByName.full_name}".`,
              }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          matchedEmployee = empByName

          // Link auth_uid if empty
          if (!matchedEmployee.auth_uid) {
            await supabase
              .from('employee_profiles')
              .update({ auth_uid: callerUser.id })
              .eq('id', matchedEmployee.id)
            matchedEmployee.auth_uid = callerUser.id
          }
        }
      }
    }

    if (!matchedEmployee) {
      // Check if user exists in another role to provide clear division mismatch message
      if (callerUser) {
        const { data: otherRoleEmp } = await supabase
          .from('employee_profiles')
          .select('full_name, employee_role')
          .or(`auth_uid.eq.${callerUser.id},id.eq.${callerUser.id}`)
          .maybeSingle()

        if (otherRoleEmp) {
          return new Response(
            JSON.stringify({
              error: `Pegawai "${otherRoleEmp.full_name}" terdaftar pada divisi ${otherRoleEmp.employee_role}, bukan ${category}.`,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      return new Response(
        JSON.stringify({ error: `Pegawai "${employee_name}" tidak terdaftar dalam sistem SIPATEN untuk divisi ${category}. Absensi ditolak.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!matchedEmployee.is_active) {
      return new Response(
        JSON.stringify({ error: `Pegawai "${matchedEmployee.full_name}" berstatus non-aktif. Silakan hubungi administrator.` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (matchedEmployee.employee_role !== category) {
      return new Response(
        JSON.stringify({
          error: `Pegawai "${matchedEmployee.full_name}" terdaftar pada divisi ${matchedEmployee.employee_role}, bukan ${category}.`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Authoritative employee name and normalized name directly from the verified database record
    const authoritativeEmployeeName = matchedEmployee.full_name
    const authoritativeNormalizedName = matchedEmployee.normalized_name

    // Canonical shift name helper (normalize Shift 1/2/3 and Sesi Pagi/Malam)
    function canonicalize(s: string | null | undefined): string {
      if (!s) return ''
      const t = s.trim()
      if (t === 'Shift 1' || t === 'Shift I' || t === 'Sesi Pagi') return 'Shift I'
      if (t === 'Shift 2' || t === 'Shift II' || t === 'Sesi Malam') return 'Shift II'
      if (t === 'Shift 3' || t === 'Shift III') return 'Shift III'
      return t
    }

    function shiftsCompatible(s1: string | null | undefined, s2: string | null | undefined): boolean {
      if (!s1 || !s2) return false
      if (s1 === s2) return true
      const c1 = canonicalize(s1)
      const c2 = canonicalize(s2)
      if (c1 === c2) return true
      // Friday backward compatibility mappings:
      if ((c1 === 'Shift I' && c2 === 'shift_1_panjang') || (c2 === 'Shift I' && c1 === 'shift_1_panjang')) return true
      if ((c1 === 'Shift II' && c2 === 'shift_2_malam') || (c2 === 'Shift II' && c1 === 'shift_2_malam')) return true
      return false
    }

    // 4c. Determine Work Date & Enforce Check-In Prerequisite for Checkout
    // Overnight shifts cross midnight into next day (H+1):
    //   Senin–Kamis: Shift III (19:30 – 07:30 H+1), Shift 3
    //   Jumat:       shift_2_malam / Shift II (19:00 – 07:00 H+1)
    //   Sabtu–Minggu: Shift II (20:00 – 07:30 H+1), Sesi Malam
    let workDate = jakartaDateToday
    const yesterday = new Date(serverNow.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayDateStr = getJakartaDateString(yesterday)

    const todayDayNum = new Date(jakartaDateToday + 'T12:00:00+07:00').getDay() // 0=Sun,1=Mon,...,6=Sat
    const yesterdayDayNum = (todayDayNum + 6) % 7 // 0=Sun,1=Mon,...,6=Sat

    function isOvernightByDayAndShift(dayOfWeek: number, shiftName: string | null): boolean {
      if (!shiftName) return false
      const canon = canonicalize(shiftName)
      // Senin–Kamis (1–4): Shift III overnight
      if (dayOfWeek >= 1 && dayOfWeek <= 4) return canon === 'Shift III'
      // Jumat (5): shift_2_malam or Shift II overnight
      if (dayOfWeek === 5) return canon === 'Shift II' || shiftName === 'shift_2_malam'
      // Sabtu–Minggu (6,0): Shift II / Sesi Malam overnight
      if (dayOfWeek === 0 || dayOfWeek === 6) return canon === 'Shift II'
      return false
    }

    if (category === 'CS') {
      if (attendance_type === 'pulang') {
        const { data: csMasuk } = await supabase
          .from('attendance_records')
          .select('id')
          .eq('normalized_name', authoritativeNormalizedName)
          .eq('category', 'CS')
          .eq('attendance_type', 'masuk')
          .eq('work_date', jakartaDateToday)
          .maybeSingle()

        if (!csMasuk) {
          return new Response(
            JSON.stringify({
              error: `Presensi pulang ditolak: Pegawai ${authoritativeEmployeeName} belum melakukan presensi masuk hari ini. Pegawai wajib melakukan presensi masuk terlebih dahulu.`,
              error_code: 'NO_CHECKIN_FOUND',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    } else if (category === 'Security') {
      const canonShift = canonicalize(shift)

      if (attendance_type === 'pulang') {
        let matchedMasuk: {
          id: string
          work_date: string
          recorded_at: string
          shift: string | null
        } | null = null

        // Priority 1: Check by specific check_in_record_id if supplied
        if (check_in_record_id) {
          const { data: byId } = await supabase
            .from('attendance_records')
            .select('id, work_date, recorded_at, shift')
            .eq('id', check_in_record_id)
            .eq('normalized_name', authoritativeNormalizedName)
            .eq('category', 'Security')
            .eq('attendance_type', 'masuk')
            .maybeSingle()

          if (byId && shiftsCompatible(byId.shift, shift)) {
            matchedMasuk = byId
          }
        }

        // Priority 2: Look up open masuk for this employee in yesterday and today
        if (!matchedMasuk) {
          // If yesterday had an overnight shift matching shift (e.g. Sunday Shift II ending Monday morning),
          // search yesterday first, then today.
          const isYesterdayOvernight = isOvernightByDayAndShift(yesterdayDayNum, shift)
          const candidateDates = (currentHour < 14 && isYesterdayOvernight)
            ? [yesterdayDateStr, jakartaDateToday]
            : [jakartaDateToday, yesterdayDateStr]

          const { data: masukRecords } = await supabase
            .from('attendance_records')
            .select('id, work_date, recorded_at, shift')
            .eq('normalized_name', authoritativeNormalizedName)
            .eq('category', 'Security')
            .eq('attendance_type', 'masuk')
            .in('work_date', candidateDates)
            .order('recorded_at', { ascending: false })

          if (masukRecords && masukRecords.length > 0) {
            const matchingShifts = masukRecords.filter(r => shiftsCompatible(r.shift, shift))

            // Pick the first matching record that doesn't already have a pulang
            for (const cand of matchingShifts) {
              const { data: existingPulang } = await supabase
                .from('attendance_records')
                .select('id')
                .eq('normalized_name', authoritativeNormalizedName)
                .eq('category', 'Security')
                .eq('attendance_type', 'pulang')
                .eq('work_date', cand.work_date)
                .eq('shift', cand.shift)
                .maybeSingle()

              if (!existingPulang) {
                matchedMasuk = cand
                break
              }
            }

            // Fallback to latest matching masuk if none unclosed
            if (!matchedMasuk && matchingShifts.length > 0) {
              matchedMasuk = matchingShifts[0]
            }
          }
        }

        // Mandatory rule: Guard must have checked in before checkout
        if (!matchedMasuk) {
          return new Response(
            JSON.stringify({
              error: `Presensi pulang ditolak: Tidak ditemukan catatan presensi masuk yang valid untuk ${authoritativeEmployeeName}${shift ? ` (${shift})` : ''}. Pegawai wajib melakukan presensi masuk terlebih dahulu.`,
              error_code: 'NO_CHECKIN_FOUND',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        workDate = matchedMasuk.work_date
      } else if (attendance_type === 'masuk') {
        // Post-midnight / early morning check-in (< 12:00 WIB) for overnight shift that started yesterday
        if (currentHour < 12 && isOvernightByDayAndShift(yesterdayDayNum, shift)) {
          workDate = yesterdayDateStr
        }
      }
    }

    // 5. Duplicate Attendance Prevention for Same Employee + Work Date + Type (+ Shift for Security)
    const duplicateQuery = supabase
      .from('attendance_records')
      .select('id, recorded_at, attendance_type, work_date')
      .eq('normalized_name', authoritativeNormalizedName)
      .eq('category', category)
      .eq('work_date', workDate)
      .eq('attendance_type', attendance_type)

    // For Security, also scope by shift to avoid false conflicts between different shifts
    const finalDuplicateQuery = (category === 'Security' && shift)
      ? duplicateQuery.eq('shift', shift)
      : duplicateQuery

    const { data: duplicateRecord } = await finalDuplicateQuery.maybeSingle()

    if (duplicateRecord) {
      return new Response(
        JSON.stringify({
          error: `Pegawai ${authoritativeEmployeeName} sudah melakukan presensi ${attendance_type.toUpperCase()} untuk tanggal kerja ${workDate}${shift ? ` (${shift})` : ''}.`,
          error_code: 'DUPLICATE_ATTENDANCE',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Schedule and Lateness Calculation based on workDate (Source of Truth: scheduleEngine)
    // Parse workDate to find day of week
    const [wYear, wMonth, wDay] = workDate.split('-').map(Number)
    const workDateObj = new Date(Date.UTC(wYear, wMonth - 1, wDay))
    const workDayOfWeek = workDateObj.getUTCDay()
    const isShiftedDay = workDayOfWeek === 4 || workDayOfWeek === 5 // 4 = Thu, 5 = Fri

    // 6a. Fetch CS & Security schedules from attendance_settings (authoritative source of truth)
    let csOpen: string = '07:30'
    let csDeadline: string = '08:00'
    let csClose: string = '11:59'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let secScheduleData: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let secWeekendData: any = null

    const { data: scheduleSettingsRows } = await supabase
      .from('attendance_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['cs_schedule', 'security_schedule', 'security_weekend_schedule'])

    if (scheduleSettingsRows) {
      for (const row of scheduleSettingsRows) {
        if (row.setting_key === 'cs_schedule' && row.setting_value) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sv = row.setting_value as any
          const m = sv.masuk
          if (m) {
            csOpen = m.open ?? m.start ?? csOpen
            csDeadline = m.ontime_deadline ?? m.end ?? csDeadline
            csClose = m.close ?? csClose
          }
        } else if (row.setting_key === 'security_schedule' && row.setting_value) {
          secScheduleData = row.setting_value
        } else if (row.setting_key === 'security_weekend_schedule' && row.setting_value) {
          secWeekendData = row.setting_value
        }
      }
    }

    // Helper: parse HH:mm to minutes-from-midnight
    function hhmm(t: string): number {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }

    let scheduledStart: string | null = null
    let scheduledEnd: string | null = null
    let attendanceStatus: 'tepat_waktu' | 'terlambat' = 'tepat_waktu'
    let lateMinutes = 0
    let reviewStatus: 'belum_diperiksa' | 'sudah_diperiksa' | 'perlu_tindak_lanjut' = 'belum_diperiksa'
    let adminNotes: string | null = null

    if (category === 'CS') {
      // Aturan CS Senin–Minggu (7 hari penuh, 3-boundary system dari Admin settings):
      //   Sebelum open          → TOLAK (presensi tidak diizinkan)
      //   open – ontime_deadline  → tepat_waktu
      //   ontime_deadline+1 – close → terlambat, late_minutes dari ontime_deadline
      //   Setelah close         → TOLAK (jendela ditutup)
      // Tidak ada shift; istirahat dan pulang tidak dihitung keterlambatan.
      // Tidak ada pembatasan hari — CS beroperasi setiap hari termasuk Sabtu dan Minggu.

      if (attendance_type === 'masuk') {
        scheduledStart = csOpen
        scheduledEnd = csDeadline

        const openMins = hhmm(csOpen)
        const deadlineMins = hhmm(csDeadline)
        const closeMins = hhmm(csClose)

        // Tolak jika sebelum waktu buka
        if (currentMinutesFromMidnight < openMins) {
          return new Response(
            JSON.stringify({
              error: `Presensi masuk CS belum dibuka. Jendela check-in dimulai pukul ${csOpen} WIB.`,
              error_code: 'WINDOW_NOT_OPEN',
              requires_reason: false,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Tolak jika setelah waktu tutup
        if (currentMinutesFromMidnight > closeMins) {
          return new Response(
            JSON.stringify({
              error: `Jendela presensi masuk CS telah ditutup pada pukul ${csClose} WIB. Presensi hari ini tidak dapat dilakukan.`,
              error_code: 'WINDOW_CLOSED',
              requires_reason: false,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Dalam jendela: cek tepat_waktu vs terlambat
        if (currentMinutesFromMidnight > deadlineMins) {
          attendanceStatus = 'terlambat'
          lateMinutes = currentMinutesFromMidnight - deadlineMins
          adminNotes = `Terlambat ${lateMinutes} menit (Masuk pukul ${jakartaTimeStr} WIB, batas ${csDeadline} WIB)`
        }
        // Tepat waktu: tidak perlu adminNotes
      } else if (attendance_type === 'istirahat') {
        scheduledStart = '12:00'
        scheduledEnd = '14:00'
        if (currentHour < 12 || currentHour >= 14) {
          reviewStatus = 'perlu_tindak_lanjut'
          adminNotes = `Istirahat di luar rentang jadwal resmi 12:00–14:00 (${jakartaTimeStr} WIB)`
        }
      } else if (attendance_type === 'pulang') {
        scheduledStart = '16:00'
        scheduledEnd = '18:00'
        if (currentHour < 16 || currentHour >= 18) {
          reviewStatus = 'perlu_tindak_lanjut'
          adminNotes = `Pulang di luar rentang jadwal resmi 16:00–18:00 (${jakartaTimeStr} WIB)`
        }
      }
    } else if (category === 'Security') {
      // ─────────────────────────────────────────────────────────
      // Day-based schedule: determine group & shift schedule from
      // attendance_settings (day_groups) or authoritative defaults.
      //
      // Day groups (Asia/Jakarta day-of-week from workDate):
      //   Mon–Thu (1–4): Shift I 07:00–16:00, II 15:00–19:30, III 19:30–07:30 H+1
      //   Fri    (5)  : Shift I 07:00–19:00, II 19:00–07:00 H+1
      //   Sat–Sun(6,0): Shift I 07:30–20:00, II 20:00–07:30 H+1
      // ─────────────────────────────────────────────────────────

      // Canonical shift name (normalize Shift 1/2/3 and Sesi Pagi/Malam)
      const shiftStr = String(shift || '')
      const canonicalShift = canonicalize(shiftStr)

      const isWeekendDay = workDayOfWeek === 0 || workDayOfWeek === 6
      const isFridayDay = workDayOfWeek === 5

      // ── Helper: parse HH:mm from day_groups shift item ──────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function getDayGroupShift(dayGroups: any, groupKey: string, shiftCanon: string): any | null {
        const group = dayGroups?.[groupKey]
        if (!group?.shifts || !Array.isArray(group.shifts)) return null

        if (groupKey === 'friday') {
          const byId = group.shifts.find((s: any) => s.id === shiftCanon || s.shift_name === shiftCanon)
          if (byId) return byId
          // Backward compatibility for historical Friday records
          if (shiftCanon === 'Shift I') {
            const panjang = group.shifts.find((s: any) => s.id === 'shift_1_panjang' || s.shift_name === 'shift_1_panjang')
            if (panjang) return panjang
          }
          if (shiftCanon === 'Shift II') {
            const malam = group.shifts.find((s: any) => s.id === 'shift_2_malam' || s.shift_name === 'shift_2_malam')
            if (malam) return malam
          }
        }

        return group.shifts.find((s: any) => {
          const sn = String(s.shift_name || '')
          return canonicalize(sn) === shiftCanon || s.id === shiftCanon
        }) || null
      }

      // ── Validate that the requested shift exists in the day's schedule ──
      const dayGroups = secScheduleData?.day_groups
      const groupKey = isWeekendDay ? 'weekend' : isFridayDay ? 'friday' : 'mon_thu'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const configuredShifts: string[] = Array.isArray(dayGroups?.[groupKey]?.shifts) && dayGroups[groupKey].shifts.length > 0
        ? dayGroups[groupKey].shifts.map((s: any) => s.id || canonicalize(s.shift_name))
        : isFridayDay
          ? ['shift_1_reguler', 'shift_1_panjang', 'shift_2_malam']
          : isWeekendDay ? ['Shift I', 'Shift II'] : ['Shift I', 'Shift II', 'Shift III']

      const isAllowedShift = configuredShifts.includes(canonicalShift) ||
        configuredShifts.includes(shiftStr) ||
        (isFridayDay && (canonicalShift === 'Shift I' || canonicalShift === 'Shift II'))

      if (!isAllowedShift) {
        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
        return new Response(
          JSON.stringify({
            error: `Pilihan shift ${shift} tidak sesuai dengan jadwal hari ${dayNames[workDayOfWeek]}. Shift yang tersedia: ${configuredShifts.join(', ')}.`,
            error_code: 'INVALID_SHIFT_FOR_DAY',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ── Authoritative defaults per day group & shift ─────────
      // These mirror DEFAULT_DAY_GROUPS in scheduleEngine.ts
      interface ShiftTimings {
        in_start: string; in_end: string
        out_start: string; out_end: string
        out_next_day: boolean
      }

      function getDefaultShiftTimings(dayOfWeek: number, shiftCanon: string): ShiftTimings {
        // Senin–Kamis
        if (dayOfWeek >= 1 && dayOfWeek <= 4) {
          if (shiftCanon === 'Shift I')   return { in_start:'07:00', in_end:'07:30', out_start:'16:00', out_end:'16:30', out_next_day:false }
          if (shiftCanon === 'Shift II')  return { in_start:'15:00', in_end:'15:30', out_start:'19:30', out_end:'20:00', out_next_day:false }
          if (shiftCanon === 'Shift III') return { in_start:'19:30', in_end:'20:00', out_start:'07:30', out_end:'08:00', out_next_day:true  }
        }
        // Jumat
        if (dayOfWeek === 5) {
          if (shiftCanon === 'shift_1_reguler') return { in_start:'07:00', in_end:'07:30', out_start:'16:00', out_end:'16:30', out_next_day:false }
          if (shiftCanon === 'shift_1_panjang') return { in_start:'07:00', in_end:'07:30', out_start:'19:00', out_end:'19:30', out_next_day:false }
          if (shiftCanon === 'shift_2_malam')   return { in_start:'19:00', in_end:'19:30', out_start:'07:00', out_end:'07:30', out_next_day:true  }
          // Backward compat: historical Shift I -> panjang, Shift II -> malam
          if (shiftCanon === 'Shift I')         return { in_start:'07:00', in_end:'07:30', out_start:'19:00', out_end:'19:30', out_next_day:false }
          if (shiftCanon === 'Shift II')        return { in_start:'19:00', in_end:'19:30', out_start:'07:00', out_end:'07:30', out_next_day:true  }
        }
        // Sabtu–Minggu
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          if (shiftCanon === 'Shift I')   return { in_start:'07:30', in_end:'08:00', out_start:'20:00', out_end:'20:30', out_next_day:false }
          if (shiftCanon === 'Shift II')  return { in_start:'20:00', in_end:'20:30', out_start:'07:30', out_end:'08:00', out_next_day:true  }
        }
        // Fallback Shift I Mon–Thu
        return { in_start:'07:00', in_end:'07:30', out_start:'16:00', out_end:'16:30', out_next_day:false }
      }

      // ── Resolve shift timings: DB day_groups → DB shifts legacy → defaults ──
      const dbGroupShift = getDayGroupShift(dayGroups, groupKey, canonicalShift)
      const defTimings = getDefaultShiftTimings(workDayOfWeek, canonicalShift)

      let timings: ShiftTimings
      if (dbGroupShift &&
          typeof dbGroupShift.in_start === 'string' &&
          typeof dbGroupShift.in_end === 'string' &&
          typeof dbGroupShift.out_start === 'string' &&
          typeof dbGroupShift.out_end === 'string') {
        // Primary: from day_groups in attendance_settings DB (normalized against authoritative rules)
        let inStart = dbGroupShift.in_start
        let inEnd = dbGroupShift.in_end
        let outStart = dbGroupShift.out_start
        let outEnd = dbGroupShift.out_end

        if (groupKey === 'mon_thu' && canonicalShift === 'Shift II' && inStart === '16:00') {
          inStart = defTimings.in_start
          inEnd = defTimings.in_end
        }
        if (groupKey === 'mon_thu' && canonicalShift === 'Shift III' && outStart === '07:00') {
          outStart = defTimings.out_start
          outEnd = defTimings.out_end
        }
        if (groupKey === 'friday' && canonicalShift === 'Shift I' && inStart === '07:30') {
          inStart = defTimings.in_start
          inEnd = defTimings.in_end
          outStart = defTimings.out_start
          outEnd = defTimings.out_end
        }
        if (groupKey === 'friday' && canonicalShift === 'Shift II' && inStart === '19:30') {
          inStart = defTimings.in_start
          inEnd = defTimings.in_end
          outStart = defTimings.out_start
          outEnd = defTimings.out_end
        }
        if (groupKey === 'weekend' && canonicalShift === 'Shift I' && inStart === '08:00') {
          inStart = defTimings.in_start
          inEnd = defTimings.in_end
        }
        if (groupKey === 'weekend' && canonicalShift === 'Shift II' && outStart === '08:00') {
          outStart = defTimings.out_start
          outEnd = defTimings.out_end
        }

        timings = {
          in_start:    inStart,
          in_end:      inEnd,
          out_start:   outStart,
          out_end:     outEnd,
          out_next_day: Boolean(dbGroupShift.out_next_day),
        }
      } else if (!isWeekendDay && !isFridayDay) {
        // Secondary: legacy shifts object (only valid for Mon–Thu Shift I/II/III)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawShift = (secScheduleData?.shifts?.[canonicalShift] || secScheduleData?.shifts?.[shiftStr]) as any
        const def = getDefaultShiftTimings(workDayOfWeek, canonicalShift)
        timings = {
          in_start:    (rawShift?.start        && typeof rawShift.start === 'string')        ? rawShift.start        : def.in_start,
          in_end:      (rawShift?.window_end   && typeof rawShift.window_end === 'string')   ? rawShift.window_end   : def.in_end,
          out_start:   (rawShift?.end          && typeof rawShift.end === 'string')          ? rawShift.end          : def.out_start,
          out_end:     (rawShift?.end_window_end && typeof rawShift.end_window_end === 'string') ? rawShift.end_window_end : def.out_end,
          out_next_day: typeof rawShift?.end_next_day === 'boolean' ? rawShift.end_next_day : def.out_next_day,
        }
      } else {
        // Fallback to authoritative defaults
        timings = getDefaultShiftTimings(workDayOfWeek, canonicalShift)
      }

      // Thu/Fri offset (only for Mon–Fri, never weekend)
      const shiftOffset = (!isWeekendDay && isShiftedDay) ? (Number(secScheduleData?.thursday_friday_shift_minutes) || 0) : 0
      if (shiftOffset > 0) {
        const fmtMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`
        timings = {
          in_start:    fmtMin(hhmm(timings.in_start)  + shiftOffset),
          in_end:      fmtMin(hhmm(timings.in_end)    + shiftOffset),
          out_start:   fmtMin(hhmm(timings.out_start) + shiftOffset),
          out_end:     fmtMin(hhmm(timings.out_end)   + shiftOffset),
          out_next_day: timings.out_next_day,
        }
      }

      scheduledStart = timings.in_start
      scheduledEnd   = timings.in_end

      if (attendance_type === 'masuk') {
        const startMins = hhmm(timings.in_start)
        const windowEndMins = hhmm(timings.in_end)
        // Overnight masuk post-midnight: add 1440 to treat as next-calendar-day minutes
        const effectiveCurrentMins = (workDate < jakartaDateToday) ? 1440 + currentMinutesFromMidnight : currentMinutesFromMidnight

        if (effectiveCurrentMins < startMins) {
          return new Response(
            JSON.stringify({
              error: `Presensi masuk ${shift} belum dibuka. Jendela presensi masuk dimulai pukul ${timings.in_start} WIB.`,
              error_code: 'WINDOW_NOT_OPEN',
              requires_reason: false,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (effectiveCurrentMins > windowEndMins) {
          attendanceStatus = 'terlambat'
          lateMinutes = effectiveCurrentMins - windowEndMins
          adminNotes = `Terlambat ${lateMinutes} menit (Masuk pukul ${jakartaTimeStr} WIB${workDate < jakartaDateToday ? ' (H+1)' : ''}, batas jendela ${timings.in_end} WIB)`
        } else {
          attendanceStatus = 'tepat_waktu'
          lateMinutes = 0
        }
      } else if (attendance_type === 'pulang') {
        scheduledStart = timings.out_start
        scheduledEnd   = timings.out_end
        const startMins = hhmm(timings.out_start)
        const windowEndMins = hhmm(timings.out_end)

        if (timings.out_next_day) {
          // Overnight shift: checkout only allowed on H+1 between out_start and out_end
          const [wY, wM, wD] = workDate.split('-').map(Number)
          const expectedCheckoutDate = new Date(Date.UTC(wY, wM - 1, wD + 1))
          const expectedCheckoutDateStr = expectedCheckoutDate.toISOString().slice(0, 10)

          if (jakartaDateToday < expectedCheckoutDateStr) {
            return new Response(
              JSON.stringify({
                error: `Presensi pulang ${shift} belum dibuka. Jendela presensi pulang dimulai besok pagi pukul ${timings.out_start} WIB (H+1).`,
                error_code: 'WINDOW_NOT_OPEN',
                requires_reason: false,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          } else if (jakartaDateToday === expectedCheckoutDateStr) {
            if (currentMinutesFromMidnight < startMins) {
              return new Response(
                JSON.stringify({
                  error: `Presensi pulang ${shift} belum dibuka. Jendela presensi pulang dimulai pukul ${timings.out_start} WIB (H+1).`,
                  error_code: 'WINDOW_NOT_OPEN',
                  requires_reason: false,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
            if (currentMinutesFromMidnight > windowEndMins) {
              return new Response(
                JSON.stringify({
                  error: `Jendela presensi pulang ${shift} telah ditutup pada pukul ${timings.out_end} WIB (H+1). Presensi pulang di luar jendela waktu tidak dapat dilakukan.`,
                  error_code: 'WINDOW_CLOSED',
                  requires_reason: false,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
          } else {
            // jakartaDateToday > expectedCheckoutDateStr (e.g. H+2 or later)
            return new Response(
              JSON.stringify({
                error: `Jendela presensi pulang ${shift} telah ditutup pada pukul ${timings.out_end} WIB (H+1). Presensi pulang di luar jendela waktu tidak dapat dilakukan.`,
                error_code: 'WINDOW_CLOSED',
                requires_reason: false,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        } else {
          // Same-day checkout: allowed on workDate between out_start and out_end
          if (jakartaDateToday === workDate) {
            if (currentMinutesFromMidnight < startMins) {
              return new Response(
                JSON.stringify({
                  error: `Presensi pulang ${shift} belum dibuka. Jendela presensi pulang dimulai pukul ${timings.out_start} WIB.`,
                  error_code: 'WINDOW_NOT_OPEN',
                  requires_reason: false,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
            if (currentMinutesFromMidnight > windowEndMins) {
              return new Response(
                JSON.stringify({
                  error: `Jendela presensi pulang ${shift} telah ditutup pada pukul ${timings.out_end} WIB. Presensi pulang di luar jendela waktu tidak dapat dilakukan.`,
                  error_code: 'WINDOW_CLOSED',
                  requires_reason: false,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
          } else {
            return new Response(
              JSON.stringify({
                error: `Jendela presensi pulang ${shift} telah ditutup pada pukul ${timings.out_end} WIB. Presensi pulang di luar jendela waktu tidak dapat dilakukan.`,
                error_code: 'WINDOW_CLOSED',
                requires_reason: false,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }

        attendanceStatus = 'tepat_waktu'
        lateMinutes = 0
      }
    }

    // 6b. Fetch Office Location & Radius Settings from attendance_settings
    let officeLat = -6.175392
    let officeLng = 106.827153
    let officeRadius = 100 // meters

    const { data: settingsRows } = await supabase
      .from('attendance_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['office_coordinates', 'office_radius_meters'])

    if (settingsRows) {
      for (const s of settingsRows) {
        if (s.setting_key === 'office_coordinates') {
          const coords = s.setting_value as {
            latitude?: number
            lat?: number
            longitude?: number
            lng?: number
          } | null
          if (coords) {
            const lat = coords.latitude ?? coords.lat
            const lng = coords.longitude ?? coords.lng
            if (lat !== undefined && !Number.isNaN(Number(lat))) officeLat = Number(lat)
            if (lng !== undefined && !Number.isNaN(Number(lng))) officeLng = Number(lng)
          }
        } else if (s.setting_key === 'office_radius_meters') {
          const rad = Number(s.setting_value)
          if (!Number.isNaN(rad) && rad > 0) officeRadius = rad
        }
      }
    }

    // 6c. Server-Side GPS Location & Geofence Validation
    // Required for 'masuk' and 'pulang' (also allowed for 'istirahat')
    let distanceMeters: number | null = null
    let isOutsideRadius = false
    const notesParts: string[] = []

    if (adminNotes) {
      notesParts.push(adminNotes)
    }

    if (attendance_type === 'masuk' || attendance_type === 'pulang') {
      if (latitude === null || longitude === null) {
        // Geolocation unavailable or permission denied
        if (!reason || reason.trim().length < 5) {
          return new Response(
            JSON.stringify({
              error: 'Lokasi GPS tidak terdeteksi. Harap izinkan akses lokasi pada browser atau sertakan alasan kendala lokasi (minimal 5 karakter).',
              requires_reason: true,
              reason_type: 'gps_missing',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        reviewStatus = 'perlu_tindak_lanjut'
        notesParts.push(`[GPS Tidak Tersedia] [Alasan: ${reason}]`)
      } else {
        // Calculate server-authoritative Haversine distance
        distanceMeters = calculateDistanceMeters(latitude, longitude, officeLat, officeLng)
        isOutsideRadius = distanceMeters > officeRadius

        if (isOutsideRadius) {
          if (!reason || reason.trim().length < 5) {
            return new Response(
              JSON.stringify({
                error: `Posisi Anda terdeteksi di luar radius kantor (${distanceMeters}m dari kantor, batas radius ${officeRadius}m). Harap sertakan alasan presensi di luar kantor (minimal 5 karakter).`,
                requires_reason: true,
                reason_type: 'outside_radius',
                distance_meters: distanceMeters,
                radius_meters: officeRadius,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          reviewStatus = 'perlu_tindak_lanjut'
          notesParts.push(
            `[Di Luar Radius: ${distanceMeters}m > ${officeRadius}m, Akurasi: ±${location_accuracy ? Math.round(location_accuracy) : '?'}m] [Alasan: ${reason}]`
          )
        } else {
          // Inside radius
          notesParts.push(
            `[GPS Valid: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} | Jarak: ${distanceMeters}m (Radius: ${officeRadius}m), Akurasi: ±${location_accuracy ? Math.round(location_accuracy) : '?'}m]`
          )
        }
      }
    }

    // 6d. Validate reason for Late Arrivals
    if (attendanceStatus === 'terlambat') {
      if (!reason || reason.trim().length < 5) {
        return new Response(
          JSON.stringify({
            error: `Presensi terlambat ${lateMinutes} menit. Harap sertakan alasan keterlambatan (minimal 5 karakter).`,
            requires_reason: true,
            reason_type: 'late',
            late_minutes: lateMinutes,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      reviewStatus = 'perlu_tindak_lanjut'
      if (!notesParts.some(p => p.includes(reason))) {
        notesParts.push(`[Alasan Keterlambatan: ${reason}]`)
      }
    }

    const finalAdminNotes = notesParts.length > 0 ? notesParts.join(' | ') : null

    // 7. Secure File Upload to Private Storage Bucket
    const secureStoragePath = `${workDate}/${idempotency_key}.${magicCheck.ext}`
    const { error: uploadError } = await supabase.storage
      .from('selfies')
      .upload(secureStoragePath, binaryData, {
        contentType: magicCheck.mime,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return new Response(
        JSON.stringify({ error: 'Gagal mengunggah foto selfie ke penyimpanan privat.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 8. Database Insert with Service Role
    const baseRecordPayload: Record<string, unknown> = {
      employee_name: authoritativeEmployeeName,
      normalized_name: authoritativeNormalizedName,
      employee_profile_id: matchedEmployee.id,
      auth_uid: matchedEmployee.auth_uid || (callerUser ? callerUser.id : null),
      category,
      attendance_type,
      shift: category === 'Security' ? shift : null,
      work_date: workDate,
      recorded_at: serverNow.toISOString(),
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      attendance_status: attendanceStatus,
      late_minutes: lateMinutes,
      selfie_storage_path: secureStoragePath,
      review_status: reviewStatus,
      admin_notes: finalAdminNotes,
      idempotency_key,
    }

    // Full payload including optional GPS & reason fields
    const fullPayload: Record<string, unknown> = {
      ...baseRecordPayload,
      ...(latitude !== null ? { latitude } : {}),
      ...(longitude !== null ? { longitude } : {}),
      ...(location_accuracy !== null ? { location_accuracy } : {}),
      ...(distanceMeters !== null && distanceMeters !== Infinity ? { distance_meters: distanceMeters } : {}),
      ...(reason ? { reason } : {}),
    }

    let insertRes = await supabase
      .from('attendance_records')
      .insert(fullPayload)
      .select()
      .single()

    // If dedicated columns don't exist yet in PostgreSQL schema, fallback to base payload with admin_notes
    if (insertRes.error && (insertRes.error.code === 'PGRST204' || insertRes.error.message?.includes('column'))) {
      insertRes = await supabase
        .from('attendance_records')
        .insert(baseRecordPayload)
        .select()
        .single()
    }

    if (insertRes.error) {
      // Check for concurrent unique constraint violation
      if (insertRes.error.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'Presensi ini sudah berhasil dicatat sebelumnya (duplikasi terdeteksi).' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      console.error('DB insert error:', insertRes.error)
      return new Response(
        JSON.stringify({ error: 'Gagal menyimpan catatan presensi ke database.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const insertedRecord = insertRes.data

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Presensi berhasil diverifikasi dan dicatat.',
        data: insertedRecord,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Kesalahan server internal tidak dikenal.'
    console.error('Submit attendance handler exception:', err)
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
