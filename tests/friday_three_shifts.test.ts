// ============================================================
// SIPATEN — Pengujian Unit 3 Varian Shift Hari Jumat Security
// ============================================================
// Menjamin integritas:
// 1. Shift I — Reguler: 07:00–16:00 (Check-In: 07:00–07:30, Check-Out: 16:00–16:30, same day)
// 2. Shift I — Panjang: 07:00–19:00 (Check-In: 07:00–07:30, Check-Out: 19:00–19:30, same day, 12 Jam)
// 3. Shift II — Malam: 19:00–07:00 H+1 (Check-In: 19:00–19:30, Check-Out: 07:00–07:30 H+1, lintas hari)
// 4. Backward Compatibility untuk record historis 'Shift I' & 'Shift II' pada hari Jumat
// 5. Helper overnight & formatSecurityDisplayDate (H+1)
// 6. Non-Jumat (Senin–Kamis, Sabtu–Minggu, dan CS) tetap tidak berubah
// ============================================================

import {
  DEFAULT_DAY_GROUPS,
  getSecurityAvailableOptions,
  getSecurityShiftItem,
  isOvernightSecurityShift,
  isOvernightCheckout,
  checkAttendanceWindow,
  getSecurityShiftCheckInStatus,
  getAutoSelectSecurityShift,
  calculateSecurity30DayRecap,
  buildSecurityShiftSessions,
} from '../src/lib/scheduleEngine.ts'

import {
  isOvernightSecurityShift as dateDisplayIsOvernight,
  getSecurityDisplayDate,
  formatSecurityDisplayDate,
  isSecurityOvernightCheckoutInRange,
} from '../src/lib/securityDateDisplay.ts'

import type { AttendanceRecord } from '../src/types/attendance.ts'

let passCount = 0
let failCount = 0

function assert(desc: string, condition: boolean, extra?: unknown) {
  if (condition) {
    passCount++
    console.log(`  ✅ ${desc}`)
  } else {
    failCount++
    console.error(`  ❌ FAILED: ${desc}`)
    if (extra !== undefined) {
      console.error('     Details:', extra)
    }
  }
}

function jktDate(dateStr: string, hour: number, min: number): Date {
  const pad = (n: number) => String(n).padStart(2, '0')
  return new Date(`${dateStr}T${pad(hour)}:${pad(min)}:00+07:00`)
}

const FRI = '2026-11-06' // Jumat
const SAT = '2026-11-07' // Sabtu
const THU = '2026-11-05' // Kamis
const MON = '2026-11-02' // Senin

console.log('============================================================')
console.log('🧪 PENGUJIAN 3 VARIAN SHIFT JUMAT SECURITY SIPATEN')
console.log('============================================================\n')

// ─── 1. Verifikasi DEFAULT_DAY_GROUPS Jumat ───────────────────
console.log('1. Verifikasi DEFAULT_DAY_GROUPS Jumat (3 Varian)')
{
  const fri = DEFAULT_DAY_GROUPS.friday
  assert('Grup Jumat bernama Jumat', fri.name === 'Jumat')
  assert('Grup Jumat mencakup hari ke-5', fri.days.includes(5) && fri.days.length === 1)
  assert('Grup Jumat berisi tepat 3 shift', fri.shifts.length === 3)

  const sReg = fri.shifts[0]
  assert('Shift 1: ID = shift_1_reguler', sReg.id === 'shift_1_reguler')
  assert('Shift 1: Masuk 07:00–07:30', sReg.in_start === '07:00' && sReg.in_end === '07:30')
  assert('Shift 1: Pulang 16:00–16:30', sReg.out_start === '16:00' && sReg.out_end === '16:30')
  assert('Shift 1: Bukan lintas hari', sReg.out_next_day === false)

  const sPjg = fri.shifts[1]
  assert('Shift 2: ID = shift_1_panjang', sPjg.id === 'shift_1_panjang')
  assert('Shift 2: Masuk 07:00–07:30', sPjg.in_start === '07:00' && sPjg.in_end === '07:30')
  assert('Shift 2: Pulang 19:00–19:30', sPjg.out_start === '19:00' && sPjg.out_end === '19:30')
  assert('Shift 2: Bukan lintas hari', sPjg.out_next_day === false)

  const sMlm = fri.shifts[2]
  assert('Shift 3: ID = shift_2_malam', sMlm.id === 'shift_2_malam')
  assert('Shift 3: Masuk 19:00–19:30', sMlm.in_start === '19:00' && sMlm.in_end === '19:30')
  assert('Shift 3: Pulang 07:00–07:30 H+1', sMlm.out_start === '07:00' && sMlm.out_end === '07:30')
  assert('Shift 3: Lintas hari (out_next_day = true)', sMlm.out_next_day === true)
}

// ─── 2. getSecurityAvailableOptions ───────────────────────────
console.log('\n2. getSecurityAvailableOptions untuk Hari Jumat')
{
  const opts = getSecurityAvailableOptions(FRI)
  assert('Jumat mengembalikan tepat 3 opsi', opts.length === 3)
  assert('Opsi 1: shift_1_reguler', opts[0] === 'shift_1_reguler')
  assert('Opsi 2: shift_1_panjang', opts[1] === 'shift_1_panjang')
  assert('Opsi 3: shift_2_malam', opts[2] === 'shift_2_malam')
  assert('Hari Senin tetap 3 shift lama', getSecurityAvailableOptions(MON).join(',') === 'Shift I,Shift II,Shift III')
  assert('Hari Sabtu tetap 2 sesi weekend', getSecurityAvailableOptions(SAT).join(',') === 'Shift I,Shift II')
}

// ─── 3. getSecurityShiftItem & Backward Compatibility ─────────
console.log('\n3. getSecurityShiftItem & Backward Compatibility')
{
  // Exact ID lookups
  const reg = getSecurityShiftItem(FRI, 'shift_1_reguler')
  assert('getSecurityShiftItem(FRI, shift_1_reguler) pulang 16:00', reg.out_start === '16:00' && reg.out_end === '16:30')
  assert('shift_1_reguler out_next_day = false', reg.out_next_day === false)

  const pjg = getSecurityShiftItem(FRI, 'shift_1_panjang')
  assert('getSecurityShiftItem(FRI, shift_1_panjang) pulang 19:00', pjg.out_start === '19:00' && pjg.out_end === '19:30')
  assert('shift_1_panjang out_next_day = false', pjg.out_next_day === false)

  const mlm = getSecurityShiftItem(FRI, 'shift_2_malam')
  assert('getSecurityShiftItem(FRI, shift_2_malam) pulang 07:00 H+1', mlm.out_start === '07:00' && mlm.out_end === '07:30')
  assert('shift_2_malam out_next_day = true', mlm.out_next_day === true)

  // Backward compatibility: old 'Shift I' maps to shift_1_panjang (12 Jam, out 19:00)
  const legacyS1 = getSecurityShiftItem(FRI, 'Shift I')
  assert('Legacy "Shift I" Jumat dipetakan ke shift_1_panjang (pulang 19:00)', legacyS1.out_start === '19:00' && legacyS1.id === 'shift_1_panjang')
  assert('Legacy "Shift 1" Jumat juga dipetakan ke shift_1_panjang', getSecurityShiftItem(FRI, 'Shift 1').id === 'shift_1_panjang')

  // Backward compatibility: old 'Shift II' maps to shift_2_malam (out 07:00 H+1)
  const legacyS2 = getSecurityShiftItem(FRI, 'Shift II')
  assert('Legacy "Shift II" Jumat dipetakan ke shift_2_malam (pulang 07:00 H+1)', legacyS2.out_start === '07:00' && legacyS2.id === 'shift_2_malam')
  assert('Legacy "Shift 2" Jumat juga dipetakan ke shift_2_malam', getSecurityShiftItem(FRI, 'Shift 2').id === 'shift_2_malam')

  // Senin–Kamis tetap tidak berubah
  const monS1 = getSecurityShiftItem(MON, 'Shift I')
  assert('Senin Shift I tetap pulang 16:00', monS1.out_start === '16:00')
}

// ─── 4. isOvernightSecurityShift & isOvernightCheckout ────────
console.log('\n4. Deteksi Shift Overnight (Lintas Hari)')
{
  // Schedule engine helper
  assert('shift_1_reguler BUKAN overnight', isOvernightSecurityShift(FRI, 'shift_1_reguler') === false)
  assert('shift_1_panjang BUKAN overnight', isOvernightSecurityShift(FRI, 'shift_1_panjang') === false)
  assert('shift_2_malam ADALAH overnight', isOvernightSecurityShift(FRI, 'shift_2_malam') === true)
  assert('Legacy Shift I Jumat BUKAN overnight', isOvernightSecurityShift(FRI, 'Shift I') === false)
  assert('Legacy Shift II Jumat ADALAH overnight', isOvernightSecurityShift(FRI, 'Shift II') === true)

  // Checkout next morning (Sabtu pagi check-out untuk Jumat malam)
  assert('Sabtu pagi check-out shift_2_malam terdeteksi overnight', isOvernightCheckout(SAT, 'shift_2_malam') === true)
  assert('Sabtu pagi check-out legacy Shift II terdeteksi overnight', isOvernightCheckout(SAT, 'Shift II') === true)
  assert('Sabtu pagi check-out shift_1_reguler BUKAN overnight', isOvernightCheckout(SAT, 'shift_1_reguler') === false)
  assert('Sabtu pagi check-out shift_1_panjang BUKAN overnight', isOvernightCheckout(SAT, 'shift_1_panjang') === false)

  // Hari lain tetap benar
  assert('Kamis Shift III overnight', isOvernightSecurityShift(THU, 'Shift III') === true)
  assert('Kamis Shift I bukan overnight', isOvernightSecurityShift(THU, 'Shift I') === false)
  assert('Sabtu Shift II overnight', isOvernightSecurityShift(SAT, 'Shift II') === true)
  assert('Sabtu Sesi Malam overnight', isOvernightSecurityShift(SAT, 'Sesi Malam') === true)
}

// ─── 5. securityDateDisplay helpers ───────────────────────────
console.log('\n5. securityDateDisplay & Format H+1')
{
  // dateDisplayIsOvernight
  assert('dateDisplay: shift_1_reguler false', dateDisplayIsOvernight(FRI, 'shift_1_reguler') === false)
  assert('dateDisplay: shift_1_panjang false', dateDisplayIsOvernight(FRI, 'shift_1_panjang') === false)
  assert('dateDisplay: shift_2_malam true', dateDisplayIsOvernight(FRI, 'shift_2_malam') === true)
  assert('dateDisplay: Legacy Shift II true', dateDisplayIsOvernight(FRI, 'Shift II') === true)
  assert('dateDisplay: Legacy Shift I false', dateDisplayIsOvernight(FRI, 'Shift I') === false)

  // getSecurityDisplayDate
  const dReg = getSecurityDisplayDate(FRI, 'shift_1_reguler', 'pulang', 'Security')
  assert('Display date shift_1_reguler pulang = 2026-11-06 (same day)', dReg.displayDate === FRI && !dReg.isNextDay)

  const dPjg = getSecurityDisplayDate(FRI, 'shift_1_panjang', 'pulang', 'Security')
  assert('Display date shift_1_panjang pulang = 2026-11-06 (same day)', dPjg.displayDate === FRI && !dPjg.isNextDay)

  const dMlm = getSecurityDisplayDate(FRI, 'shift_2_malam', 'pulang', 'Security')
  assert('Display date shift_2_malam pulang = 2026-11-07 (H+1 Sabtu)', dMlm.displayDate === SAT && dMlm.isNextDay)

  const dLegacyMlm = getSecurityDisplayDate(FRI, 'Shift II', 'pulang', 'Security')
  assert('Display date Legacy Shift II pulang = 2026-11-07 (H+1)', dLegacyMlm.displayDate === SAT && dLegacyMlm.isNextDay)

  // formatSecurityDisplayDate string rendering
  assert('Format shift_1_reguler pulang: tanpa H+1', formatSecurityDisplayDate(FRI, 'shift_1_reguler', 'pulang', 'Security') === '06 Nov 2026')
  assert('Format shift_1_panjang pulang: tanpa H+1', formatSecurityDisplayDate(FRI, 'shift_1_panjang', 'pulang', 'Security') === '06 Nov 2026')
  assert('Format shift_2_malam pulang: berlabel (H+1)', formatSecurityDisplayDate(FRI, 'shift_2_malam', 'pulang', 'Security') === '07 Nov 2026 (H+1)')
  assert('Format shift_2_malam masuk: tanggal Jumat tanpa H+1', formatSecurityDisplayDate(FRI, 'shift_2_malam', 'masuk', 'Security') === '06 Nov 2026')

  // isSecurityOvernightCheckoutInRange
  const dummyMlmRecord: AttendanceRecord = {
    id: 'rec-fri-mlm',
    employee_name: 'Ahmad Security',
    normalized_name: 'ahmad security',
    category: 'Security',
    attendance_type: 'pulang',
    work_date: FRI,
    shift: 'shift_2_malam',
    recorded_at: '2026-11-07T07:15:00+07:00',
    attendance_status: 'tepat_waktu',
    is_suspicious: false,
    review_status: 'sudah_diperiksa',
  }
  assert('Record shift_2_malam pulang terdeteksi in range tanggal Sabtu (SAT)', isSecurityOvernightCheckoutInRange(dummyMlmRecord, SAT, SAT) === true)
  assert('Record shift_2_malam pulang di luar range Minggu (SUN)', isSecurityOvernightCheckoutInRange(dummyMlmRecord, '2026-11-08', '2026-11-08') === false)
}

// ─── 6. checkAttendanceWindow untuk ketiga varian Jumat ────────
console.log('\n6. checkAttendanceWindow untuk ketiga varian Jumat')
{
  // shift_1_reguler: masuk 07:00–07:30, pulang 16:00–16:30
  assert('Reguler masuk 06:59: not_yet', checkAttendanceWindow('Security', 'masuk', 'shift_1_reguler', FRI, jktDate(FRI, 6, 59)) === 'not_yet')
  assert('Reguler masuk 07:15: open', checkAttendanceWindow('Security', 'masuk', 'shift_1_reguler', FRI, jktDate(FRI, 7, 15)) === 'open')
  assert('Reguler masuk 07:31: closed_accept', checkAttendanceWindow('Security', 'masuk', 'shift_1_reguler', FRI, jktDate(FRI, 7, 31)) === 'closed_accept')
  assert('Reguler pulang 15:59: not_yet', checkAttendanceWindow('Security', 'pulang', 'shift_1_reguler', FRI, jktDate(FRI, 15, 59)) === 'not_yet')
  assert('Reguler pulang 16:15: open', checkAttendanceWindow('Security', 'pulang', 'shift_1_reguler', FRI, jktDate(FRI, 16, 15)) === 'open')
  assert('Reguler pulang 16:31: closed_accept', checkAttendanceWindow('Security', 'pulang', 'shift_1_reguler', FRI, jktDate(FRI, 16, 31)) === 'closed_accept')

  // shift_1_panjang: masuk 07:00–07:30, pulang 19:00–19:30
  assert('Panjang masuk 07:15: open', checkAttendanceWindow('Security', 'masuk', 'shift_1_panjang', FRI, jktDate(FRI, 7, 15)) === 'open')
  assert('Panjang pulang 16:15: not_yet (belum jam 19.00)', checkAttendanceWindow('Security', 'pulang', 'shift_1_panjang', FRI, jktDate(FRI, 16, 15)) === 'not_yet')
  assert('Panjang pulang 19:15: open', checkAttendanceWindow('Security', 'pulang', 'shift_1_panjang', FRI, jktDate(FRI, 19, 15)) === 'open')
  assert('Panjang pulang 19:31: closed_accept', checkAttendanceWindow('Security', 'pulang', 'shift_1_panjang', FRI, jktDate(FRI, 19, 31)) === 'closed_accept')

  // shift_2_malam: masuk 19:00–19:30, pulang 07:00–07:30 H+1 (Sabtu)
  assert('Malam masuk 18:59: not_yet', checkAttendanceWindow('Security', 'masuk', 'shift_2_malam', FRI, jktDate(FRI, 18, 59)) === 'not_yet')
  assert('Malam masuk 19:15: open', checkAttendanceWindow('Security', 'masuk', 'shift_2_malam', FRI, jktDate(FRI, 19, 15)) === 'open')
  assert('Malam pulang Sabtu 06:59: not_yet', checkAttendanceWindow('Security', 'pulang', 'shift_2_malam', FRI, jktDate(SAT, 6, 59)) === 'not_yet')
  assert('Malam pulang Sabtu 07:15: open (H+1)', checkAttendanceWindow('Security', 'pulang', 'shift_2_malam', FRI, jktDate(SAT, 7, 15)) === 'open')
  assert('Malam pulang Sabtu 07:31: closed_accept', checkAttendanceWindow('Security', 'pulang', 'shift_2_malam', FRI, jktDate(SAT, 7, 31)) === 'closed_accept')
}

// ─── 7. Status & Label Display ────────────────────────────────
console.log('\n7. Status & Label Display getSecurityShiftCheckInStatus')
{
  const sReg = getSecurityShiftCheckInStatus('shift_1_reguler', FRI, jktDate(FRI, 7, 15))
  assert('Label Shift I Reguler benar', sReg.label === 'Shift I — Reguler')
  assert('Sublabel Shift I Reguler menyebut 16:00', sReg.sublabel.includes('16:00'))

  const sPjg = getSecurityShiftCheckInStatus('shift_1_panjang', FRI, jktDate(FRI, 7, 15))
  assert('Label Shift I Panjang benar', sPjg.label === 'Shift I — Panjang' || sPjg.label === 'Shift I — Panjang (12 Jam)')
  assert('Sublabel Shift I Panjang menyebut 19:00', sPjg.sublabel.includes('19:00'))

  const sMlm = getSecurityShiftCheckInStatus('shift_2_malam', FRI, jktDate(FRI, 19, 15))
  assert('Label Shift II Malam benar', sMlm.label === 'Shift II — Malam')
  assert('Sublabel Shift II Malam menyebut H+1', sMlm.sublabel.includes('H+1'))
}

// ─── 8. Sesi Recap & Riwayat Presensi ─────────────────────────
console.log('\n8. Sesi Recap & Riwayat Presensi (buildSecurityShiftSessions)')
{
  const mockRecords: AttendanceRecord[] = [
    {
      id: 'rec-1',
      employee_name: 'Budi Security',
      normalized_name: 'budi security',
      category: 'Security',
      attendance_type: 'masuk',
      work_date: FRI,
      shift: 'shift_1_reguler',
      recorded_at: '2026-11-06T07:10:00+07:00',
      attendance_status: 'tepat_waktu',
      is_suspicious: false,
      review_status: 'sudah_diperiksa',
    },
    {
      id: 'rec-2',
      employee_name: 'Budi Security',
      normalized_name: 'budi security',
      category: 'Security',
      attendance_type: 'pulang',
      work_date: FRI,
      shift: 'shift_1_reguler',
      recorded_at: '2026-11-06T16:15:00+07:00',
      attendance_status: 'tepat_waktu',
      is_suspicious: false,
      review_status: 'sudah_diperiksa',
    },
    {
      id: 'rec-3',
      employee_name: 'Candra Security',
      normalized_name: 'candra security',
      category: 'Security',
      attendance_type: 'masuk',
      work_date: FRI,
      shift: 'shift_2_malam',
      recorded_at: '2026-11-06T19:10:00+07:00',
      attendance_status: 'tepat_waktu',
      is_suspicious: false,
      review_status: 'sudah_diperiksa',
    },
    {
      id: 'rec-4',
      employee_name: 'Candra Security',
      normalized_name: 'candra security',
      category: 'Security',
      attendance_type: 'pulang',
      work_date: FRI,
      shift: 'shift_2_malam',
      recorded_at: '2026-11-07T07:10:00+07:00',
      attendance_status: 'tepat_waktu',
      is_suspicious: false,
      review_status: 'sudah_diperiksa',
    },
  ]

  const sessions = buildSecurityShiftSessions(mockRecords as any, FRI, THU, jktDate(SAT, 10, 0))
  assert('Terdapat 2 sesi shift terpisah', sessions.length === 2)

  const regSession = sessions.find(s => s.shift === 'shift_1_reguler')
  assert('Sesi reguler selesai', regSession?.status === 'selesai')
  assert('Sesi reguler bukan overnight', regSession?.isOvernight === false)
  assert('Sesi reguler pulangTime tidak ada (H+1)', !regSession?.pulangTime.includes('(H+1)'))

  const mlmSession = sessions.find(s => s.shift === 'shift_2_malam')
  assert('Sesi malam selesai', mlmSession?.status === 'selesai')
  assert('Sesi malam isOvernight = true', mlmSession?.isOvernight === true)
  assert('Sesi malam pulangTime menyertakan penanda (H+1)', mlmSession?.pulangTime.includes('(H+1)') === true)
}

console.log('\n============================================================')
if (failCount === 0) {
  console.log(`🎉 SELURUH ${passCount} PENGUJIAN 3 VARIAN SHIFT JUMAT LULUS SEMPURNA!`)
} else {
  console.error(`💥 TERDAPAT ${failCount} PENGUJIAN GAGAL DARI TOTAL ${passCount + failCount}`)
  process.exit(1)
}
console.log('============================================================\n')
