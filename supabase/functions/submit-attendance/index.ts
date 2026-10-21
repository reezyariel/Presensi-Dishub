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

    const supabase = createClient(supabaseUrl, serviceRoleKey)

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
    const shift = (typeof body.shift === 'string' ? body.shift : null) as 'Shift I' | 'Shift II' | 'Shift III' | null
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
      if (!shift || !['Shift I', 'Shift II', 'Shift III'].includes(shift)) {
        return new Response(
          JSON.stringify({ error: 'Pilih shift yang valid untuk Security (Shift I, Shift II, atau Shift III).' }),
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

    // 4b. Strict Whitelist Validation against employee_profiles (Fail-Safe)
    const normalizedName = normalizeName(employee_name)
    const { data: matchedEmployee, error: empErr } = await supabase
      .from('employee_profiles')
      .select('id, full_name, employee_role, is_active, auth_uid')
      .eq('normalized_name', normalizedName)
      .maybeSingle()

    if (empErr) {
      console.error('Database query error checking employee_profiles:', empErr)
      return new Response(
        JSON.stringify({ error: 'Gagal memverifikasi data pegawai di server database. Absensi dibatalkan demi keamanan.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!matchedEmployee) {
      return new Response(
        JSON.stringify({ error: `Pegawai "${employee_name}" tidak terdaftar dalam sistem ShiftTrack. Absensi ditolak.` }),
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

    // 4c. Determine Work Date (Shift III Crossover Linked to Masuk Record without Hardcoded 12:00)
    let workDate = jakartaDateToday
    if (category === 'Security' && shift === 'Shift III' && attendance_type === 'pulang') {
      const yesterday = new Date(serverNow.getTime() - 24 * 60 * 60 * 1000)
      const yesterdayDateStr = getJakartaDateString(yesterday)

      // Query database for open Shift III masuk record from yesterday or today
      const { data: openMasuk } = await supabase
        .from('attendance_records')
        .select('work_date, recorded_at')
        .eq('normalized_name', normalizedName)
        .eq('category', 'Security')
        .eq('shift', 'Shift III')
        .eq('attendance_type', 'masuk')
        .in('work_date', [yesterdayDateStr, jakartaDateToday])
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (openMasuk?.work_date) {
        // Linked authoritatively to the exact work_date when the shift started
        workDate = openMasuk.work_date
      } else {
        // Fallback: If no previous masuk record exists (e.g. forgot to check in),
        // any checkout before evening shift start (< 18:00 WIB) belongs to yesterday
        if (currentHour < 18) {
          workDate = yesterdayDateStr
        }
      }
    }

    // 5. Duplicate Attendance Prevention for Same Employee + Work Date + Type
    const { data: duplicateRecord } = await supabase
      .from('attendance_records')
      .select('id, recorded_at, attendance_type, work_date')
      .eq('normalized_name', normalizedName)
      .eq('work_date', workDate)
      .eq('attendance_type', attendance_type)
      .maybeSingle()

    if (duplicateRecord) {
      return new Response(
        JSON.stringify({
          error: `Pegawai ${employee_name} sudah melakukan presensi ${attendance_type.toUpperCase()} untuk tanggal kerja ${workDate}.`,
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

    // 6a. Fetch CS schedule from attendance_settings (source of truth for Admin config)
    // Defaults used if DB row missing or fields absent
    let csOpen:     string = '07:30'
    let csDeadline: string = '08:00'
    let csClose:    string = '11:59'

    if (category === 'CS') {
      const { data: csSettingRows } = await supabase
        .from('attendance_settings')
        .select('setting_value')
        .eq('setting_key', 'cs_schedule')
        .maybeSingle()

      if (csSettingRows?.setting_value) {
        const sv = csSettingRows.setting_value as {
          masuk?: { open?: string; ontime_deadline?: string; close?: string; start?: string; end?: string }
        }
        // Support both old schema (start/end) and new schema (open/ontime_deadline/close)
        const m = sv.masuk
        if (m) {
          csOpen     = m.open     ?? m.start ?? csOpen
          csDeadline = m.ontime_deadline ?? m.end ?? csDeadline
          csClose    = m.close    ?? csClose
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
      // Aturan CS Senin–Jumat (3-boundary system dari Admin settings):
      //   Sebelum open          → TOLAK (presensi tidak diizinkan)
      //   open – ontime_deadline  → tepat_waktu
      //   ontime_deadline+1 – close → terlambat, late_minutes dari ontime_deadline
      //   Setelah close         → TOLAK (jendela ditutup)
      // Tidak ada shift; istirahat dan pulang tidak dihitung keterlambatan.

      if (attendance_type === 'masuk') {
        scheduledStart = csOpen
        scheduledEnd   = csDeadline

        const openMins     = hhmm(csOpen)
        const deadlineMins = hhmm(csDeadline)
        const closeMins    = hhmm(csClose)

        // Tolak jika sebelum waktu buka
        if (currentMinutesFromMidnight < openMins) {
          return new Response(
            JSON.stringify({
              error: `Presensi masuk CS belum dibuka. Jendela check-in dimulai pukul ${csOpen} WIB.`,
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
        scheduledEnd   = '14:00'
        if (currentHour < 12 || currentHour >= 14) {
          reviewStatus = 'perlu_tindak_lanjut'
          adminNotes = `Istirahat di luar rentang jadwal resmi 12:00–14:00 (${jakartaTimeStr} WIB)`
        }
      } else if (attendance_type === 'pulang') {
        scheduledStart = '16:00'
        scheduledEnd   = '18:00'
        if (currentHour < 16 || currentHour >= 18) {
          reviewStatus = 'perlu_tindak_lanjut'
          adminNotes = `Pulang di luar rentang jadwal resmi 16:00–18:00 (${jakartaTimeStr} WIB)`
        }
      }
    } else if (category === 'Security') {
      // Jadwal Security resmi sesuai scheduleEngine (Kamis & Jumat bergeser +30 menit)
      let startH = 7
      let startM = 30

      if (shift === 'Shift I') {
        startH = isShiftedDay ? 8 : 7
        startM = isShiftedDay ? 0 : 30
        scheduledStart = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`
        scheduledEnd = isShiftedDay ? '16:30' : '16:00'
      } else if (shift === 'Shift II') {
        startH = 16
        startM = isShiftedDay ? 30 : 0
        scheduledStart = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`
        scheduledEnd = isShiftedDay ? '20:30' : '20:00'
      } else if (shift === 'Shift III') {
        startH = 20
        startM = isShiftedDay ? 30 : 0
        scheduledStart = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`
        scheduledEnd = isShiftedDay ? '08:00' : '07:30'
      }

      if (attendance_type === 'masuk') {
        const startMins = startH * 60 + startM
        if (currentMinutesFromMidnight > startMins) {
          attendanceStatus = 'terlambat'
          lateMinutes = currentMinutesFromMidnight - startMins
          adminNotes = `Terlambat ${lateMinutes} menit (Masuk pukul ${jakartaTimeStr} WIB)`
        }
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
      employee_name,
      normalized_name: normalizedName,
      employee_profile_id: matchedEmployee.id,
      auth_uid: matchedEmployee.auth_uid || null,
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
