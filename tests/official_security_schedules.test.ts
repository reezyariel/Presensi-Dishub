/**
 * SIPATEN — Pengujian Jadwal Resmi Security SIPATEN
 * Sumber Kebenaran (Authoritative Source of Truth):
 *
 * Senin–Kamis:
 *   - Shift I:   Masuk 07:00–07:30, Pulang 16:00–16:30 (out_next_day = false)
 *   - Shift II:  Masuk 15:00–15:30, Pulang 19:30–20:00 (out_next_day = false)
 *   - Shift III: Masuk 19:30–20:00, Pulang 07:30–08:00 H+1 (out_next_day = true)
 *
 * Jumat:
 *   - Shift I:   Masuk 07:00–07:30, Pulang 19:00–19:30 (out_next_day = false)
 *   - Shift II:  Masuk 19:00–19:30, Pulang 07:00–07:30 H+1 (out_next_day = true)
 *
 * Sabtu–Minggu:
 *   - Shift I:   Masuk 07:30–08:00, Pulang 20:00–20:30 (out_next_day = false)
 *   - Shift II:  Masuk 20:00–20:30, Pulang 07:30–08:00 H+1 (out_next_day = true)
 *
 * Jalankan dengan: npx tsx tests/official_security_schedules.test.ts
 */

import {
  getSecurityShiftItem,
  checkAttendanceWindow,
  getSecurityShiftCheckInStatus,
  getAutoSelectSecurityShift,
  getSecurityAvailableOptions,
  isOvernightSecurityShift,
  isOvernightCheckout,
  determineOvernightWorkDate,
  DEFAULT_DAY_GROUPS,
  DEFAULT_SECURITY_WEEKEND_SCHEDULE,
  DEFAULT_CS_SCHEDULE,
  type SecurityShiftOption,
} from '../src/lib/scheduleEngine'

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

// Helper: create a Date for Asia/Jakarta (UTC+7)
function jktDate(dateStr: string, hh: number, mm: number): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d, hh - 7, mm, 0)
  return new Date(ms)
}

const MON = '2026-11-02' // Senin
const TUE = '2026-11-03' // Selasa
const WED = '2026-11-04' // Rabu
const THU = '2026-11-05' // Kamis
const FRI = '2026-11-06' // Jumat
const SAT = '2026-11-07' // Sabtu
const SUN = '2026-11-08' // Minggu
const NEXT_MON = '2026-11-09' // Senin H+1

console.log('\n============================================================')
console.log('🛡️  PENGUJIAN JADWAL RESMI SECURITY SIPATEN')
console.log('============================================================\n')

// ============================================================
// GRUP 1: Verifikasi Nilai DEFAULT_DAY_GROUPS & WEEKEND SCHEDULE
// ============================================================
console.log('GRUP 1: Verifikasi Nilai Konfigurasi DEFAULT_DAY_GROUPS')
{
  // Mon-Thu
  const mtShifts = DEFAULT_DAY_GROUPS.mon_thu.shifts
  assert('Mon-Thu punya 3 shift', mtShifts.length === 3)
  
  // Shift I
  assert('Mon-Thu Shift I in_start = 07:00', mtShifts[0].in_start === '07:00')
  assert('Mon-Thu Shift I in_end = 07:30', mtShifts[0].in_end === '07:30')
  assert('Mon-Thu Shift I out_start = 16:00', mtShifts[0].out_start === '16:00')
  assert('Mon-Thu Shift I out_end = 16:30', mtShifts[0].out_end === '16:30')
  assert('Mon-Thu Shift I out_next_day = false', mtShifts[0].out_next_day === false)

  // Shift II
  assert('Mon-Thu Shift II in_start = 15:00', mtShifts[1].in_start === '15:00')
  assert('Mon-Thu Shift II in_end = 15:30', mtShifts[1].in_end === '15:30')
  assert('Mon-Thu Shift II out_start = 19:30', mtShifts[1].out_start === '19:30')
  assert('Mon-Thu Shift II out_end = 20:00', mtShifts[1].out_end === '20:00')
  assert('Mon-Thu Shift II out_next_day = false', mtShifts[1].out_next_day === false)

  // Shift III
  assert('Mon-Thu Shift III in_start = 19:30', mtShifts[2].in_start === '19:30')
  assert('Mon-Thu Shift III in_end = 20:00', mtShifts[2].in_end === '20:00')
  assert('Mon-Thu Shift III out_start = 07:30', mtShifts[2].out_start === '07:30')
  assert('Mon-Thu Shift III out_end = 08:00', mtShifts[2].out_end === '08:00')
  assert('Mon-Thu Shift III out_next_day = true', mtShifts[2].out_next_day === true)

  // Friday
  const friShifts = DEFAULT_DAY_GROUPS.friday.shifts
  assert('Jumat punya 2 shift', friShifts.length === 2)

  // Jumat Shift I
  assert('Jumat Shift I in_start = 07:00', friShifts[0].in_start === '07:00')
  assert('Jumat Shift I in_end = 07:30', friShifts[0].in_end === '07:30')
  assert('Jumat Shift I out_start = 19:00', friShifts[0].out_start === '19:00')
  assert('Jumat Shift I out_end = 19:30', friShifts[0].out_end === '19:30')
  assert('Jumat Shift I out_next_day = false', friShifts[0].out_next_day === false)

  // Jumat Shift II
  assert('Jumat Shift II in_start = 19:00', friShifts[1].in_start === '19:00')
  assert('Jumat Shift II in_end = 19:30', friShifts[1].in_end === '19:30')
  assert('Jumat Shift II out_start = 07:00', friShifts[1].out_start === '07:00')
  assert('Jumat Shift II out_end = 07:30', friShifts[1].out_end === '07:30')
  assert('Jumat Shift II out_next_day = true', friShifts[1].out_next_day === true)

  // Weekend
  const wkndShifts = DEFAULT_DAY_GROUPS.weekend.shifts
  assert('Weekend punya 2 shift', wkndShifts.length === 2)

  // Weekend Shift I
  assert('Weekend Shift I in_start = 07:30', wkndShifts[0].in_start === '07:30')
  assert('Weekend Shift I in_end = 08:00', wkndShifts[0].in_end === '08:00')
  assert('Weekend Shift I out_start = 20:00', wkndShifts[0].out_start === '20:00')
  assert('Weekend Shift I out_end = 20:30', wkndShifts[0].out_end === '20:30')
  assert('Weekend Shift I out_next_day = false', wkndShifts[0].out_next_day === false)

  // Weekend Shift II
  assert('Weekend Shift II in_start = 20:00', wkndShifts[1].in_start === '20:00')
  assert('Weekend Shift II in_end = 20:30', wkndShifts[1].in_end === '20:30')
  assert('Weekend Shift II out_start = 07:30', wkndShifts[1].out_start === '07:30')
  assert('Weekend Shift II out_end = 08:00', wkndShifts[1].out_end === '08:00')
  assert('Weekend Shift II out_next_day = true', wkndShifts[1].out_next_day === true)

  // security_weekend_schedule
  assert('Weekend Schedule sesiPagi open = 07:30', DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiPagi.open === '07:30')
  assert('Weekend Schedule sesiPagi close = 08:00', DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiPagi.close === '08:00')
  assert('Weekend Schedule sesiPagi out_start = 20:00', DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiPagi.out_start === '20:00')
  assert('Weekend Schedule sesiPagi out_end = 20:30', DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiPagi.out_end === '20:30')
  assert('Weekend Schedule sesiMalam open = 20:00', DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiMalam.open === '20:00')
  assert('Weekend Schedule sesiMalam close = 20:30', DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiMalam.close === '20:30')
  assert('Weekend Schedule sesiMalam out_start = 07:30', DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiMalam.out_start === '07:30')
  assert('Weekend Schedule sesiMalam out_end = 08:00', DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiMalam.out_end === '08:00')
}

// ============================================================
// GRUP 2: Uji Jendela Waktu Senin–Kamis (Batas Awal & Akhir)
// ============================================================
console.log('\nGRUP 2: Uji Jendela Waktu Senin–Kamis')
{
  // Shift I: Masuk 07:00–07:30, Pulang 16:00–16:30
  assert('Mon 06:59 Shift I Masuk: not_yet', checkAttendanceWindow('Security', 'masuk', 'Shift I', MON, jktDate(MON, 6, 59)) === 'not_yet')
  assert('Mon 07:00 Shift I Masuk: open (mulai)', checkAttendanceWindow('Security', 'masuk', 'Shift I', MON, jktDate(MON, 7, 0)) === 'open')
  assert('Mon 07:15 Shift I Masuk: open (tengah)', checkAttendanceWindow('Security', 'masuk', 'Shift I', MON, jktDate(MON, 7, 15)) === 'open')
  assert('Mon 07:30 Shift I Masuk: open (batas akhir)', checkAttendanceWindow('Security', 'masuk', 'Shift I', MON, jktDate(MON, 7, 30)) === 'open')
  assert('Mon 07:31 Shift I Masuk: closed_accept (terlambat/selesai)', checkAttendanceWindow('Security', 'masuk', 'Shift I', MON, jktDate(MON, 7, 31)) === 'closed_accept')

  assert('Mon 15:59 Shift I Pulang: not_yet', checkAttendanceWindow('Security', 'pulang', 'Shift I', MON, jktDate(MON, 15, 59)) === 'not_yet')
  assert('Mon 16:00 Shift I Pulang: open (mulai)', checkAttendanceWindow('Security', 'pulang', 'Shift I', MON, jktDate(MON, 16, 0)) === 'open')
  assert('Mon 16:15 Shift I Pulang: open (tengah)', checkAttendanceWindow('Security', 'pulang', 'Shift I', MON, jktDate(MON, 16, 15)) === 'open')
  assert('Mon 16:30 Shift I Pulang: open (batas akhir)', checkAttendanceWindow('Security', 'pulang', 'Shift I', MON, jktDate(MON, 16, 30)) === 'open')
  assert('Mon 16:31 Shift I Pulang: closed_accept', checkAttendanceWindow('Security', 'pulang', 'Shift I', MON, jktDate(MON, 16, 31)) === 'closed_accept')

  // Shift II: Masuk 15:00–15:30, Pulang 19:30–20:00
  assert('Mon 14:59 Shift II Masuk: not_yet', checkAttendanceWindow('Security', 'masuk', 'Shift II', MON, jktDate(MON, 14, 59)) === 'not_yet')
  assert('Mon 15:00 Shift II Masuk: open', checkAttendanceWindow('Security', 'masuk', 'Shift II', MON, jktDate(MON, 15, 0)) === 'open')
  assert('Mon 15:15 Shift II Masuk: open', checkAttendanceWindow('Security', 'masuk', 'Shift II', MON, jktDate(MON, 15, 15)) === 'open')
  assert('Mon 15:30 Shift II Masuk: open', checkAttendanceWindow('Security', 'masuk', 'Shift II', MON, jktDate(MON, 15, 30)) === 'open')
  assert('Mon 15:31 Shift II Masuk: closed_accept', checkAttendanceWindow('Security', 'masuk', 'Shift II', MON, jktDate(MON, 15, 31)) === 'closed_accept')

  assert('Mon 19:29 Shift II Pulang: not_yet', checkAttendanceWindow('Security', 'pulang', 'Shift II', MON, jktDate(MON, 19, 29)) === 'not_yet')
  assert('Mon 19:30 Shift II Pulang: open', checkAttendanceWindow('Security', 'pulang', 'Shift II', MON, jktDate(MON, 19, 30)) === 'open')
  assert('Mon 19:45 Shift II Pulang: open', checkAttendanceWindow('Security', 'pulang', 'Shift II', MON, jktDate(MON, 19, 45)) === 'open')
  assert('Mon 20:00 Shift II Pulang: open', checkAttendanceWindow('Security', 'pulang', 'Shift II', MON, jktDate(MON, 20, 0)) === 'open')
  assert('Mon 20:01 Shift II Pulang: closed_accept', checkAttendanceWindow('Security', 'pulang', 'Shift II', MON, jktDate(MON, 20, 1)) === 'closed_accept')

  // Shift III: Masuk 19:30–20:00, Pulang 07:30–08:00 H+1
  assert('Mon 19:29 Shift III Masuk: not_yet', checkAttendanceWindow('Security', 'masuk', 'Shift III', MON, jktDate(MON, 19, 29)) === 'not_yet')
  assert('Mon 19:30 Shift III Masuk: open', checkAttendanceWindow('Security', 'masuk', 'Shift III', MON, jktDate(MON, 19, 30)) === 'open')
  assert('Mon 19:45 Shift III Masuk: open', checkAttendanceWindow('Security', 'masuk', 'Shift III', MON, jktDate(MON, 19, 45)) === 'open')
  assert('Mon 20:00 Shift III Masuk: open', checkAttendanceWindow('Security', 'masuk', 'Shift III', MON, jktDate(MON, 20, 0)) === 'open')
  assert('Mon 20:01 Shift III Masuk: closed_accept', checkAttendanceWindow('Security', 'masuk', 'Shift III', MON, jktDate(MON, 20, 1)) === 'closed_accept')

  // Shift III Checkout pada H+1 (Selasa pagi)
  assert('Tue 07:29 Shift III Pulang H+1: not_yet', checkAttendanceWindow('Security', 'pulang', 'Shift III', MON, jktDate(TUE, 7, 29)) === 'not_yet')
  assert('Tue 07:30 Shift III Pulang H+1: open (mulai)', checkAttendanceWindow('Security', 'pulang', 'Shift III', MON, jktDate(TUE, 7, 30)) === 'open')
  assert('Tue 07:45 Shift III Pulang H+1: open (tengah)', checkAttendanceWindow('Security', 'pulang', 'Shift III', MON, jktDate(TUE, 7, 45)) === 'open')
  assert('Tue 08:00 Shift III Pulang H+1: open (batas akhir)', checkAttendanceWindow('Security', 'pulang', 'Shift III', MON, jktDate(TUE, 8, 0)) === 'open')
  assert('Tue 08:01 Shift III Pulang H+1: closed_accept (lewat batas)', checkAttendanceWindow('Security', 'pulang', 'Shift III', MON, jktDate(TUE, 8, 1)) === 'closed_accept')
}

// ============================================================
// GRUP 3: Uji Jendela Waktu Jumat (Shift I 07:00–19:00, Shift II 19:00–07:00 H+1)
// ============================================================
console.log('\nGRUP 3: Uji Jendela Waktu Jumat')
{
  // Shift I: Masuk 07:00–07:30, Pulang 19:00–19:30
  assert('Fri 06:59 Shift I Masuk: not_yet', checkAttendanceWindow('Security', 'masuk', 'Shift I', FRI, jktDate(FRI, 6, 59)) === 'not_yet')
  assert('Fri 07:00 Shift I Masuk: open (mulai)', checkAttendanceWindow('Security', 'masuk', 'Shift I', FRI, jktDate(FRI, 7, 0)) === 'open')
  assert('Fri 07:15 Shift I Masuk: open', checkAttendanceWindow('Security', 'masuk', 'Shift I', FRI, jktDate(FRI, 7, 15)) === 'open')
  assert('Fri 07:30 Shift I Masuk: open (batas akhir)', checkAttendanceWindow('Security', 'masuk', 'Shift I', FRI, jktDate(FRI, 7, 30)) === 'open')
  assert('Fri 07:31 Shift I Masuk: closed_accept', checkAttendanceWindow('Security', 'masuk', 'Shift I', FRI, jktDate(FRI, 7, 31)) === 'closed_accept')

  assert('Fri 18:59 Shift I Pulang: not_yet', checkAttendanceWindow('Security', 'pulang', 'Shift I', FRI, jktDate(FRI, 18, 59)) === 'not_yet')
  assert('Fri 19:00 Shift I Pulang: open (mulai)', checkAttendanceWindow('Security', 'pulang', 'Shift I', FRI, jktDate(FRI, 19, 0)) === 'open')
  assert('Fri 19:15 Shift I Pulang: open', checkAttendanceWindow('Security', 'pulang', 'Shift I', FRI, jktDate(FRI, 19, 15)) === 'open')
  assert('Fri 19:30 Shift I Pulang: open (batas akhir)', checkAttendanceWindow('Security', 'pulang', 'Shift I', FRI, jktDate(FRI, 19, 30)) === 'open')
  assert('Fri 19:31 Shift I Pulang: closed_accept', checkAttendanceWindow('Security', 'pulang', 'Shift I', FRI, jktDate(FRI, 19, 31)) === 'closed_accept')

  // Shift II: Masuk 19:00–19:30, Pulang 07:00–07:30 H+1 (Sabtu)
  assert('Fri 18:59 Shift II Masuk: not_yet', checkAttendanceWindow('Security', 'masuk', 'Shift II', FRI, jktDate(FRI, 18, 59)) === 'not_yet')
  assert('Fri 19:00 Shift II Masuk: open', checkAttendanceWindow('Security', 'masuk', 'Shift II', FRI, jktDate(FRI, 19, 0)) === 'open')
  assert('Fri 19:15 Shift II Masuk: open', checkAttendanceWindow('Security', 'masuk', 'Shift II', FRI, jktDate(FRI, 19, 15)) === 'open')
  assert('Fri 19:30 Shift II Masuk: open', checkAttendanceWindow('Security', 'masuk', 'Shift II', FRI, jktDate(FRI, 19, 30)) === 'open')
  assert('Fri 19:31 Shift II Masuk: closed_accept', checkAttendanceWindow('Security', 'masuk', 'Shift II', FRI, jktDate(FRI, 19, 31)) === 'closed_accept')

  // Shift II Jumat Pulang pada H+1 (Sabtu pagi)
  assert('Sat 06:59 Shift II Pulang H+1: not_yet', checkAttendanceWindow('Security', 'pulang', 'Shift II', FRI, jktDate(SAT, 6, 59)) === 'not_yet')
  assert('Sat 07:00 Shift II Pulang H+1: open (mulai)', checkAttendanceWindow('Security', 'pulang', 'Shift II', FRI, jktDate(SAT, 7, 0)) === 'open')
  assert('Sat 07:15 Shift II Pulang H+1: open (tengah)', checkAttendanceWindow('Security', 'pulang', 'Shift II', FRI, jktDate(SAT, 7, 15)) === 'open')
  assert('Sat 07:30 Shift II Pulang H+1: open (batas akhir)', checkAttendanceWindow('Security', 'pulang', 'Shift II', FRI, jktDate(SAT, 7, 30)) === 'open')
  assert('Sat 07:31 Shift II Pulang H+1: closed_accept (lewat batas)', checkAttendanceWindow('Security', 'pulang', 'Shift II', FRI, jktDate(SAT, 7, 31)) === 'closed_accept')
}

// ============================================================
// GRUP 4: Uji Jendela Waktu Sabtu–Minggu (Shift I 07:30–20:00, Shift II 20:00–07:30 H+1)
// ============================================================
console.log('\nGRUP 4: Uji Jendela Waktu Sabtu–Minggu')
{
  for (const wkndDay of [SAT, SUN]) {
    const nextDay = wkndDay === SAT ? SUN : NEXT_MON
    const dayName = wkndDay === SAT ? 'Sabtu' : 'Minggu'

    // Shift I: Masuk 07:30–08:00, Pulang 20:00–20:30
    assert(`${dayName} 07:29 Shift I Masuk: not_yet`, checkAttendanceWindow('Security', 'masuk', 'Shift I', wkndDay, jktDate(wkndDay, 7, 29)) === 'not_yet')
    assert(`${dayName} 07:30 Shift I Masuk: open (mulai)`, checkAttendanceWindow('Security', 'masuk', 'Shift I', wkndDay, jktDate(wkndDay, 7, 30)) === 'open')
    assert(`${dayName} 07:45 Shift I Masuk: open (tengah)`, checkAttendanceWindow('Security', 'masuk', 'Shift I', wkndDay, jktDate(wkndDay, 7, 45)) === 'open')
    assert(`${dayName} 08:00 Shift I Masuk: open (batas akhir)`, checkAttendanceWindow('Security', 'masuk', 'Shift I', wkndDay, jktDate(wkndDay, 8, 0)) === 'open')
    assert(`${dayName} 08:01 Shift I Masuk: closed_accept`, checkAttendanceWindow('Security', 'masuk', 'Shift I', wkndDay, jktDate(wkndDay, 8, 1)) === 'closed_accept')

    assert(`${dayName} 19:59 Shift I Pulang: not_yet`, checkAttendanceWindow('Security', 'pulang', 'Shift I', wkndDay, jktDate(wkndDay, 19, 59)) === 'not_yet')
    assert(`${dayName} 20:00 Shift I Pulang: open (mulai)`, checkAttendanceWindow('Security', 'pulang', 'Shift I', wkndDay, jktDate(wkndDay, 20, 0)) === 'open')
    assert(`${dayName} 20:15 Shift I Pulang: open (tengah)`, checkAttendanceWindow('Security', 'pulang', 'Shift I', wkndDay, jktDate(wkndDay, 20, 15)) === 'open')
    assert(`${dayName} 20:30 Shift I Pulang: open (batas akhir)`, checkAttendanceWindow('Security', 'pulang', 'Shift I', wkndDay, jktDate(wkndDay, 20, 30)) === 'open')
    assert(`${dayName} 20:31 Shift I Pulang: closed_accept`, checkAttendanceWindow('Security', 'pulang', 'Shift I', wkndDay, jktDate(wkndDay, 20, 31)) === 'closed_accept')

    // Shift II: Masuk 20:00–20:30, Pulang 07:30–08:00 H+1
    assert(`${dayName} 19:59 Shift II Masuk: not_yet`, checkAttendanceWindow('Security', 'masuk', 'Shift II', wkndDay, jktDate(wkndDay, 19, 59)) === 'not_yet')
    assert(`${dayName} 20:00 Shift II Masuk: open (mulai)`, checkAttendanceWindow('Security', 'masuk', 'Shift II', wkndDay, jktDate(wkndDay, 20, 0)) === 'open')
    assert(`${dayName} 20:15 Shift II Masuk: open (tengah)`, checkAttendanceWindow('Security', 'masuk', 'Shift II', wkndDay, jktDate(wkndDay, 20, 15)) === 'open')
    assert(`${dayName} 20:30 Shift II Masuk: open (batas akhir)`, checkAttendanceWindow('Security', 'masuk', 'Shift II', wkndDay, jktDate(wkndDay, 20, 30)) === 'open')
    assert(`${dayName} 20:31 Shift II Masuk: closed_accept`, checkAttendanceWindow('Security', 'masuk', 'Shift II', wkndDay, jktDate(wkndDay, 20, 31)) === 'closed_accept')

    // Shift II Pulang pada H+1
    assert(`${dayName} H+1 07:29 Shift II Pulang: not_yet`, checkAttendanceWindow('Security', 'pulang', 'Shift II', wkndDay, jktDate(nextDay, 7, 29)) === 'not_yet')
    assert(`${dayName} H+1 07:30 Shift II Pulang: open (mulai)`, checkAttendanceWindow('Security', 'pulang', 'Shift II', wkndDay, jktDate(nextDay, 7, 30)) === 'open')
    assert(`${dayName} H+1 07:45 Shift II Pulang: open (tengah)`, checkAttendanceWindow('Security', 'pulang', 'Shift II', wkndDay, jktDate(nextDay, 7, 45)) === 'open')
    assert(`${dayName} H+1 08:00 Shift II Pulang: open (batas akhir)`, checkAttendanceWindow('Security', 'pulang', 'Shift II', wkndDay, jktDate(nextDay, 8, 0)) === 'open')
    assert(`${dayName} H+1 08:01 Shift II Pulang: closed_accept (lewat batas)`, checkAttendanceWindow('Security', 'pulang', 'Shift II', wkndDay, jktDate(nextDay, 8, 1)) === 'closed_accept')
  }
}

// ============================================================
// GRUP 5: Uji getSecurityShiftCheckInStatus & Auto-Select
// ============================================================
console.log('\nGRUP 5: Uji getSecurityShiftCheckInStatus & Auto-Select')
{
  // Jumat Shift I tepat_waktu pada 07:15
  const stFri1 = getSecurityShiftCheckInStatus('Shift I', FRI, jktDate(FRI, 7, 15))
  assert('Jumat 07:15 Shift I windowStatus = tepat_waktu', stFri1.windowStatus === 'tepat_waktu')
  assert('Jumat 07:15 Shift I auto-select = Shift I', getAutoSelectSecurityShift(FRI, jktDate(FRI, 7, 15)) === 'Shift I')

  // Jumat Shift II tepat_waktu pada 19:15
  const stFri2 = getSecurityShiftCheckInStatus('Shift II', FRI, jktDate(FRI, 19, 15))
  assert('Jumat 19:15 Shift II windowStatus = tepat_waktu', stFri2.windowStatus === 'tepat_waktu')
  assert('Jumat 19:15 Shift II auto-select = Shift II', getAutoSelectSecurityShift(FRI, jktDate(FRI, 19, 15)) === 'Shift II')

  // Sabtu Shift I tepat_waktu pada 07:45
  const stSat1 = getSecurityShiftCheckInStatus('Shift I', SAT, jktDate(SAT, 7, 45))
  assert('Sabtu 07:45 Shift I windowStatus = tepat_waktu', stSat1.windowStatus === 'tepat_waktu')
  assert('Sabtu 07:45 Shift I auto-select = Shift I', getAutoSelectSecurityShift(SAT, jktDate(SAT, 7, 45)) === 'Shift I')

  // Sabtu Shift II tepat_waktu pada 20:15
  const stSat2 = getSecurityShiftCheckInStatus('Shift II', SAT, jktDate(SAT, 20, 15))
  assert('Sabtu 20:15 Shift II windowStatus = tepat_waktu', stSat2.windowStatus === 'tepat_waktu')
  assert('Sabtu 20:15 Shift II auto-select = Shift II', getAutoSelectSecurityShift(SAT, jktDate(SAT, 20, 15)) === 'Shift II')
}

// ============================================================
// GRUP 6: Uji Pencegahan Presensi Ganda (Double Attendance Prevention)
// ============================================================
console.log('\nGRUP 6: Uji Pencegahan Presensi Ganda')
{
  interface MockAttendanceRecord {
    id: string
    employee_name: string
    category: 'Security' | 'CS'
    attendance_type: 'masuk' | 'pulang'
    work_date: string
    shift: string | null
    created_at: string
  }

  const mockDb: MockAttendanceRecord[] = []

  function mockSubmitAttendance(params: {
    employee_name: string
    category: 'Security' | 'CS'
    attendance_type: 'masuk' | 'pulang'
    work_date: string
    shift: string | null
  }): { success: boolean; error?: string; error_code?: string } {
    // Duplicate check
    const existing = mockDb.find(r =>
      r.employee_name === params.employee_name &&
      r.category === params.category &&
      r.work_date === params.work_date &&
      r.attendance_type === params.attendance_type &&
      (params.category !== 'Security' || r.shift === params.shift)
    )

    if (existing) {
      return {
        success: false,
        error: `Pegawai ${params.employee_name} sudah melakukan presensi ${params.attendance_type.toUpperCase()} untuk tanggal kerja ${params.work_date}`,
        error_code: 'DUPLICATE_ATTENDANCE'
      }
    }

    mockDb.push({
      id: `rec-${mockDb.length + 1}`,
      employee_name: params.employee_name,
      category: params.category,
      attendance_type: params.attendance_type,
      work_date: params.work_date,
      shift: params.shift,
      created_at: new Date().toISOString()
    })

    return { success: true }
  }

  // 1. Submit masuk Shift I Jumat
  const res1 = mockSubmitAttendance({ employee_name: 'Ahmad Security', category: 'Security', attendance_type: 'masuk', work_date: FRI, shift: 'Shift I' })
  assert('Check-in pertama Ahmad berhasil', res1.success === true)

  // 2. Submit masuk Shift I Jumat kedua kali -> DITOLAK DUPLIKAT
  const res2 = mockSubmitAttendance({ employee_name: 'Ahmad Security', category: 'Security', attendance_type: 'masuk', work_date: FRI, shift: 'Shift I' })
  assert('Check-in kedua Ahmad DITOLAK DUPLIKAT', res2.success === false && res2.error_code === 'DUPLICATE_ATTENDANCE')

  // 3. Pegawai lain (Budi) check-in Shift I Jumat -> BERHASIL
  const res3 = mockSubmitAttendance({ employee_name: 'Budi Security', category: 'Security', attendance_type: 'masuk', work_date: FRI, shift: 'Shift I' })
  assert('Check-in Budi berhasil', res3.success === true)

  // 4. Ahmad checkout Shift I Jumat pertama kali -> BERHASIL
  const res4 = mockSubmitAttendance({ employee_name: 'Ahmad Security', category: 'Security', attendance_type: 'pulang', work_date: FRI, shift: 'Shift I' })
  assert('Checkout pertama Ahmad berhasil', res4.success === true)

  // 5. Ahmad checkout Shift I Jumat kedua kali -> DITOLAK DUPLIKAT
  const res5 = mockSubmitAttendance({ employee_name: 'Ahmad Security', category: 'Security', attendance_type: 'pulang', work_date: FRI, shift: 'Shift I' })
  assert('Checkout kedua Ahmad DITOLAK DUPLIKAT', res5.success === false && res5.error_code === 'DUPLICATE_ATTENDANCE')
}

// ============================================================
// GRUP 7: Verifikasi Jadwal CS Tetap Utuh (Zero Regression CS)
// ============================================================
console.log('\nGRUP 7: Verifikasi Jadwal CS Tetap Utuh')
{
  assert('CS Masuk open = 07:30', DEFAULT_CS_SCHEDULE.masuk.open === '07:30')
  assert('CS Masuk deadline = 08:00', DEFAULT_CS_SCHEDULE.masuk.ontime_deadline === '08:00')
  assert('CS Masuk close = 11:59', DEFAULT_CS_SCHEDULE.masuk.close === '11:59')
  assert('CS Istirahat start = 12:00', DEFAULT_CS_SCHEDULE.istirahat.start === '12:00')
  assert('CS Istirahat end = 14:00', DEFAULT_CS_SCHEDULE.istirahat.end === '14:00')
  assert('CS Pulang start = 16:00', DEFAULT_CS_SCHEDULE.pulang.start === '16:00')
  assert('CS Pulang end = 18:00', DEFAULT_CS_SCHEDULE.pulang.end === '18:00')

  // CS Masuk diuji pada Senin dan Jumat
  assert('CS Senin 07:29 masuk: not_yet', checkAttendanceWindow('CS', 'masuk', null, MON, jktDate(MON, 7, 29)) === 'not_yet')
  assert('CS Senin 07:30 masuk: open', checkAttendanceWindow('CS', 'masuk', null, MON, jktDate(MON, 7, 30)) === 'open')
  assert('CS Senin 08:00 masuk: open', checkAttendanceWindow('CS', 'masuk', null, MON, jktDate(MON, 8, 0)) === 'open')
  assert('CS Senin 11:59 masuk: open', checkAttendanceWindow('CS', 'masuk', null, MON, jktDate(MON, 11, 59)) === 'open')
  assert('CS Senin 12:00 masuk: closed', checkAttendanceWindow('CS', 'masuk', null, MON, jktDate(MON, 12, 0)) === 'closed')

  assert('CS Jumat 07:30 masuk: open', checkAttendanceWindow('CS', 'masuk', null, FRI, jktDate(FRI, 7, 30)) === 'open')
  assert('CS Minggu 07:30 masuk: open', checkAttendanceWindow('CS', 'masuk', null, SUN, jktDate(SUN, 7, 30)) === 'open')
}

// ============================================================
// GRUP 8: Uji Penolakan Pilihan Shift Tidak Sesuai Jadwal
// ============================================================
console.log('\nGRUP 8: Uji Penolakan Pilihan Shift Tidak Sesuai Jadwal')
{
  // 1. Senin–Kamis memiliki 3 shift resmi
  const monOptions = getSecurityAvailableOptions(MON)
  assert('Senin memiliki 3 pilihan shift', monOptions.length === 3)
  assert('Senin mencakup Shift I', monOptions.includes('Shift I'))
  assert('Senin mencakup Shift II', monOptions.includes('Shift II'))
  assert('Senin mencakup Shift III', monOptions.includes('Shift III'))

  // 2. Jumat hanya memiliki 2 shift resmi (Shift I & Shift II)
  const friOptions = getSecurityAvailableOptions(FRI)
  assert('Jumat memiliki 2 pilihan shift', friOptions.length === 2)
  assert('Jumat mencakup Shift I', friOptions.includes('Shift I'))
  assert('Jumat mencakup Shift II', friOptions.includes('Shift II'))
  assert('Jumat TIDAK mencakup Shift III', !friOptions.includes('Shift III'))

  // 3. Weekend (Sabtu & Minggu) hanya memiliki 2 shift resmi (Shift I & Shift II)
  const satOptions = getSecurityAvailableOptions(SAT)
  assert('Sabtu memiliki 2 pilihan shift', satOptions.length === 2)
  assert('Sabtu TIDAK mencakup Shift III', !satOptions.includes('Shift III'))

  const sunOptions = getSecurityAvailableOptions(SUN)
  assert('Minggu memiliki 2 pilihan shift', sunOptions.length === 2)
  assert('Minggu TIDAK mencakup Shift III', !sunOptions.includes('Shift III'))

  // 4. Simulasi validasi backend Edge Function submit-attendance
  function validateShiftForDay(workDateStr: string, shift: string): { valid: boolean; error?: string } {
    const dayOfWeek = new Date(workDateStr + 'T12:00:00+07:00').getDay()
    const canon = (shift === 'Shift 1' || shift === 'Shift I' || shift === 'Sesi Pagi') ? 'Shift I'
      : (shift === 'Shift 2' || shift === 'Shift II' || shift === 'Sesi Malam') ? 'Shift II'
      : (shift === 'Shift 3' || shift === 'Shift III') ? 'Shift III'
      : shift

    const allowed = (dayOfWeek === 5 || dayOfWeek === 0 || dayOfWeek === 6)
      ? ['Shift I', 'Shift II']
      : ['Shift I', 'Shift II', 'Shift III']

    if (!allowed.includes(canon)) {
      const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
      return {
        valid: false,
        error: `Pilihan shift ${shift} tidak sesuai dengan jadwal hari ${dayNames[dayOfWeek]}. Shift yang tersedia: ${allowed.join(', ')}.`
      }
    }
    return { valid: true }
  }

  // Senin–Kamis: Shift I, II, III valid
  assert('Validasi Backend: Shift I Senin diterima', validateShiftForDay(MON, 'Shift I').valid === true)
  assert('Validasi Backend: Shift II Senin diterima', validateShiftForDay(MON, 'Shift II').valid === true)
  assert('Validasi Backend: Shift III Senin diterima', validateShiftForDay(MON, 'Shift III').valid === true)

  // Jumat: Shift I & II valid, Shift III DITOLAK
  assert('Validasi Backend: Shift I Jumat diterima', validateShiftForDay(FRI, 'Shift I').valid === true)
  assert('Validasi Backend: Shift II Jumat diterima', validateShiftForDay(FRI, 'Shift II').valid === true)
  const friShift3Res = validateShiftForDay(FRI, 'Shift III')
  assert('Validasi Backend: Shift III Jumat DITOLAK', friShift3Res.valid === false)
  assert('Validasi Backend: Pesan penolakan Jumat menyebut hari Jumat', friShift3Res.error?.includes('hari Jumat') === true)

  // Sabtu–Minggu: Shift I & II valid, Shift III DITOLAK
  assert('Validasi Backend: Shift I Sabtu diterima', validateShiftForDay(SAT, 'Shift I').valid === true)
  assert('Validasi Backend: Shift II Sabtu diterima', validateShiftForDay(SAT, 'Shift II').valid === true)
  assert('Validasi Backend: Shift III Sabtu DITOLAK', validateShiftForDay(SAT, 'Shift III').valid === false)

  assert('Validasi Backend: Shift I Minggu diterima', validateShiftForDay(SUN, 'Shift I').valid === true)
  assert('Validasi Backend: Shift II Minggu diterima', validateShiftForDay(SUN, 'Shift II').valid === true)
  assert('Validasi Backend: Shift III Minggu DITOLAK', validateShiftForDay(SUN, 'Shift III').valid === false)
}

console.log('\n============================================================')
if (failed === 0) {
  console.log(`🎉 SEMUA ${passed} PENGUJIAN JADWAL RESMI SECURITY BERHASIL LULUS!`)
} else {
  console.error(`💥 ${failed} PENGUJIAN GAGAL! (${passed} berhasil)`)
  process.exit(1)
}
console.log('============================================================\n')
