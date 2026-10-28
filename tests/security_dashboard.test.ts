/**
 * SIPATEN — Security Dashboard & Operational Recap Test Suite
 * Run with: npx tsx tests/security_dashboard.test.ts
 */

import {
  calculateSecurity30DayRecap,
  buildSecurityShiftSessions,
  type SecurityRecapRecord,
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

console.log('\n============================================================')
console.log('🛡️  SIPATEN — Security Operational Recap & Session Tests')
console.log('============================================================\n')

const TODAY = '2026-10-28'
const YESTERDAY = '2026-10-27'
const NOW_MORNING = new Date('2026-10-28T07:15:00+07:00') // 07:15 WIB
const NOW_AFTERNOON = new Date('2026-10-28T14:30:00+07:00') // 14:30 WIB

// TEST 1: Empty records
console.log('TEST 1: Petugas Baru / Tanpa Catatan Presensi')
{
  const recap = calculateSecurity30DayRecap([], TODAY, YESTERDAY, NOW_MORNING)
  assert('shiftSelesai = 0', recap.shiftSelesai === 0)
  assert('keterlambatan = 0', recap.keterlambatan === 0)
  assert('pulangBelumLengkap = 0', recap.pulangBelumLengkap === 0)
  assert('totalCatatan = 0', recap.totalCatatan === 0)
  assert('totalShifts = 0', recap.totalShifts === 0)

  const sessions = buildSecurityShiftSessions([], TODAY, YESTERDAY, NOW_MORNING)
  assert('sessions array is empty', sessions.length === 0)
}

// TEST 2: Shift I Completed Tepat Waktu
console.log('\nTEST 2: Shift I Selesai Tepat Waktu')
{
  const records: SecurityRecapRecord[] = [
    {
      id: 'rec-1',
      work_date: '2026-10-26',
      attendance_type: 'masuk',
      attendance_status: 'tepat_waktu',
      shift: 'Shift I',
      recorded_at: '2026-10-26T07:10:00+07:00',
    },
    {
      id: 'rec-2',
      work_date: '2026-10-26',
      attendance_type: 'pulang',
      attendance_status: 'tepat_waktu',
      shift: 'Shift I',
      recorded_at: '2026-10-26T16:05:00+07:00',
    },
  ]

  const recap = calculateSecurity30DayRecap(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('shiftSelesai = 1', recap.shiftSelesai === 1)
  assert('keterlambatan = 0', recap.keterlambatan === 0)
  assert('pulangBelumLengkap = 0', recap.pulangBelumLengkap === 0)
  assert('totalCatatan = 2', recap.totalCatatan === 2)
  assert('totalShifts = 1', recap.totalShifts === 1)

  const sessions = buildSecurityShiftSessions(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('sessions.length = 1', sessions.length === 1)
  assert('status = selesai', sessions[0].status === 'selesai')
  assert('masukTime = 07:10', sessions[0].masukTime === '07:10')
  assert('pulangTime = 16:05', sessions[0].pulangTime === '16:05')
  assert('isLate = false', sessions[0].isLate === false)
}

// TEST 3: Shift II Terlambat Masuk dan Selesai
console.log('\nTEST 3: Shift II Masuk Terlambat dan Selesai Pulang')
{
  const records: SecurityRecapRecord[] = [
    {
      id: 'rec-3',
      work_date: '2026-10-25',
      attendance_type: 'masuk',
      attendance_status: 'terlambat',
      shift: 'Shift II',
      recorded_at: '2026-10-25T15:45:00+07:00',
    },
    {
      id: 'rec-4',
      work_date: '2026-10-25',
      attendance_type: 'pulang',
      attendance_status: 'tepat_waktu',
      shift: 'Shift II',
      recorded_at: '2026-10-25T19:40:00+07:00',
    },
  ]

  const recap = calculateSecurity30DayRecap(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('shiftSelesai = 1', recap.shiftSelesai === 1)
  assert('keterlambatan = 1', recap.keterlambatan === 1)
  assert('pulangBelumLengkap = 0', recap.pulangBelumLengkap === 0)

  const sessions = buildSecurityShiftSessions(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('isLate = true', sessions[0].isLate === true)
  assert('status = selesai', sessions[0].status === 'selesai')
}

// TEST 4: Shift III Overnight Crossover (Day N masuk + Day N+1 pulang)
console.log('\nTEST 4: Shift III Lintas Hari (Overnight Crossover)')
{
  // Guard entered on 2026-10-27 at 19:45 (Shift III), left on 2026-10-28 at 07:15
  const records: SecurityRecapRecord[] = [
    {
      id: 'rec-5',
      work_date: '2026-10-27',
      attendance_type: 'masuk',
      attendance_status: 'tepat_waktu',
      shift: 'Shift III',
      recorded_at: '2026-10-27T19:45:00+07:00',
    },
    {
      id: 'rec-6',
      work_date: '2026-10-27',
      attendance_type: 'pulang',
      attendance_status: 'tepat_waktu',
      shift: 'Shift III',
      recorded_at: '2026-10-28T07:15:00+07:00',
    },
  ]

  const recap = calculateSecurity30DayRecap(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('shiftSelesai = 1 (keduanya dipasangkan pada shift 27 Okt)', recap.shiftSelesai === 1)
  assert('pulangBelumLengkap = 0', recap.pulangBelumLengkap === 0)
  assert('totalShifts = 1', recap.totalShifts === 1)

  const sessions = buildSecurityShiftSessions(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('sessions[0].isOvernight = true', sessions[0].isOvernight === true)
  assert('pulangTime includes (H+1)', sessions[0].pulangTime.includes('(H+1)'), `got ${sessions[0].pulangTime}`)
}

// TEST 5: Today Active Shift (Masuk recorded today, officer still on duty)
console.log('\nTEST 5: Shift Hari Ini Sedang Berjalan (Sedang Bertugas)')
{
  const records: SecurityRecapRecord[] = [
    {
      id: 'rec-7',
      work_date: TODAY,
      attendance_type: 'masuk',
      attendance_status: 'tepat_waktu',
      shift: 'Shift I',
      recorded_at: '2026-10-28T07:10:00+07:00',
    },
  ]

  // At 07:15 WIB, Shift I pulang window is not yet open
  const recap = calculateSecurity30DayRecap(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('pulangBelumLengkap = 0 (shift hari ini tidak boleh dihukum belum lengkap)', recap.pulangBelumLengkap === 0)
  assert('shiftSelesai = 0', recap.shiftSelesai === 0)
  assert('totalCatatan = 1', recap.totalCatatan === 1)

  const sessions = buildSecurityShiftSessions(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('status = sedang_bertugas', sessions[0].status === 'sedang_bertugas', `got ${sessions[0].status}`)
}

// TEST 6: Past Incomplete Shift (Masuk 4 days ago, never checked out)
console.log('\nTEST 6: Shift Lampau Belum Lengkap (Lupa Absen Pulang)')
{
  const records: SecurityRecapRecord[] = [
    {
      id: 'rec-8',
      work_date: '2026-10-24',
      attendance_type: 'masuk',
      attendance_status: 'tepat_waktu',
      shift: 'Shift I',
      recorded_at: '2026-10-24T07:15:00+07:00',
    },
  ]

  const recap = calculateSecurity30DayRecap(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('pulangBelumLengkap = 1', recap.pulangBelumLengkap === 1)
  assert('shiftSelesai = 0', recap.shiftSelesai === 0)

  const sessions = buildSecurityShiftSessions(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('status = tidak_lengkap', sessions[0].status === 'tidak_lengkap', `got ${sessions[0].status}`)
}

// TEST 7: Chronological Sorting of Sessions (Newest work_date first)
console.log('\nTEST 7: Urutan Riwayat Shift (Terbaru di atas)')
{
  const records: SecurityRecapRecord[] = [
    { id: '1', work_date: '2026-10-20', attendance_type: 'masuk', shift: 'Shift I' },
    { id: '2', work_date: '2026-10-25', attendance_type: 'masuk', shift: 'Shift I' },
    { id: '3', work_date: '2026-10-28', attendance_type: 'masuk', shift: 'Shift I' },
  ]

  const sessions = buildSecurityShiftSessions(records, TODAY, YESTERDAY, NOW_MORNING)
  assert('first session is 2026-10-28', sessions[0].work_date === '2026-10-28')
  assert('second session is 2026-10-25', sessions[1].work_date === '2026-10-25')
  assert('third session is 2026-10-20', sessions[2].work_date === '2026-10-20')
}

console.log('\n============================================================')
if (failed === 0) {
  console.log(`🎉 SEMUA ${passed} TES SECURITY DASHBOARD BERHASIL!`)
} else {
  console.error(`💥 ${failed} TES GAGAL! (${passed} berhasil)`)
  process.exit(1)
}
console.log('============================================================\n')
