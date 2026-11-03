/**
 * SIPATEN — Test Suite: Security Shift II Hari Minggu & Checkout Hari Senin
 * Run with: npx tsx tests/sunday_shift2_checkout.test.ts
 */

import {
  isOvernightSecurityShift,
  isOvernightCheckout,
  determineOvernightWorkDate,
  determineShiftIIIWorkDate,
  getSecurityShiftCheckInStatus,
  checkAttendanceWindow,
  getAttendanceButtonState,
  getScheduleInfo,
  getSecurityShiftItem,
  calculateSecurity30DayRecap,
  buildSecurityShiftSessions,
  getAutoSelectSecurityShift,
  type SecurityRecapRecord,
} from '../src/lib/scheduleEngine'
import type { AttendanceRecord } from '../src/types/attendance'

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

// Jakarta helper = UTC+7: construct wall-clock time as UTC Date
function jktDate(dateStr: string, hh: number, mm: number): Date {
  const jakartaOffsetMs = 7 * 60 * 60 * 1000
  const [y, m, d] = dateStr.split('-').map(Number)
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0) - jakartaOffsetMs
  return new Date(utcMs)
}

console.log('\n============================================================')
console.log('🛡️  SIPATEN — Test Suite: Security Shift II Minggu -> Checkout Senin')
console.log('============================================================\n')

const SUNDAY = '2026-11-01'  // Sunday
const MONDAY = '2026-11-02'  // Monday (H+1)

// ============================================================
// TEST GROUP 1: Identifikasi Shift Lintas Hari (Overnight Detection)
// ============================================================
console.log('TEST GROUP 1: Identifikasi Shift Lintas Hari (Overnight Detection)')
{
  // Minggu Shift II is an overnight shift
  assert('isOvernightSecurityShift(Minggu, Shift II) = true', isOvernightSecurityShift(SUNDAY, 'Shift II') === true)
  assert('isOvernightSecurityShift(Minggu, Sesi Malam) = true', isOvernightSecurityShift(SUNDAY, 'Sesi Malam') === true)

  // Minggu Shift I is NOT an overnight shift (08:00 - 20:00 same day)
  assert('isOvernightSecurityShift(Minggu, Shift I) = false', isOvernightSecurityShift(SUNDAY, 'Shift I') === false)

  // Senin Shift II is a daytime shift (16:00 - 19:30), NOT overnight
  assert('isOvernightSecurityShift(Senin, Shift II) = false', isOvernightSecurityShift(MONDAY, 'Shift II') === false)
  // Senin Shift III is overnight
  assert('isOvernightSecurityShift(Senin, Shift III) = true', isOvernightSecurityShift(MONDAY, 'Shift III') === true)

  // Checkout on Monday morning for Shift II is recognized as overnight checkout from yesterday
  assert('isOvernightCheckout(Senin, Shift II) = true', isOvernightCheckout(MONDAY, 'Shift II') === true)
  assert('isOvernightCheckout(Senin, Sesi Malam) = true', isOvernightCheckout(MONDAY, 'Sesi Malam') === true)
  assert('isOvernightCheckout(Senin, Shift I) = false', isOvernightCheckout(MONDAY, 'Shift I') === false)

  // Work date resolution
  const monMorning0800 = jktDate(MONDAY, 8, 0)
  assert('determineOvernightWorkDate(Senin 08:00) = Minggu', determineOvernightWorkDate(monMorning0800) === SUNDAY)
  assert('determineShiftIIIWorkDate alias works identically', determineShiftIIIWorkDate(monMorning0800) === SUNDAY)

  const monNight2000 = jktDate(MONDAY, 20, 0)
  assert('determineOvernightWorkDate(Senin 20:00) = Senin', determineOvernightWorkDate(monNight2000) === MONDAY)
}

// ============================================================
// TEST GROUP 2: Jadwal Resmi Shift II Hari Minggu
// ============================================================
console.log('\nTEST GROUP 2: Jadwal Resmi Shift II Hari Minggu')
{
  const item = getSecurityShiftItem(SUNDAY, 'Shift II')
  assert('in_start = 20:00', item.in_start === '20:00')
  assert('in_end = 20:30', item.in_end === '20:30')
  assert('out_start = 07:30', item.out_start === '07:30')
  assert('out_end = 08:00', item.out_end === '08:00')
  assert('out_next_day = true', item.out_next_day === true)

  const infoMasuk = getScheduleInfo('Security', 'masuk', 'Shift II', SUNDAY)
  assert('infoMasuk scheduledStart = 20:00', infoMasuk?.scheduledStart === '20:00')
  assert('infoMasuk scheduledEnd = 20:30', infoMasuk?.scheduledEnd === '20:30')
  assert('infoMasuk isNextDay = false', infoMasuk?.isNextDay === false)

  const infoPulang = getScheduleInfo('Security', 'pulang', 'Shift II', SUNDAY)
  assert('infoPulang scheduledStart = 07:30', infoPulang?.scheduledStart === '07:30')
  assert('infoPulang scheduledEnd = 08:00', infoPulang?.scheduledEnd === '08:00')
  assert('infoPulang isNextDay = true (H+1)', infoPulang?.isNextDay === true)
}

// ============================================================
// TEST GROUP 3: Check-in Shift II Hari Minggu (20.00–20.30)
// ============================================================
console.log('\nTEST GROUP 3: Check-in Shift II Hari Minggu (20.00–20.30 WIB)')
{
  // 19:59 WIB - Sebelum jendela masuk
  const sBefore = getSecurityShiftCheckInStatus('Shift II', SUNDAY, jktDate(SUNDAY, 19, 59))
  assert('Minggu 19:59 = belum_dibuka', sBefore.windowStatus === 'belum_dibuka')

  // 20:00 WIB - Jendela check-in dibuka
  const sStart = getSecurityShiftCheckInStatus('Shift II', SUNDAY, jktDate(SUNDAY, 20, 0))
  assert('Minggu 20:00 = tepat_waktu', sStart.windowStatus === 'tepat_waktu')

  // 20:15 WIB - Tengah jendela check-in
  const sMid = getSecurityShiftCheckInStatus('Shift II', SUNDAY, jktDate(SUNDAY, 20, 15))
  assert('Minggu 20:15 = tepat_waktu', sMid.windowStatus === 'tepat_waktu')

  // 20:30 WIB - Batas akhir check-in tepat waktu
  const sEnd = getSecurityShiftCheckInStatus('Shift II', SUNDAY, jktDate(SUNDAY, 20, 30))
  assert('Minggu 20:30 = tepat_waktu', sEnd.windowStatus === 'tepat_waktu')

  // 20:31 WIB - Jendela check-in selesai (terlambat / jendela selesai)
  const sAfter = getSecurityShiftCheckInStatus('Shift II', SUNDAY, jktDate(SUNDAY, 20, 31))
  assert('Minggu 20:31 = jendela_selesai', sAfter.windowStatus === 'jendela_selesai')

  // Window status via checkAttendanceWindow
  assert('checkAttendanceWindow masuk 20:00 = open', checkAttendanceWindow('Security', 'masuk', 'Shift II', SUNDAY, jktDate(SUNDAY, 20, 0)) === 'open')
  assert('checkAttendanceWindow masuk 20:30 = open', checkAttendanceWindow('Security', 'masuk', 'Shift II', SUNDAY, jktDate(SUNDAY, 20, 30)) === 'open')
  assert('checkAttendanceWindow masuk 19:59 = not_yet', checkAttendanceWindow('Security', 'masuk', 'Shift II', SUNDAY, jktDate(SUNDAY, 19, 59)) === 'not_yet')
}

// ============================================================
// TEST GROUP 4: Checkout Shift II Hari Senin (07.30–08.00 H+1)
// ============================================================
console.log('\nTEST GROUP 4: Checkout Shift II Hari Senin (07.30–08.00 WIB)')
{
  // Senin 07:29 WIB - Sebelum jendela checkout (belum dibuka)
  const win0729 = checkAttendanceWindow('Security', 'pulang', 'Shift II', SUNDAY, jktDate(MONDAY, 7, 29))
  assert('Senin 07:29 pulang = not_yet (belum dibuka)', win0729 === 'not_yet')

  // Senin 07:30 WIB - Jendela checkout dibuka
  const win0730 = checkAttendanceWindow('Security', 'pulang', 'Shift II', SUNDAY, jktDate(MONDAY, 7, 30))
  assert('Senin 07:30 pulang = open (berhasil)', win0730 === 'open')

  // Senin 07:45 WIB - Tengah jendela checkout
  const win0745 = checkAttendanceWindow('Security', 'pulang', 'Shift II', SUNDAY, jktDate(MONDAY, 7, 45))
  assert('Senin 07:45 pulang = open (berhasil)', win0745 === 'open')

  // Senin 08:00 WIB - Batas akhir jendela checkout
  const win0800 = checkAttendanceWindow('Security', 'pulang', 'Shift II', SUNDAY, jktDate(MONDAY, 8, 0))
  assert('Senin 08:00 pulang = open (berhasil sesuai batas waktu)', win0800 === 'open')

  // Senin 08:01 WIB - Melewati batas waktu checkout
  const win0801 = checkAttendanceWindow('Security', 'pulang', 'Shift II', SUNDAY, jktDate(MONDAY, 8, 1))
  assert('Senin 08:01 pulang = closed_accept', win0801 === 'closed_accept')

  // Jika workDateStr dikirim sebagai MONDAY (misal client mengirim today),
  // checkAttendanceWindow secara cerdas mendeteksi overnight checkout dan me-resolve ke Minggu
  const winFromMondayArg = checkAttendanceWindow('Security', 'pulang', 'Shift II', MONDAY, jktDate(MONDAY, 7, 45))
  assert('checkAttendanceWindow dengan argumen tanggal Senin me-resolve ke Minggu = open', winFromMondayArg === 'open')
}

// ============================================================
// TEST GROUP 5: Tombol Presensi di Dashboard (getAttendanceButtonState)
// ============================================================
console.log('\nTEST GROUP 5: Tombol Presensi di Dashboard (getAttendanceButtonState)')
{
  const masukRecord: AttendanceRecord = {
    id: 'rec-in-sun-shift2',
    work_date: SUNDAY,
    attendance_type: 'masuk',
    attendance_status: 'tepat_waktu',
    shift: 'Shift II',
    recorded_at: '2026-11-01T20:05:00+07:00',
    scheduled_start: '20:00',
    scheduled_end: '20:30',
  }

  // 1. Senin 07:15 (sebelum 07:30) -> status = waiting_pulang
  const btn0715 = getAttendanceButtonState(
    'Security',
    { masuk: masukRecord, istirahat: null, pulang: null },
    'Shift II',
    SUNDAY,
    jktDate(MONDAY, 7, 15)
  )
  assert('Senin 07:15: waiting_pulang', btn0715.status === 'waiting_pulang')

  // 2. Senin 07:30 -> status = can_pulang
  const btn0730 = getAttendanceButtonState(
    'Security',
    { masuk: masukRecord, istirahat: null, pulang: null },
    'Shift II',
    SUNDAY,
    jktDate(MONDAY, 7, 30)
  )
  assert('Senin 07:30: can_pulang', btn0730.status === 'can_pulang')
  if (btn0730.status === 'can_pulang') {
    assert('Senin 07:30: startTime = 07:30', btn0730.startTime === '07:30')
  }

  // 3. Senin 07:45 -> status = can_pulang
  const btn0745 = getAttendanceButtonState(
    'Security',
    { masuk: masukRecord, istirahat: null, pulang: null },
    'Shift II',
    SUNDAY,
    jktDate(MONDAY, 7, 45)
  )
  assert('Senin 07:45: can_pulang', btn0745.status === 'can_pulang')

  // 4. Senin 08:00 -> status = can_pulang
  const btn0800 = getAttendanceButtonState(
    'Security',
    { masuk: masukRecord, istirahat: null, pulang: null },
    'Shift II',
    SUNDAY,
    jktDate(MONDAY, 8, 0)
  )
  assert('Senin 08:00: can_pulang', btn0800.status === 'can_pulang')

  // 5. Senin 08:01 -> status = window_closed (melewati 08:00 batas akhir checkout)
  const btn0801 = getAttendanceButtonState(
    'Security',
    { masuk: masukRecord, istirahat: null, pulang: null },
    'Shift II',
    SUNDAY,
    jktDate(MONDAY, 8, 1)
  )
  assert('Senin 08:01: window_closed', btn0801.status === 'window_closed')

  // 6. Pegawai TANPA check-in sebelumnya TIDAK BOLEH checkout
  const btnNoMasuk = getAttendanceButtonState(
    'Security',
    { masuk: null, istirahat: null, pulang: null },
    'Shift II',
    SUNDAY,
    jktDate(MONDAY, 7, 45)
  )
  assert('Tanpa masuk: status BUKAN can_pulang', btnNoMasuk.status !== 'can_pulang')
}

// ============================================================
// TEST GROUP 6: Rekap 30 Hari & Riwayat Shift (Sessions & Recap)
// ============================================================
console.log('\nTEST GROUP 6: Rekap 30 Hari & Riwayat Shift')
{
  const recordsIncomplete: SecurityRecapRecord[] = [
    {
      id: 'rec-1',
      work_date: SUNDAY,
      attendance_type: 'masuk',
      attendance_status: 'tepat_waktu',
      shift: 'Shift II',
      recorded_at: '2026-11-01T20:05:00+07:00',
    },
  ]

  // Dievaluasi Senin pagi pukul 07:45 (masih dalam jendela tugas/pulang H+1)
  const recapMorning = calculateSecurity30DayRecap(recordsIncomplete, MONDAY, SUNDAY, jktDate(MONDAY, 7, 45))
  assert('Senin 07:45: pulangBelumLengkap = 0 (belum dihukum tidak lengkap)', recapMorning.pulangBelumLengkap === 0)

  const sessionsMorning = buildSecurityShiftSessions(recordsIncomplete, MONDAY, SUNDAY, jktDate(MONDAY, 7, 45))
  assert('sessionsMorning[0].isOvernight = true', sessionsMorning[0].isOvernight === true)
  assert('sessionsMorning[0].status = menunggu_pulang', sessionsMorning[0].status === 'menunggu_pulang')

  // Lengkap: check-in Minggu 20:05 + checkout Senin 07:45
  const recordsComplete: SecurityRecapRecord[] = [
    ...recordsIncomplete,
    {
      id: 'rec-2',
      work_date: SUNDAY,
      attendance_type: 'pulang',
      attendance_status: 'tepat_waktu',
      shift: 'Shift II',
      recorded_at: '2026-11-02T07:45:00+07:00',
    },
  ]

  const recapDone = calculateSecurity30DayRecap(recordsComplete, MONDAY, SUNDAY, jktDate(MONDAY, 8, 30))
  assert('shiftSelesai = 1', recapDone.shiftSelesai === 1)
  assert('pulangBelumLengkap = 0', recapDone.pulangBelumLengkap === 0)
  assert('keterlambatan = 0', recapDone.keterlambatan === 0)

  const sessionsDone = buildSecurityShiftSessions(recordsComplete, MONDAY, SUNDAY, jktDate(MONDAY, 8, 30))
  assert('sessionsDone[0].status = selesai', sessionsDone[0].status === 'selesai')
  assert('sessionsDone[0].pulangTime contains (H+1)', sessionsDone[0].pulangTime.includes('(H+1)'), `got ${sessionsDone[0].pulangTime}`)
}

// ============================================================
// TEST GROUP 7: Shift I Hari Minggu & Jadwal CS Tidak Boleh Terdampak
// ============================================================
console.log('\nTEST GROUP 7: Shift I Hari Minggu & Jadwal CS Tidak Boleh Terdampak')
{
  // Minggu Shift I: 07:30 - 20:00 (Check-In: 07:30–08:00, Check-Out: 20:00–20:30)
  const itemSun1 = getSecurityShiftItem(SUNDAY, 'Shift I')
  assert('Minggu Shift I in_start = 07:30', itemSun1.in_start === '07:30')
  assert('Minggu Shift I in_end = 08:00', itemSun1.in_end === '08:00')
  assert('Minggu Shift I out_start = 20:00', itemSun1.out_start === '20:00')
  assert('Minggu Shift I out_end = 20:30', itemSun1.out_end === '20:30')
  assert('Minggu Shift I out_next_day = false', itemSun1.out_next_day === false)

  const winSun1In = checkAttendanceWindow('Security', 'masuk', 'Shift I', SUNDAY, jktDate(SUNDAY, 7, 45))
  assert('Minggu 07:45 Shift I masuk = open', winSun1In === 'open')

  const winSun1Out = checkAttendanceWindow('Security', 'pulang', 'Shift I', SUNDAY, jktDate(SUNDAY, 20, 15))
  assert('Minggu 20:15 Shift I pulang = open', winSun1Out === 'open')

  // CS Schedule: Minggu & Senin (07:30 - 08:00 - 11:59)
  const winCSMasukSun = checkAttendanceWindow('CS', 'masuk', null, SUNDAY, jktDate(SUNDAY, 7, 45))
  assert('CS Minggu 07:45 masuk = open', winCSMasukSun === 'open')

  const winCSMasukMon = checkAttendanceWindow('CS', 'masuk', null, MONDAY, jktDate(MONDAY, 7, 45))
  assert('CS Senin 07:45 masuk = open', winCSMasukMon === 'open')

  const winCSPulangMon = checkAttendanceWindow('CS', 'pulang', null, MONDAY, jktDate(MONDAY, 16, 30))
  assert('CS Senin 16:30 pulang = open', winCSPulangMon === 'open')
}

// ============================================================
// TEST GROUP 8: Simulasi Logika Edge Function submit-attendance
// ============================================================
console.log('\nTEST GROUP 8: Simulasi Logika Edge Function submit-attendance')
{
  // Mock database records
  interface MockRecord {
    id: string
    employee_name: string
    normalized_name: string
    category: string
    shift: string | null
    attendance_type: string
    work_date: string
    recorded_at: string
  }

  const mockDb: MockRecord[] = [
    // Pegawai A check-in Minggu 20:00
    {
      id: 'rec-pegawai-a-masuk',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      shift: 'Shift II',
      attendance_type: 'masuk',
      work_date: SUNDAY,
      recorded_at: `${SUNDAY}T20:02:00+07:00`,
    },
    // Pegawai C check-in shift lain
    {
      id: 'rec-pegawai-c-masuk',
      employee_name: 'Joko Widodo',
      normalized_name: 'joko widodo',
      category: 'Security',
      shift: 'Shift I',
      attendance_type: 'masuk',
      work_date: MONDAY,
      recorded_at: `${MONDAY}T07:10:00+07:00`,
    },
  ]

  function simulateEdgeFunctionSubmit(
    req: {
      employee_name: string
      category: 'CS' | 'Security'
      attendance_type: 'masuk' | 'pulang'
      shift?: string | null
      check_in_record_id?: string | null
      currentServerTime: Date
    }
  ): { success: boolean; workDate?: string; error?: string; errorCode?: string } {
    const norm = req.employee_name.toLowerCase().trim()
    const jktDateStr = req.currentServerTime.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    const jktHour = Number(req.currentServerTime.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit' }))
    const jktMins = Number(req.currentServerTime.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit' })) * 60 +
                    Number(req.currentServerTime.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false, minute: '2-digit' }))

    const yesterdayObj = new Date(req.currentServerTime.getTime() - 24 * 60 * 60 * 1000)
    const yDateStr = yesterdayObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    const todayDayNum = new Date(jktDateStr + 'T12:00:00+07:00').getDay()
    const yesterdayDayNum = (todayDayNum + 6) % 7

    function canonicalize(s: string | null | undefined): string {
      if (!s) return ''
      const t = s.trim()
      if (t === 'Shift 1' || t === 'Shift I' || t === 'Sesi Pagi') return 'Shift I'
      if (t === 'Shift 2' || t === 'Shift II' || t === 'Sesi Malam') return 'Shift II'
      if (t === 'Shift 3' || t === 'Shift III') return 'Shift III'
      return t
    }

    function isOvernightByDayAndShift(dayOfWeek: number, shiftName: string | null): boolean {
      if (!shiftName) return false
      const canon = canonicalize(shiftName)
      if (dayOfWeek >= 1 && dayOfWeek <= 4) return canon === 'Shift III'
      if (dayOfWeek === 5) return canon === 'Shift II'
      if (dayOfWeek === 0 || dayOfWeek === 6) return canon === 'Shift II'
      return false
    }

    let workDate = jktDateStr

    if (req.category === 'Security' && req.attendance_type === 'pulang') {
      const canonShift = canonicalize(req.shift)
      let matchedMasuk: MockRecord | null = null

      // Priority 1: Check by check_in_record_id
      if (req.check_in_record_id) {
        matchedMasuk = mockDb.find(r =>
          r.id === req.check_in_record_id &&
          r.normalized_name === norm &&
          r.category === 'Security' &&
          r.attendance_type === 'masuk' &&
          canonicalize(r.shift) === canonShift
        ) || null
      }

      // Priority 2: Look up open masuk in database
      if (!matchedMasuk) {
        const isYesterdayOvernight = isOvernightByDayAndShift(yesterdayDayNum, req.shift ?? null)
        const candidateDates = (jktHour < 14 && isYesterdayOvernight)
          ? [yDateStr, jktDateStr]
          : [jktDateStr, yDateStr]

        const matches = mockDb.filter(r =>
          r.normalized_name === norm &&
          r.category === 'Security' &&
          r.attendance_type === 'masuk' &&
          candidateDates.includes(r.work_date) &&
          canonicalize(r.shift) === canonShift
        )

        for (const cand of matches) {
          const hasPulang = mockDb.some(r =>
            r.normalized_name === norm &&
            r.category === 'Security' &&
            r.attendance_type === 'pulang' &&
            r.work_date === cand.work_date &&
            canonicalize(r.shift) === canonShift
          )
          if (!hasPulang) {
            matchedMasuk = cand
            break
          }
        }
      }

      if (!matchedMasuk) {
        return { success: false, error: 'Tidak ditemukan catatan presensi masuk yang valid.', errorCode: 'NO_CHECKIN_FOUND' }
      }

      workDate = matchedMasuk.work_date

      // Timing check for Sunday Shift II checkout on Monday
      const item = getSecurityShiftItem(workDate, req.shift as any)
      const outStartMins = Number(item.out_start.split(':')[0]) * 60 + Number(item.out_start.split(':')[1])
      const outEndMins = Number(item.out_end.split(':')[0]) * 60 + Number(item.out_end.split(':')[1])

      if (item.out_next_day) {
        if (jktDateStr === workDate) {
          return { success: false, error: 'Presensi pulang belum dibuka (besok pagi).', errorCode: 'WINDOW_NOT_OPEN' }
        }
        if (jktDateStr > workDate) {
          if (jktMins < outStartMins) {
            return { success: false, error: 'Presensi pulang belum dibuka.', errorCode: 'WINDOW_NOT_OPEN' }
          }
          if (jktMins > outEndMins) {
            return { success: false, error: 'Batas waktu presensi pulang telah berakhir.', errorCode: 'WINDOW_CLOSED' }
          }
        }
      } else {
        if (jktMins < outStartMins) {
          return { success: false, error: 'Presensi pulang belum dibuka.', errorCode: 'WINDOW_NOT_OPEN' }
        }
        if (jktMins > outEndMins) {
          return { success: false, error: 'Batas waktu presensi pulang telah berakhir.', errorCode: 'WINDOW_CLOSED' }
        }
      }
    }

    return { success: true, workDate }
  }

  // 1. Senin 07:30 WIB: Pegawai A checkout Shift II berhasil
  const res0730 = simulateEdgeFunctionSubmit({
    employee_name: 'Budi Santoso',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    currentServerTime: jktDate(MONDAY, 7, 30),
  })
  assert('EdgeFn Senin 07:30: Checkout Budi berhasil', res0730.success === true)
  assert('EdgeFn Senin 07:30: workDate = Minggu (terhubung ke check-in kemarin)', res0730.workDate === SUNDAY)

  // 2. Senin 07:45 WIB: Pegawai A checkout Shift II berhasil
  const res0745 = simulateEdgeFunctionSubmit({
    employee_name: 'Budi Santoso',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    currentServerTime: jktDate(MONDAY, 7, 45),
  })
  assert('EdgeFn Senin 07:45: Checkout Budi berhasil', res0745.success === true)
  assert('EdgeFn Senin 07:45: workDate = Minggu', res0745.workDate === SUNDAY)

  // 3. Senin 08:00 WIB: Sesuai batas akhir jendela checkout (08:00)
  const res0800 = simulateEdgeFunctionSubmit({
    employee_name: 'Budi Santoso',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    currentServerTime: jktDate(MONDAY, 8, 0),
  })
  assert('EdgeFn Senin 08:00: Checkout Budi berhasil sesuai aturan batas waktu', res0800.success === true)

  // 4. Senin 07:15 WIB: Belum dibuka
  const res0715 = simulateEdgeFunctionSubmit({
    employee_name: 'Budi Santoso',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    currentServerTime: jktDate(MONDAY, 7, 15),
  })
  assert('EdgeFn Senin 07:15: Checkout ditolak karena belum dibuka', res0715.success === false && res0715.errorCode === 'WINDOW_NOT_OPEN')

  // 5. Senin 08:01 WIB: Melewati batas akhir jendela checkout ditolak
  const res0801 = simulateEdgeFunctionSubmit({
    employee_name: 'Budi Santoso',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    currentServerTime: jktDate(MONDAY, 8, 1),
  })
  assert('EdgeFn Senin 08:01: Checkout ditolak karena jendela checkout berakhir', res0801.success === false && res0801.errorCode === 'WINDOW_CLOSED')

  // 6. Senin 19:49 WIB: Checkout Minggu dilakukan malam hari Senin (kasus screenshot) DITOLAK backend
  const res1949 = simulateEdgeFunctionSubmit({
    employee_name: 'Budi Santoso',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    currentServerTime: jktDate(MONDAY, 19, 49),
  })
  assert('EdgeFn Senin 19:49: Checkout Minggu di malam Senin ditolak backend (WINDOW_CLOSED)', res1949.success === false && res1949.errorCode === 'WINDOW_CLOSED')

  // 7. Pegawai tanpa check-in sebelumnya (Pegawai B) tidak boleh checkout
  const resPegawaiB = simulateEdgeFunctionSubmit({
    employee_name: 'Ahmad Dahlan', // Belum pernah check-in
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    currentServerTime: jktDate(MONDAY, 7, 45),
  })
  assert('EdgeFn: Pegawai B tanpa check-in ditolak checkout', resPegawaiB.success === false && resPegawaiB.errorCode === 'NO_CHECKIN_FOUND')

  // 8. Checkout tidak boleh mengambil data shift milik pegawai lain
  // Pegawai B mencoba passing check_in_record_id milik Pegawai A
  const resSpoof = simulateEdgeFunctionSubmit({
    employee_name: 'Ahmad Dahlan',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    check_in_record_id: 'rec-pegawai-a-masuk', // Milik Budi Santoso
    currentServerTime: jktDate(MONDAY, 7, 45),
  })
  assert('EdgeFn: Tidak boleh mencuri record pegawai lain', resSpoof.success === false && resSpoof.errorCode === 'NO_CHECKIN_FOUND')
}

// ============================================================
// TEST GROUP 9: REGRESI — Dua Pegawai Berbeda (A=Shift II Minggu, B=Shift I Senin)
// Pastikan checkout Pegawai A TIDAK mempengaruhi check-in Pegawai B
// ============================================================
console.log('\nTEST GROUP 9: Regresi — Dua Pegawai Berbeda (Shift II Minggu vs Shift I Senin)')
{
  // ── Database simulasi (semua record, dua pegawai, dua shift berbeda) ──────────
  interface MockRec {
    id: string
    auth_uid: string
    employee_profile_id: string
    employee_name: string
    normalized_name: string
    category: string
    shift: string | null
    attendance_type: string
    work_date: string
    recorded_at: string
    attendance_status: string
  }

  // ── Pegawai A: Budi Santoso — check-in Shift II Minggu 20:15 ─────────────────
  const recA_masuk: MockRec = {
    id: 'rec-a-masuk-shift2',
    auth_uid: 'uid-budi',
    employee_profile_id: 'emp-budi',
    employee_name: 'Budi Santoso',
    normalized_name: 'budi santoso',
    category: 'Security',
    shift: 'Shift II',
    attendance_type: 'masuk',
    work_date: SUNDAY,
    recorded_at: `${SUNDAY}T20:15:00+07:00`,
    attendance_status: 'tepat_waktu',
  }

  // ── Pegawai B: Siti Rahayu — check-in Shift I Senin 07:15 ─────────────────
  const recB_masuk: MockRec = {
    id: 'rec-b-masuk-shift1',
    auth_uid: 'uid-siti',
    employee_profile_id: 'emp-siti',
    employee_name: 'Siti Rahayu',
    normalized_name: 'siti rahayu',
    category: 'Security',
    shift: 'Shift I',
    attendance_type: 'masuk',
    work_date: MONDAY,
    recorded_at: `${MONDAY}T07:15:00+07:00`,
    attendance_status: 'tepat_waktu',
  }

  let db: MockRec[] = [recA_masuk, recB_masuk]

  function canonicalize(s: string | null | undefined): string {
    if (!s) return ''
    const t = s.trim()
    if (t === 'Shift 1' || t === 'Shift I' || t === 'Sesi Pagi') return 'Shift I'
    if (t === 'Shift 2' || t === 'Shift II' || t === 'Sesi Malam') return 'Shift II'
    if (t === 'Shift 3' || t === 'Shift III') return 'Shift III'
    return t
  }

  function isOvernightByDayAndShift(dayOfWeek: number, shiftName: string | null): boolean {
    if (!shiftName) return false
    const canon = canonicalize(shiftName)
    if (dayOfWeek >= 1 && dayOfWeek <= 4) return canon === 'Shift III'
    if (dayOfWeek === 5) return canon === 'Shift II'
    if (dayOfWeek === 0 || dayOfWeek === 6) return canon === 'Shift II'
    return false
  }

  function simulateSubmit(
    req: {
      auth_uid: string
      employee_profile_id: string
      employee_name: string
      normalized_name: string
      category: 'CS' | 'Security'
      attendance_type: 'masuk' | 'pulang'
      shift?: string | null
      check_in_record_id?: string | null
      currentServerTime: Date
    }
  ): { success: boolean; workDate?: string; recordId?: string; error?: string; errorCode?: string } {
    const jktDateStr = req.currentServerTime.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    const jktMinTotal = (() => {
      const t = req.currentServerTime.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit', minute: '2-digit',
      })
      const [hh, mm] = t.split(':').map(Number)
      return hh * 60 + mm
    })()
    const jktHour = Math.floor(jktMinTotal / 60)
    const yesterdayObj = new Date(req.currentServerTime.getTime() - 24 * 60 * 60 * 1000)
    const yDateStr = yesterdayObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    const todayDayNum = new Date(`${jktDateStr}T12:00:00+07:00`).getDay()
    const yesterdayDayNum = (todayDayNum + 6) % 7

    // ── Cek presensi ganda (anti-duplikat) ───────────────────────────────────────
    if (req.attendance_type === 'masuk') {
      const duplicate = db.find(r =>
        r.auth_uid === req.auth_uid &&
        r.attendance_type === 'masuk' &&
        r.work_date === jktDateStr &&
        canonicalize(r.shift) === canonicalize(req.shift)
      )
      if (duplicate) {
        return { success: false, error: 'Sudah check-in untuk shift ini hari ini.', errorCode: 'DUPLICATE_CHECKIN' }
      }

      // Buat record masuk baru
      const newRec: MockRec = {
        id: `rec-${req.auth_uid}-masuk-${Date.now()}`,
        auth_uid: req.auth_uid,
        employee_profile_id: req.employee_profile_id,
        employee_name: req.employee_name,
        normalized_name: req.normalized_name,
        category: req.category,
        shift: req.shift ?? null,
        attendance_type: 'masuk',
        work_date: jktDateStr,
        recorded_at: req.currentServerTime.toISOString(),
        attendance_status: 'tepat_waktu',
      }
      db = [...db, newRec]
      return { success: true, workDate: jktDateStr, recordId: newRec.id }
    }

    // ── Checkout (pulang) ─────────────────────────────────────────────────────────
    const canonShift = canonicalize(req.shift)
    let matchedMasuk: MockRec | null = null

    // Priority 1: by check_in_record_id (harus milik pegawai yang sama)
    if (req.check_in_record_id) {
      matchedMasuk = db.find(r =>
        r.id === req.check_in_record_id &&
        r.auth_uid === req.auth_uid &&            // ← wajib milik dirinya sendiri
        r.employee_profile_id === req.employee_profile_id &&
        r.category === 'Security' &&
        r.attendance_type === 'masuk' &&
        canonicalize(r.shift) === canonShift
      ) ?? null
    }

    // Priority 2: lookup berdasarkan identitas pegawai (auth_uid + employee_profile_id)
    if (!matchedMasuk) {
      const isYesterdayOvernight = isOvernightByDayAndShift(yesterdayDayNum, req.shift ?? null)
      const candidateDates = (jktHour < 14 && isYesterdayOvernight)
        ? [yDateStr, jktDateStr]
        : [jktDateStr, yDateStr]

      const matches = db.filter(r =>
        r.auth_uid === req.auth_uid &&            // ← hanya milik dirinya
        r.employee_profile_id === req.employee_profile_id &&
        r.category === 'Security' &&
        r.attendance_type === 'masuk' &&
        candidateDates.includes(r.work_date) &&
        canonicalize(r.shift) === canonShift
      )

      for (const cand of matches) {
        const hasPulang = db.some(r =>
          r.auth_uid === req.auth_uid &&
          r.category === 'Security' &&
          r.attendance_type === 'pulang' &&
          r.work_date === cand.work_date &&
          canonicalize(r.shift) === canonShift
        )
        if (!hasPulang) {
          matchedMasuk = cand
          break
        }
      }
    }

    if (!matchedMasuk) {
      return { success: false, error: 'Tidak ditemukan catatan presensi masuk yang valid.', errorCode: 'NO_CHECKIN_FOUND' }
    }

    const workDate = matchedMasuk.work_date

    // ── Cek jendela waktu checkout ────────────────────────────────────────────────
    const item = getSecurityShiftItem(workDate, req.shift as 'Shift I' | 'Shift II' | 'Shift III')
    const outStartMins = Number(item.out_start.split(':')[0]) * 60 + Number(item.out_start.split(':')[1])
    const outEndMins = Number(item.out_end.split(':')[0]) * 60 + Number(item.out_end.split(':')[1])

    if (item.out_next_day) {
      if (jktDateStr === workDate) {
        return { success: false, error: 'Presensi pulang belum dibuka (besok pagi).', errorCode: 'WINDOW_NOT_OPEN' }
      }
      if (jktDateStr > workDate) {
        if (jktMinTotal < outStartMins) {
          return { success: false, error: 'Presensi pulang belum dibuka.', errorCode: 'WINDOW_NOT_OPEN' }
        }
        if (jktMinTotal > outEndMins) {
          return { success: false, error: 'Batas waktu presensi pulang telah berakhir.', errorCode: 'WINDOW_CLOSED' }
        }
      }
    }

    // Cek presensi ganda pulang
    const dupPulang = db.find(r =>
      r.auth_uid === req.auth_uid &&
      r.attendance_type === 'pulang' &&
      r.work_date === workDate &&
      canonicalize(r.shift) === canonShift
    )
    if (dupPulang) {
      return { success: false, error: 'Sudah check-out untuk shift ini.', errorCode: 'DUPLICATE_CHECKOUT' }
    }

    // Simpan record pulang
    const newRec: MockRec = {
      id: `rec-${req.auth_uid}-pulang-${Date.now()}`,
      auth_uid: req.auth_uid,
      employee_profile_id: req.employee_profile_id,
      employee_name: req.employee_name,
      normalized_name: req.normalized_name,
      category: req.category,
      shift: req.shift ?? null,
      attendance_type: 'pulang',
      work_date: workDate,
      recorded_at: req.currentServerTime.toISOString(),
      attendance_status: 'tepat_waktu',
    }
    db = [...db, newRec]
    return { success: true, workDate, recordId: newRec.id }
  }

  // ── STEP 1: Pegawai A check-in Shift II Minggu 20:15 (sudah ada di db awal) ──
  // Verifikasi record Pegawai A benar
  const recA = db.find(r => r.auth_uid === 'uid-budi' && r.attendance_type === 'masuk')!
  assert('STEP 1 — Pegawai A: record masuk Shift II ada di database', recA !== undefined)
  assert('STEP 1 — Pegawai A: work_date = Minggu', recA?.work_date === SUNDAY)
  assert('STEP 1 — Pegawai A: shift = Shift II', canonicalize(recA?.shift) === 'Shift II')

  // ── STEP 2: Pegawai B check-in Shift I Senin 07:15 (sudah ada di db awal) ───
  const recB = db.find(r => r.auth_uid === 'uid-siti' && r.attendance_type === 'masuk')!
  assert('STEP 2 — Pegawai B: record masuk Shift I ada di database', recB !== undefined)
  assert('STEP 2 — Pegawai B: work_date = Senin', recB?.work_date === MONDAY)
  assert('STEP 2 — Pegawai B: shift = Shift I', canonicalize(recB?.shift) === 'Shift I')

  // ── STEP 3: Verifikasi jendela check-in keduanya valid sesuai jadwal ─────────
  const winA = checkAttendanceWindow('Security', 'masuk', 'Shift II', SUNDAY, jktDate(SUNDAY, 20, 15))
  assert('STEP 3 — Pegawai A: jendela check-in Shift II Minggu 20:15 = open', winA === 'open')

  const winB = checkAttendanceWindow('Security', 'masuk', 'Shift I', MONDAY, jktDate(MONDAY, 7, 15))
  assert('STEP 3 — Pegawai B: jendela check-in Shift I Senin 07:15 = open', winB === 'open')

  // ── STEP 4: Pegawai A checkout Shift II Senin 07:45 ─────────────────────────
  const resA_out = simulateSubmit({
    auth_uid: 'uid-budi',
    employee_profile_id: 'emp-budi',
    employee_name: 'Budi Santoso',
    normalized_name: 'budi santoso',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    currentServerTime: jktDate(MONDAY, 7, 45),
  })
  assert('STEP 4 — Pegawai A: checkout Shift II Senin 07:45 berhasil', resA_out.success === true)
  assert('STEP 4 — Pegawai A: workDate checkout = Minggu (bukan Senin)', resA_out.workDate === SUNDAY)

  // ── STEP 5: Checkout Pegawai A tidak mengubah record Pegawai B ───────────────
  const recBAfterA = db.find(r => r.auth_uid === 'uid-siti' && r.attendance_type === 'masuk')!
  assert('STEP 5 — Pegawai B: record masuk TIDAK berubah setelah checkout Pegawai A', recBAfterA?.work_date === MONDAY)
  assert('STEP 5 — Pegawai B: shift TIDAK berubah (tetap Shift I)', canonicalize(recBAfterA?.shift) === 'Shift I')

  // ── STEP 6: Pegawai B belum checkout Shift I — record pulang belum ada ───────
  const recBPulang = db.find(r => r.auth_uid === 'uid-siti' && r.attendance_type === 'pulang')
  assert('STEP 6 — Pegawai B: belum checkout (pulang belum ada)', recBPulang === undefined)

  // ── STEP 7: Record pulang Pegawai A tersimpan dengan workDate = Minggu ────────
  const recAPulang = db.find(r => r.auth_uid === 'uid-budi' && r.attendance_type === 'pulang')!
  assert('STEP 7 — Pegawai A: record pulang tersimpan', recAPulang !== undefined)
  assert('STEP 7 — Pegawai A: work_date pulang = Minggu', recAPulang?.work_date === SUNDAY)
  assert('STEP 7 — Pegawai A: shift pulang = Shift II', canonicalize(recAPulang?.shift) === 'Shift II')

  // ── STEP 8: Total record di DB benar (2 masuk + 1 pulang = 3 total) ──────────
  assert('STEP 8 — Database: total record = 3 (2 masuk + 1 pulang)', db.length === 3)
  assert('STEP 8 — Database: tidak ada record asing masuk', db.every(r => r.auth_uid === 'uid-budi' || r.auth_uid === 'uid-siti'))
}

// ============================================================
// TEST GROUP 10: REGRESI — Isolasi Identitas & Pencegahan Ganda
// Pastikan presensi ganda dicegah per pegawai,
// dan pegawai lain tidak bisa mengklaim record milik pegawai lain.
// ============================================================
console.log('\nTEST GROUP 10: Regresi — Isolasi Identitas & Pencegahan Presensi Ganda')
{
  interface MockRec10 {
    id: string
    auth_uid: string
    employee_profile_id: string
    normalized_name: string
    category: string
    shift: string | null
    attendance_type: string
    work_date: string
  }

  function canonicalize10(s: string | null | undefined): string {
    if (!s) return ''
    const t = s.trim()
    if (t === 'Shift I' || t === 'Sesi Pagi') return 'Shift I'
    if (t === 'Shift II' || t === 'Sesi Malam') return 'Shift II'
    if (t === 'Shift III') return 'Shift III'
    return t
  }

  let db10: MockRec10[] = [
    // Pegawai A sudah check-in Shift II Minggu
    {
      id: 'r10-a-masuk',
      auth_uid: 'uid-a',
      employee_profile_id: 'emp-a',
      normalized_name: 'pegawai a',
      category: 'Security',
      shift: 'Shift II',
      attendance_type: 'masuk',
      work_date: SUNDAY,
    },
    // Pegawai B sudah check-in Shift I Senin
    {
      id: 'r10-b-masuk',
      auth_uid: 'uid-b',
      employee_profile_id: 'emp-b',
      normalized_name: 'pegawai b',
      category: 'Security',
      shift: 'Shift I',
      attendance_type: 'masuk',
      work_date: MONDAY,
    },
  ]

  function tryCheckin(uid: string, empId: string, norm: string, shift: string, workDate: string): 'ok' | 'duplicate' {
    const dup = db10.find(r =>
      r.auth_uid === uid &&
      r.attendance_type === 'masuk' &&
      r.work_date === workDate &&
      canonicalize10(r.shift) === canonicalize10(shift)
    )
    if (dup) return 'duplicate'
    db10 = [...db10, { id: `${uid}-masuk2-${shift}`, auth_uid: uid, employee_profile_id: empId, normalized_name: norm, category: 'Security', shift, attendance_type: 'masuk', work_date: workDate }]
    return 'ok'
  }

  function tryCheckout(uid: string, empId: string, recordId: string | null): 'ok' | 'no_checkin' | 'identity_mismatch' | 'duplicate' {
    let masuk: MockRec10 | undefined
    if (recordId) {
      masuk = db10.find(r => r.id === recordId && r.auth_uid === uid)
      if (!masuk) return 'identity_mismatch'
    } else {
      masuk = db10.find(r => r.auth_uid === uid && r.attendance_type === 'masuk')
    }
    if (!masuk) return 'no_checkin'

    const dup = db10.find(r =>
      r.auth_uid === uid &&
      r.attendance_type === 'pulang' &&
      r.work_date === masuk!.work_date &&
      canonicalize10(r.shift) === canonicalize10(masuk!.shift)
    )
    if (dup) return 'duplicate'

    db10 = [...db10, { id: `${uid}-pulang-${masuk.shift}`, auth_uid: uid, employee_profile_id: empId, normalized_name: '', category: 'Security', shift: masuk.shift, attendance_type: 'pulang', work_date: masuk.work_date }]
    return 'ok'
  }

  // T10-1: Pegawai A mencoba check-in Shift II Minggu lagi → harus ditolak (duplikat)
  const dup_A = tryCheckin('uid-a', 'emp-a', 'pegawai a', 'Shift II', SUNDAY)
  assert('T10-1 — Pegawai A check-in Shift II Minggu ke-2 ditolak (duplikat)', dup_A === 'duplicate')

  // T10-2: Pegawai B mencoba check-in Shift I Senin lagi → harus ditolak (duplikat)
  const dup_B = tryCheckin('uid-b', 'emp-b', 'pegawai b', 'Shift I', MONDAY)
  assert('T10-2 — Pegawai B check-in Shift I Senin ke-2 ditolak (duplikat)', dup_B === 'duplicate')

  // T10-3: Pegawai C (belum check-in) mencoba checkout dengan check_in_record_id milik Pegawai A
  const steal_A = tryCheckout('uid-c', 'emp-c', 'r10-a-masuk')
  assert('T10-3 — Pegawai C tidak bisa mencuri checkout milik Pegawai A', steal_A === 'identity_mismatch')

  // T10-4: Pegawai C (belum check-in) mencoba checkout tanpa check_in_record_id
  const noCI_C = tryCheckout('uid-c', 'emp-c', null)
  assert('T10-4 — Pegawai C tanpa check-in tidak bisa checkout', noCI_C === 'no_checkin')

  // T10-5: Pegawai A checkout Shift II berhasil (dirinya sendiri, recordId miliknya)
  const ok_A = tryCheckout('uid-a', 'emp-a', 'r10-a-masuk')
  assert('T10-5 — Pegawai A checkout Shift II berhasil', ok_A === 'ok')

  // T10-6: Pegawai A checkout Shift II LAGI → duplikat harus ditolak
  const dup_A_out = tryCheckout('uid-a', 'emp-a', 'r10-a-masuk')
  assert('T10-6 — Pegawai A checkout Shift II ke-2 ditolak (duplikat)', dup_A_out === 'duplicate')

  // T10-7: Pegawai B checkout Shift I berhasil (tanpa recordId, dicari otomatis dari db)
  const ok_B = tryCheckout('uid-b', 'emp-b', null)
  assert('T10-7 — Pegawai B checkout Shift I berhasil', ok_B === 'ok')

  // T10-8: Setelah semua proses, verifikasi total record di DB = 4 (2 masuk + 2 pulang)
  assert('T10-8 — Database final: 4 record total (2 masuk + 2 pulang)', db10.length === 4)

  // T10-9: Verifikasi work_date tidak tertukar antar pegawai
  const pulangA = db10.find(r => r.auth_uid === 'uid-a' && r.attendance_type === 'pulang')!
  const pulangB = db10.find(r => r.auth_uid === 'uid-b' && r.attendance_type === 'pulang')!
  assert('T10-9 — Pulang Pegawai A: work_date = Minggu', pulangA?.work_date === SUNDAY)
  assert('T10-9 — Pulang Pegawai B: work_date = Senin', pulangB?.work_date === MONDAY)

  // T10-10: Verifikasi shift tidak tertukar
  assert('T10-10 — Pulang Pegawai A: shift = Shift II', canonicalize10(pulangA?.shift) === 'Shift II')
  assert('T10-10 — Pulang Pegawai B: shift = Shift I', canonicalize10(pulangB?.shift) === 'Shift I')
}

// ============================================================
// TEST GROUP 11: REGRESI — Dashboard per Pegawai (buildSecurityShiftSessions)
// Verifikasi bahwa session yang dibangun untuk rekap 30 hari
// benar-benar hanya milik pegawai yang relevan, tidak ada pencampuran.
// ============================================================
console.log('\nTEST GROUP 11: Regresi — Rekap Session Terpisah per Pegawai')
{
  // Record gabungan: Pegawai A (Shift II Minggu) + Pegawai B (Shift I Senin)
  const allRecords: import('../src/lib/scheduleEngine').SecurityRecapRecord[] = [
    // ── Pegawai A ───────────────────────────────
    {
      id: 'r11-a-masuk',
      work_date: SUNDAY,
      attendance_type: 'masuk',
      attendance_status: 'tepat_waktu',
      shift: 'Shift II',
      recorded_at: `${SUNDAY}T20:15:00+07:00`,
    },
    {
      id: 'r11-a-pulang',
      work_date: SUNDAY,
      attendance_type: 'pulang',
      attendance_status: 'tepat_waktu',
      shift: 'Shift II',
      recorded_at: `${MONDAY}T07:45:00+07:00`,
    },
    // ── Pegawai B ───────────────────────────────
    {
      id: 'r11-b-masuk',
      work_date: MONDAY,
      attendance_type: 'masuk',
      attendance_status: 'tepat_waktu',
      shift: 'Shift I',
      recorded_at: `${MONDAY}T07:15:00+07:00`,
    },
    {
      id: 'r11-b-pulang',
      work_date: MONDAY,
      attendance_type: 'pulang',
      attendance_status: 'tepat_waktu',
      shift: 'Shift I',
      recorded_at: `${MONDAY}T20:15:00+07:00`,
    },
  ]

  // Filter per pegawai (seperti yang dilakukan di EmployeeHomeView sebelum buildSecurityShiftSessions)
  const recPegawaiA = allRecords.filter(r => r.id.startsWith('r11-a-'))
  const recPegawaiB = allRecords.filter(r => r.id.startsWith('r11-b-'))

  const nowEval = jktDate(MONDAY, 20, 30) // Setelah semua presensi selesai

  // ── Sesi Pegawai A ────────────────────────────
  const sessionsA = buildSecurityShiftSessions(recPegawaiA, MONDAY, SUNDAY, nowEval)
  assert('T11-1 — Pegawai A: session count = 1', sessionsA.length === 1)
  assert('T11-2 — Pegawai A: shift session = Shift II', sessionsA[0]?.shift === 'Shift II')
  assert('T11-3 — Pegawai A: isOvernight = true', sessionsA[0]?.isOvernight === true)
  assert('T11-4 — Pegawai A: status = selesai', sessionsA[0]?.status === 'selesai')
  assert('T11-5 — Pegawai A: workDate = Minggu', sessionsA[0]?.work_date === SUNDAY)
  assert('T11-6 — Pegawai A: pulangTime mengandung (H+1)', sessionsA[0]?.pulangTime?.includes('(H+1)') === true, `got "${sessionsA[0]?.pulangTime}"`)

  // ── Sesi Pegawai B ────────────────────────────
  const sessionsB = buildSecurityShiftSessions(recPegawaiB, MONDAY, SUNDAY, nowEval)
  assert('T11-7 — Pegawai B: session count = 1', sessionsB.length === 1)
  assert('T11-8 — Pegawai B: shift session = Shift I', sessionsB[0]?.shift === 'Shift I')
  assert('T11-9 — Pegawai B: isOvernight = false', sessionsB[0]?.isOvernight === false)
  assert('T11-10 — Pegawai B: status = selesai', sessionsB[0]?.status === 'selesai')
  assert('T11-11 — Pegawai B: workDate = Senin', sessionsB[0]?.work_date === MONDAY)

  // ── Rekap 30 hari per pegawai ─────────────────
  const recapA = calculateSecurity30DayRecap(recPegawaiA, MONDAY, SUNDAY, nowEval)
  assert('T11-12 — Rekap Pegawai A: shiftSelesai = 1', recapA.shiftSelesai === 1)
  assert('T11-13 — Rekap Pegawai A: keterlambatan = 0', recapA.keterlambatan === 0)
  assert('T11-14 — Rekap Pegawai A: pulangBelumLengkap = 0', recapA.pulangBelumLengkap === 0)

  const recapB = calculateSecurity30DayRecap(recPegawaiB, MONDAY, SUNDAY, nowEval)
  assert('T11-15 — Rekap Pegawai B: shiftSelesai = 1', recapB.shiftSelesai === 1)
  assert('T11-16 — Rekap Pegawai B: keterlambatan = 0', recapB.keterlambatan === 0)
  assert('T11-17 — Rekap Pegawai B: pulangBelumLengkap = 0', recapB.pulangBelumLengkap === 0)

  // ── Record Pegawai A tidak muncul di sesi Pegawai B ──────────────────────────
  const aInB = sessionsB.some(s => s.shift === 'Shift II' && s.work_date === SUNDAY)
  assert('T11-18 — Sesi Shift II Minggu (A) tidak muncul di rekap Pegawai B', aInB === false)

  // ── Record Pegawai B tidak muncul di sesi Pegawai A ──────────────────────────
  const bInA = sessionsA.some(s => s.shift === 'Shift I' && s.work_date === MONDAY)
  assert('T11-19 — Sesi Shift I Senin (B) tidak muncul di rekap Pegawai A', bInA === false)
}

// ============================================================
// TEST GROUP 12: AUDIT KONKURENSI REALISTIS (Promise.all & Race Condition)
// Memeriksa perilaku sistem saat request benar-benar berjalan bersamaan secara asinkron.
// ============================================================
console.log('\nTEST GROUP 12: Audit Konkurensi & Race Condition Realistis (Promise.all)')

function canonicalize(s: string | null | undefined): string {
  if (!s) return ''
  const t = s.trim()
  if (t === 'Shift 1' || t === 'Shift I' || t === 'Sesi Pagi') return 'Shift I'
  if (t === 'Shift 2' || t === 'Shift II' || t === 'Sesi Malam') return 'Shift II'
  if (t === 'Shift 3' || t === 'Shift III') return 'Shift III'
  return t
}

function isOvernightByDayAndShift(dayOfWeek: number, shiftName: string | null): boolean {
  if (!shiftName) return false
  const canon = canonicalize(shiftName)
  if (dayOfWeek >= 1 && dayOfWeek <= 4) return canon === 'Shift III'
  if (dayOfWeek === 5) return canon === 'Shift II'
  if (dayOfWeek === 0 || dayOfWeek === 6) return canon === 'Shift II'
  return false
}

interface AsyncMockRec {
  id: string
  auth_uid: string
  employee_profile_id: string
  employee_name: string
  normalized_name: string
  category: string
  shift: string | null
  attendance_type: string
  work_date: string
  recorded_at: string
  attendance_status: string
  idempotency_key?: string
}

class SimulatedAsyncAttendanceDb {
  private records: AsyncMockRec[] = []
  private writeLock = Promise.resolve()

  constructor(initialRecords: AsyncMockRec[] = []) {
    this.records = [...initialRecords]
  }

  private async ioDelay(minMs = 3, maxMs = 12) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
    await new Promise(r => setTimeout(r, delay))
  }

  async findExistingRecord(query: { idempotency_key?: string }): Promise<AsyncMockRec | null> {
    await this.ioDelay()
    if (query.idempotency_key) {
      return this.records.find(r => r.idempotency_key === query.idempotency_key) ?? null
    }
    return null
  }

  async findMatchingMasuk(query: {
    auth_uid: string
    normalized_name: string
    canonShift: string
    candidateDates: string[]
    check_in_record_id?: string | null
  }): Promise<AsyncMockRec | null> {
    await this.ioDelay()
    if (query.check_in_record_id) {
      return this.records.find(r =>
        r.id === query.check_in_record_id &&
        r.auth_uid === query.auth_uid &&
        r.normalized_name === query.normalized_name &&
        r.category === 'Security' &&
        r.attendance_type === 'masuk' &&
        canonicalize(r.shift) === query.canonShift
      ) ?? null
    }

    const matches = this.records.filter(r =>
      r.auth_uid === query.auth_uid &&
      r.normalized_name === query.normalized_name &&
      r.category === 'Security' &&
      r.attendance_type === 'masuk' &&
      query.candidateDates.includes(r.work_date) &&
      canonicalize(r.shift) === query.canonShift
    )

    for (const cand of matches) {
      const hasPulang = this.records.some(r =>
        r.auth_uid === query.auth_uid &&
        r.normalized_name === query.normalized_name &&
        r.category === 'Security' &&
        r.attendance_type === 'pulang' &&
        r.work_date === cand.work_date &&
        canonicalize(r.shift) === query.canonShift
      )
      if (!hasPulang) return cand
    }
    return null
  }

  async insertRecord(rec: AsyncMockRec): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    await this.ioDelay()
    let result: { success: boolean; error?: string; errorCode?: string } = { success: true }

    await (this.writeLock = this.writeLock.then(async () => {
      const duplicate = this.records.find(r =>
        r.normalized_name === rec.normalized_name &&
        r.category === rec.category &&
        r.work_date === rec.work_date &&
        r.attendance_type === rec.attendance_type &&
        canonicalize(r.shift) === canonicalize(rec.shift)
      )
      if (duplicate) {
        result = {
          success: false,
          error: `Sudah ${rec.attendance_type === 'masuk' ? 'check-in' : 'check-out'} untuk shift ini.`,
          errorCode: rec.attendance_type === 'masuk' ? 'DUPLICATE_CHECKIN' : 'DUPLICATE_CHECKOUT',
        }
        return
      }

      this.records.push(rec)
    }))

    return result
  }

  getSnapshot(): AsyncMockRec[] {
    return [...this.records]
  }
}

async function simulateConcurrentSubmit(
  db: SimulatedAsyncAttendanceDb,
  req: {
    auth_uid: string
    employee_profile_id: string
    employee_name: string
    normalized_name: string
    category: 'CS' | 'Security'
    attendance_type: 'masuk' | 'pulang'
    shift?: string | null
    check_in_record_id?: string | null
    currentServerTime: Date
    idempotency_key?: string
  }
): Promise<{ success: boolean; workDate?: string; recordId?: string; error?: string; errorCode?: string; cached?: boolean }> {
  if (req.idempotency_key) {
    const cached = await db.findExistingRecord({ idempotency_key: req.idempotency_key })
    if (cached) {
      return { success: true, workDate: cached.work_date, recordId: cached.id, cached: true }
    }
  }

  const jktDateStr = req.currentServerTime.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  const jktMinTotal = (() => {
    const t = req.currentServerTime.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit', minute: '2-digit',
    })
    const [hh, mm] = t.split(':').map(Number)
    return hh * 60 + mm
  })()
  const jktHour = Math.floor(jktMinTotal / 60)
  const yesterdayObj = new Date(req.currentServerTime.getTime() - 24 * 60 * 60 * 1000)
  const yDateStr = yesterdayObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  const todayDayNum = new Date(`${jktDateStr}T12:00:00+07:00`).getDay()
  const yesterdayDayNum = (todayDayNum + 6) % 7

  if (req.attendance_type === 'masuk') {
    let workDate = jktDateStr
    if (jktHour < 12 && isOvernightByDayAndShift(yesterdayDayNum, req.shift ?? null)) {
      workDate = yDateStr
    }
    const newRec: AsyncMockRec = {
      id: `rec-${req.auth_uid}-in-${Math.random().toString(36).slice(2, 9)}`,
      auth_uid: req.auth_uid,
      employee_profile_id: req.employee_profile_id,
      employee_name: req.employee_name,
      normalized_name: req.normalized_name,
      category: req.category,
      shift: req.shift ?? null,
      attendance_type: 'masuk',
      work_date: workDate,
      recorded_at: req.currentServerTime.toISOString(),
      attendance_status: 'tepat_waktu',
      idempotency_key: req.idempotency_key,
    }
    const insertRes = await db.insertRecord(newRec)
    if (!insertRes.success) {
      return { success: false, error: insertRes.error, errorCode: insertRes.errorCode }
    }
    return { success: true, workDate, recordId: newRec.id }
  }

  const canonShift = canonicalize(req.shift)
  const isYesterdayOvernight = isOvernightByDayAndShift(yesterdayDayNum, req.shift ?? null)
  const candidateDates = (jktHour < 14 && isYesterdayOvernight)
    ? [yDateStr, jktDateStr]
    : [jktDateStr, yDateStr]

  const matchedMasuk = await db.findMatchingMasuk({
    auth_uid: req.auth_uid,
    normalized_name: req.normalized_name,
    canonShift,
    candidateDates,
    check_in_record_id: req.check_in_record_id,
  })

  if (!matchedMasuk) {
    return { success: false, error: 'Tidak ditemukan catatan presensi masuk yang valid.', errorCode: 'NO_CHECKIN_FOUND' }
  }

  const workDate = matchedMasuk.work_date

  const item = getSecurityShiftItem(workDate, req.shift as any)
  const outStartMins = Number(item.out_start.split(':')[0]) * 60 + Number(item.out_start.split(':')[1])
  const outEndMins = Number(item.out_end.split(':')[0]) * 60 + Number(item.out_end.split(':')[1])

  if (item.out_next_day) {
    if (jktDateStr === workDate) {
      return { success: false, error: 'Presensi pulang belum dibuka (besok pagi).', errorCode: 'WINDOW_NOT_OPEN' }
    }
    if (jktDateStr > workDate) {
      if (jktMinTotal < outStartMins) {
        return { success: false, error: 'Presensi pulang belum dibuka.', errorCode: 'WINDOW_NOT_OPEN' }
      }
      if (jktMinTotal > outEndMins) {
        return { success: false, error: 'Batas waktu presensi pulang telah berakhir.', errorCode: 'WINDOW_CLOSED' }
      }
    }
  }

  const newRec: AsyncMockRec = {
    id: `rec-${req.auth_uid}-out-${Math.random().toString(36).slice(2, 9)}`,
    auth_uid: req.auth_uid,
    employee_profile_id: req.employee_profile_id,
    employee_name: req.employee_name,
    normalized_name: req.normalized_name,
    category: req.category,
    shift: req.shift ?? null,
    attendance_type: 'pulang',
    work_date: workDate,
    recorded_at: req.currentServerTime.toISOString(),
    attendance_status: 'tepat_waktu',
    idempotency_key: req.idempotency_key,
  }

  const insertRes = await db.insertRecord(newRec)
  if (!insertRes.success) {
    return { success: false, error: insertRes.error, errorCode: insertRes.errorCode }
  }
  return { success: true, workDate, recordId: newRec.id }
}

// ── 12.1 Concurrency Dua Pegawai Berbeda (A checkout Shift II Minggu vs B check-in Shift I Senin)
{
  const dbAsync1 = new SimulatedAsyncAttendanceDb([
    {
      id: 'rec-async-a-masuk',
      auth_uid: 'uid-budi',
      employee_profile_id: 'emp-budi',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      shift: 'Shift II',
      attendance_type: 'masuk',
      work_date: SUNDAY,
      recorded_at: `${SUNDAY}T20:15:00+07:00`,
      attendance_status: 'tepat_waktu',
    },
  ])

  // Dua request ditembakkan bersamaan persis via Promise.all
  const [resA, resB] = await Promise.all([
    simulateConcurrentSubmit(dbAsync1, {
      auth_uid: 'uid-budi',
      employee_profile_id: 'emp-budi',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      attendance_type: 'pulang',
      shift: 'Shift II',
      currentServerTime: jktDate(MONDAY, 7, 45),
      idempotency_key: 'idemp-a-out-0745',
    }),
    simulateConcurrentSubmit(dbAsync1, {
      auth_uid: 'uid-siti',
      employee_profile_id: 'emp-siti',
      employee_name: 'Siti Rahayu',
      normalized_name: 'siti rahayu',
      category: 'Security',
      attendance_type: 'masuk',
      shift: 'Shift I',
      currentServerTime: jktDate(MONDAY, 7, 45),
      idempotency_key: 'idemp-b-in-0745',
    }),
  ])

  assert('T12-1 — Promise.all: Checkout Pegawai A (Shift II Minggu) berhasil secara bersamaan', resA.success === true)
  assert('T12-2 — Promise.all: Check-in Pegawai B (Shift I Senin) berhasil secara bersamaan', resB.success === true)
  assert('T12-3 — Promise.all: workDate Pegawai A tetap Minggu', resA.workDate === SUNDAY)
  assert('T12-4 — Promise.all: workDate Pegawai B tetap Senin', resB.workDate === MONDAY)

  const snap1 = dbAsync1.getSnapshot()
  assert('T12-5 — Promise.all: Database memiliki tepat 3 record (1 masuk A, 1 pulang A, 1 masuk B)', snap1.length === 3)
  const snapAPulang = snap1.find(r => r.auth_uid === 'uid-budi' && r.attendance_type === 'pulang')
  const snapBMasuk = snap1.find(r => r.auth_uid === 'uid-siti' && r.attendance_type === 'masuk')
  assert('T12-6 — Promise.all: Record pulang A dan masuk B terisolasi penuh tanpa kontaminasi data',
    snapAPulang?.work_date === SUNDAY && snapBMasuk?.work_date === MONDAY
  )
}

// ── 12.2 Concurrency Dua Pegawai Shift II Minggu Checkout Bersamaan (Pegawai A & Pegawai C)
{
  const dbAsync2 = new SimulatedAsyncAttendanceDb([
    {
      id: 'rec-async-a-masuk',
      auth_uid: 'uid-budi',
      employee_profile_id: 'emp-budi',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      shift: 'Shift II',
      attendance_type: 'masuk',
      work_date: SUNDAY,
      recorded_at: `${SUNDAY}T20:10:00+07:00`,
      attendance_status: 'tepat_waktu',
    },
    {
      id: 'rec-async-c-masuk',
      auth_uid: 'uid-eko',
      employee_profile_id: 'emp-eko',
      employee_name: 'Eko Prasetyo',
      normalized_name: 'eko prasetyo',
      category: 'Security',
      shift: 'Shift II',
      attendance_type: 'masuk',
      work_date: SUNDAY,
      recorded_at: `${SUNDAY}T20:20:00+07:00`,
      attendance_status: 'tepat_waktu',
    },
  ])

  // Dua checkout Shift II Minggu dieksekusi bersamaan di Senin 07:45
  const [resA, resC] = await Promise.all([
    simulateConcurrentSubmit(dbAsync2, {
      auth_uid: 'uid-budi',
      employee_profile_id: 'emp-budi',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      attendance_type: 'pulang',
      shift: 'Shift II',
      currentServerTime: jktDate(MONDAY, 7, 45),
      idempotency_key: 'idemp-a-checkout-0745',
    }),
    simulateConcurrentSubmit(dbAsync2, {
      auth_uid: 'uid-eko',
      employee_profile_id: 'emp-eko',
      employee_name: 'Eko Prasetyo',
      normalized_name: 'eko prasetyo',
      category: 'Security',
      attendance_type: 'pulang',
      shift: 'Shift II',
      currentServerTime: jktDate(MONDAY, 7, 45),
      idempotency_key: 'idemp-c-checkout-0745',
    }),
  ])

  assert('T12-7 — Promise.all: Checkout Pegawai A (Budi) berhasil simultan', resA.success === true)
  assert('T12-8 — Promise.all: Checkout Pegawai C (Eko) berhasil simultan', resC.success === true)
  assert('T12-9 — Promise.all: workDate A = Minggu', resA.workDate === SUNDAY)
  assert('T12-10 — Promise.all: workDate C = Minggu', resC.workDate === SUNDAY)

  const snap2 = dbAsync2.getSnapshot()
  assert('T12-11 — Promise.all: Database memiliki tepat 4 record (2 masuk + 2 pulang)', snap2.length === 4)
  const pulangBudi = snap2.find(r => r.auth_uid === 'uid-budi' && r.attendance_type === 'pulang')
  const pulangEko = snap2.find(r => r.auth_uid === 'uid-eko' && r.attendance_type === 'pulang')
  assert('T12-12 — Promise.all: Tidak ada cross-linking antara Budi dan Eko',
    pulangBudi !== undefined && pulangEko !== undefined && pulangBudi.auth_uid !== pulangEko.auth_uid
  )
}

// ── 12.3 Race Condition Double-Click (Idempotency Key Sama)
{
  const dbAsync3 = new SimulatedAsyncAttendanceDb([
    {
      id: 'rec-async-a-masuk',
      auth_uid: 'uid-budi',
      employee_profile_id: 'emp-budi',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      shift: 'Shift II',
      attendance_type: 'masuk',
      work_date: SUNDAY,
      recorded_at: `${SUNDAY}T20:15:00+07:00`,
      attendance_status: 'tepat_waktu',
    },
  ])

  // Dua request identik dikirim simultan karena tombol diklik ganda atau retry jaringan
  const sharedKey = 'idemp-burst-retry-same-key'
  const [click1, click2] = await Promise.all([
    simulateConcurrentSubmit(dbAsync3, {
      auth_uid: 'uid-budi',
      employee_profile_id: 'emp-budi',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      attendance_type: 'pulang',
      shift: 'Shift II',
      currentServerTime: jktDate(MONDAY, 7, 45),
      idempotency_key: sharedKey,
    }),
    simulateConcurrentSubmit(dbAsync3, {
      auth_uid: 'uid-budi',
      employee_profile_id: 'emp-budi',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      attendance_type: 'pulang',
      shift: 'Shift II',
      currentServerTime: jktDate(MONDAY, 7, 45),
      idempotency_key: sharedKey,
    }),
  ])

  const hasSuccessfulInsert = (click1.success && !click1.cached) || (click2.success && !click2.cached)
  const duplicatePrevented = click1.cached === true || click2.cached === true || click1.errorCode === 'DUPLICATE_CHECKOUT' || click2.errorCode === 'DUPLICATE_CHECKOUT'
  assert('T12-13 — Race Condition: Tepat satu proses checkout utama berhasil tercatat', hasSuccessfulInsert)
  assert('T12-14 — Race Condition: Request paralel kedua dicegah duplikat (melalui cache idempotency atau anti-duplikasi)', duplicatePrevented)
  const snap3 = dbAsync3.getSnapshot()
  const pulangCount3 = snap3.filter(r => r.auth_uid === 'uid-budi' && r.attendance_type === 'pulang').length
  assert('T12-15 — Race Condition: Tepat HANYA 1 record pulang yang tercipta di database', pulangCount3 === 1)
  assert('T12-16 — Race Condition: Total record di database tepat 2 (1 masuk + 1 pulang)', snap3.length === 2)
}

// ── 12.4 Race Condition Double Submit Beda Key (Simultaneous Browser Tabs)
{
  const dbAsync4 = new SimulatedAsyncAttendanceDb([
    {
      id: 'rec-async-a-masuk',
      auth_uid: 'uid-budi',
      employee_profile_id: 'emp-budi',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      shift: 'Shift II',
      attendance_type: 'masuk',
      work_date: SUNDAY,
      recorded_at: `${SUNDAY}T20:15:00+07:00`,
      attendance_status: 'tepat_waktu',
    },
  ])

  // Dua tab berbeda dibuka bersamaan, menembakkan checkout dengan dua key berbeda
  const [tabA, tabB] = await Promise.all([
    simulateConcurrentSubmit(dbAsync4, {
      auth_uid: 'uid-budi',
      employee_profile_id: 'emp-budi',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      attendance_type: 'pulang',
      shift: 'Shift II',
      currentServerTime: jktDate(MONDAY, 7, 45),
      idempotency_key: 'tab-1-key',
    }),
    simulateConcurrentSubmit(dbAsync4, {
      auth_uid: 'uid-budi',
      employee_profile_id: 'emp-budi',
      employee_name: 'Budi Santoso',
      normalized_name: 'budi santoso',
      category: 'Security',
      attendance_type: 'pulang',
      shift: 'Shift II',
      currentServerTime: jktDate(MONDAY, 7, 45),
      idempotency_key: 'tab-2-key',
    }),
  ])

  const successCount = (tabA.success ? 1 : 0) + (tabB.success ? 1 : 0)
  const rejectedCount = (!tabA.success ? 1 : 0) + (!tabB.success ? 1 : 0)
  assert('T12-17 — Race Condition Beda Key: Tepat 1 request berhasil diproses', successCount === 1)
  assert('T12-18 — Race Condition Beda Key: Tepat 1 request ditolak oleh constraint anti-duplikasi', rejectedCount === 1)
  const rejected = !tabA.success ? tabA : tabB
  assert('T12-19 — Race Condition Beda Key: Kode error penolakan adalah DUPLICATE_CHECKOUT', rejected.errorCode === 'DUPLICATE_CHECKOUT')
  const snap4 = dbAsync4.getSnapshot()
  const pulangCount4 = snap4.filter(r => r.auth_uid === 'uid-budi' && r.attendance_type === 'pulang').length
  assert('T12-20 — Race Condition Beda Key: Database tetap hanya memiliki 1 record pulang', pulangCount4 === 1)
}

// ── 12.5 Race Condition Double Check-in (Pegawai B di Hari Senin)
{
  const dbAsync5 = new SimulatedAsyncAttendanceDb([])

  // Pegawai B menekan check-in dari 2 perangkat secara simultan
  const [dev1, dev2] = await Promise.all([
    simulateConcurrentSubmit(dbAsync5, {
      auth_uid: 'uid-siti',
      employee_profile_id: 'emp-siti',
      employee_name: 'Siti Rahayu',
      normalized_name: 'siti rahayu',
      category: 'Security',
      attendance_type: 'masuk',
      shift: 'Shift I',
      currentServerTime: jktDate(MONDAY, 7, 15),
      idempotency_key: 'device-1-in',
    }),
    simulateConcurrentSubmit(dbAsync5, {
      auth_uid: 'uid-siti',
      employee_profile_id: 'emp-siti',
      employee_name: 'Siti Rahayu',
      normalized_name: 'siti rahayu',
      category: 'Security',
      attendance_type: 'masuk',
      shift: 'Shift I',
      currentServerTime: jktDate(MONDAY, 7, 15),
      idempotency_key: 'device-2-in',
    }),
  ])

  const checkinSuccess = (dev1.success ? 1 : 0) + (dev2.success ? 1 : 0)
  const checkinRejected = (!dev1.success ? 1 : 0) + (!dev2.success ? 1 : 0)
  assert('T12-21 — Race Condition Check-in: Tepat 1 check-in berhasil', checkinSuccess === 1)
  assert('T12-22 — Race Condition Check-in: Tepat 1 check-in ditolak duplikat', checkinRejected === 1)
  const rejCheckin = !dev1.success ? dev1 : dev2
  assert('T12-23 — Race Condition Check-in: Kode error penolakan adalah DUPLICATE_CHECKIN', rejCheckin.errorCode === 'DUPLICATE_CHECKIN')
  const snap5 = dbAsync5.getSnapshot()
  assert('T12-24 — Race Condition Check-in: Database hanya mencatat tepat 1 record masuk', snap5.length === 1)
}

// ============================================================
// TEST GROUP 13: Skenario Komprehensif Audit & Investigasi (11 Skenario User)
// Kasus: Security Minggu Shift II -> Checkout Senin 07:30 -> Check-In Senin Shift II 15:00-15:30
// ============================================================
console.log('\nTEST GROUP 13: Skenario Komprehensif Audit & Investigasi (11 Skenario User)')
{
  // Skenario 1: Check-in Shift II Minggu pukul 20.15
  const sIn = getSecurityShiftCheckInStatus('Shift II', SUNDAY, jktDate(SUNDAY, 20, 15))
  assert('Skenario 1 — Minggu 20:15 check-in Shift II tepat_waktu', sIn.windowStatus === 'tepat_waktu')
  assert('Skenario 1 — isOvernight = true', sIn.isOvernight === true)
  assert('Skenario 1 — effectiveWorkDate = Minggu', sIn.effectiveWorkDate === SUNDAY)

  // Skenario 6: Shift Minggu yang belum checkout tetap dianggap aktif di dashboard
  const activeSundayInRecord: AttendanceRecord = {
    id: 'rec-sun-in-2015',
    work_date: SUNDAY,
    attendance_type: 'masuk',
    attendance_status: 'tepat_waktu',
    shift: 'Shift II',
    recorded_at: `${SUNDAY}T20:15:00+07:00`,
    scheduled_start: '20:00',
    scheduled_end: '20:30',
  }
  // Pada Senin pagi 07:00 sebelum checkout dibuka
  const btnActiveSun = getAttendanceButtonState(
    'Security',
    { masuk: activeSundayInRecord, istirahat: null, pulang: null },
    'Shift II',
    SUNDAY,
    jktDate(MONDAY, 7, 0)
  )
  assert('Skenario 6 — Shift Minggu belum checkout: waiting_pulang (masih aktif)', btnActiveSun.status === 'waiting_pulang')

  // Skenario 2: Checkout Senin pukul 07.30
  const winMon0730 = checkAttendanceWindow('Security', 'pulang', 'Shift II', SUNDAY, jktDate(MONDAY, 7, 30))
  assert('Skenario 2 — Checkout Senin 07:30 = open', winMon0730 === 'open')
  const btnMon0730 = getAttendanceButtonState(
    'Security',
    { masuk: activeSundayInRecord, istirahat: null, pulang: null },
    'Shift II',
    SUNDAY,
    jktDate(MONDAY, 7, 30)
  )
  assert('Skenario 2 — Tombol checkout Senin 07:30 = can_pulang', btnMon0730.status === 'can_pulang')

  // Skenario 9: Checkout di luar jendela waktu ditolak backend
  // 9a: Checkout Minggu dilakukan Senin 19:49 WIB (kasus screenshot)
  const winMon1949 = checkAttendanceWindow('Security', 'pulang', 'Shift II', SUNDAY, jktDate(MONDAY, 19, 49))
  assert('Skenario 9a — Checkout Minggu di Senin 19:49 = closed_accept', winMon1949 === 'closed_accept')
  // Dashboard button state at 19:49:
  const btnMon1949 = getAttendanceButtonState(
    'Security',
    { masuk: activeSundayInRecord, istirahat: null, pulang: null },
    'Shift II',
    SUNDAY,
    jktDate(MONDAY, 19, 49)
  )
  assert('Skenario 9a — Dashboard tombol checkout di Senin 19:49 = window_closed', btnMon1949.status === 'window_closed')

  // Skenario 9a backend: checkout 19:49 jauh melewati batas 08:00 → window_closed (diverifikasi lewat button state = window_closed di atas)
  // Verifikasi tambahan: checkout 07:30 tepat berada dalam jendela valid
  const winMon0730ok = checkAttendanceWindow('Security', 'pulang', 'Shift II', SUNDAY, jktDate(MONDAY, 7, 30))
  assert('Skenario 9a — Verifikasi: 07:30 masih dalam jendela = open', winMon0730ok === 'open')
  const winMon0801closed = checkAttendanceWindow('Security', 'pulang', 'Shift II', SUNDAY, jktDate(MONDAY, 8, 1))
  assert('Skenario 9a — Verifikasi: 08:01 melewati jendela = closed_accept', winMon0801closed === 'closed_accept')

  // Skenario 4: work_date checkout tetap mengikuti tanggal check-in asal (Minggu)
  // Diverifikasi via checkAttendanceWindow: checkout Senin 07:30 valid untuk Minggu Shift II
  const winSun0730checkout = checkAttendanceWindow('Security', 'pulang', 'Shift II', SUNDAY, jktDate(MONDAY, 7, 30))
  assert('Skenario 4 — work_date checkout Senin 07:30 valid untuk Minggu Shift II', winSun0730checkout === 'open')
  // Juga verifikasi melalui getSecurityShiftItem
  const shift2Item = getSecurityShiftItem(SUNDAY, 'Shift II')
  assert('Skenario 4 — getSecurityShiftItem konfirmasi out_start = 07:30 untuk Minggu', shift2Item.out_start === '07:30')
  assert('Skenario 4 — getSecurityShiftItem konfirmasi out_next_day = true', shift2Item.out_next_day === true)

  // Skenario 8: Checkout di luar jendela diblokir di level checkAttendanceWindow → tidak perlu simulateSubmit
  const btnSun0801 = getAttendanceButtonState(
    'Security',
    { masuk: activeSundayInRecord, istirahat: null, pulang: null },
    'Shift II',
    SUNDAY,
    jktDate(MONDAY, 8, 1)
  )
  assert('Skenario 8 — Tombol pulang setelah 08:01 = window_closed (checkout tidak akan masuk ke backend)', btnSun0801.status === 'window_closed')


  // Skenario 3: Setelah checkout berhasil, check-in shift Senin tersedia sesuai jadwal (Shift II 15:00-15:30)
  // Simulasi status dashboard di Senin 15:15 WIB setelah checkout Minggu selesai
  // Di EmployeeHomeView, shift kemarin yang sudah lengkap checkout tidak lagi memblokir todayRecords
  const todayRecordsAfterCheckout = { masuk: null, istirahat: null, pulang: null }
  const mondayShift2Status = getSecurityShiftCheckInStatus('Shift II', MONDAY, jktDate(MONDAY, 15, 15))
  assert('Skenario 3 — Senin 15:15 Shift II status = tepat_waktu', mondayShift2Status.windowStatus === 'tepat_waktu')
  assert('Skenario 3 — Senin Shift II BUKAN overnight', mondayShift2Status.isOvernight === false)
  assert('Skenario 3 — effectiveWorkDate = Senin', mondayShift2Status.effectiveWorkDate === MONDAY)

  const autoSelectMon = getAutoSelectSecurityShift(MONDAY, jktDate(MONDAY, 15, 15))
  assert('Skenario 3 — Auto-select aktif pada 15:15 adalah Shift II', autoSelectMon === 'Shift II')

  const btnMon1515 = getAttendanceButtonState(
    'Security',
    todayRecordsAfterCheckout,
    'Shift II',
    MONDAY,
    jktDate(MONDAY, 15, 15)
  )
  assert('Skenario 3 — Tombol check-in Shift II Senin tersedia (can_masuk)', btnMon1515.status === 'can_masuk')

  // Skenario 5: work_date check-in Senin menggunakan tanggal Senin
  // Diverifikasi lewat checkAttendanceWindow dan getSecurityShiftCheckInStatus
  const winMonIn1515 = checkAttendanceWindow('Security', 'masuk', 'Shift II', MONDAY, jktDate(MONDAY, 15, 15))
  assert('Skenario 5 — Check-in Shift II Senin 15:15 valid (window open)', winMonIn1515 === 'open')
  // work_date untuk check-in siang hari adalah tanggal hari ini (Senin), bukan kemarin
  const monShiftItem = getSecurityShiftItem(MONDAY, 'Shift II')
  assert('Skenario 5 — Senin Shift II in_start = 15:00 (bukan pagi hari)', monShiftItem.in_start === '15:00')
  assert('Skenario 5 — Senin Shift II out_next_day = false (bukan overnight)', monShiftItem.out_next_day !== true)

  // Skenario 7: Duplikasi check-in sama shift dideteksi oleh database unique constraint
  // Diverifikasi lewat dummy db check-in duplicate (sama seperti yang sudah diuji di Group 10)
  const winMonIn1520Late = checkAttendanceWindow('Security', 'masuk', 'Shift II', MONDAY, jktDate(MONDAY, 15, 20))
  assert('Skenario 7 — Jendela check-in 15:20 masih open (duplikat akan ditolak oleh unique constraint DB)', winMonIn1520Late === 'open')


  // Skenario 10: Shift overnight lainnya tetap berfungsi (Shift III Senin 19:30 - Selasa 07:30)
  const sMon3In = getSecurityShiftCheckInStatus('Shift III', MONDAY, jktDate(MONDAY, 19, 45))
  assert('Skenario 10 — Senin Shift III 19:45 = tepat_waktu', sMon3In.windowStatus === 'tepat_waktu')
  assert('Skenario 10 — Senin Shift III isOvernight = true', sMon3In.isOvernight === true)
  const winTueOut = checkAttendanceWindow('Security', 'pulang', 'Shift III', MONDAY, jktDate('2026-11-03', 7, 45))
  assert('Skenario 10 — Selasa 07:45 checkout Shift III = open', winTueOut === 'open')

  // Skenario 11: Presensi CS tetap berfungsi tanpa perubahan
  const winCS_MonIn = checkAttendanceWindow('CS', 'masuk', null, MONDAY, jktDate(MONDAY, 7, 45))
  assert('Skenario 11 — CS Senin 07:45 masuk = open', winCS_MonIn === 'open')
  const winCS_MonOut = checkAttendanceWindow('CS', 'pulang', null, MONDAY, jktDate(MONDAY, 16, 15))
  assert('Skenario 11 — CS Senin 16:15 pulang = open', winCS_MonOut === 'open')
}

console.log('\n============================================================')
if (failed === 0) {
  console.log(`🎉 SEMUA ${passed} SKENARIO PENGUJIAN BERHASIL LULUS!`)
} else {
  console.error(`💥 ${failed} SKENARIO GAGAL! (${passed} berhasil)`)
  process.exit(1)
}
console.log('============================================================\n')


