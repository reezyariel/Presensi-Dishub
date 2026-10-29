/**
 * SIPATEN — CS (Cleaning Service) Dashboard & Weekly Attendance Test Suite
 * Run with: npx tsx tests/cs_dashboard.test.ts
 */

import {
  getJakartaWeekDays,
  calculateCSWeeklyAttendance,
  calculate30DayRecap,
  type WeekDayCount,
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
console.log('🧹  SIPATEN — CS Weekly Chart & 30-Day Recap Test Suite')
console.log('============================================================\n')

// ─────────────────────────────────────────────────────────────────────────────
// 1. Jakarta Weekly Calendar Engine Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log('TEST 1: getJakartaWeekDays — Struktur & Urutan Hari (Senin – Minggu)')
{
  const refDate = new Date('2026-10-28T09:00:00+07:00') // Rabu, 28 Okt 2026
  const week = getJakartaWeekDays(refDate)

  assert('Menghasilkan tepat 7 hari', week.length === 7)
  assert('Hari pertama adalah Senin (Sen)', week[0].day === 'Sen')
  assert('Hari terakhir adalah Minggu (Min)', week[6].day === 'Min')
  assert('Senin adalah 2026-10-26', week[0].dateStr === '2026-10-26', `got ${week[0].dateStr}`)
  assert('Rabu adalah 2026-10-28', week[2].dateStr === '2026-10-28', `got ${week[2].dateStr}`)
  assert('Minggu adalah 2026-11-01', week[6].dateStr === '2026-11-01', `got ${week[6].dateStr}`)

  // Memastikan tanggal berurutan tanpa jeda
  let consecutive = true
  for (let i = 0; i < 6; i++) {
    const d1 = new Date(week[i].dateStr).getTime()
    const d2 = new Date(week[i + 1].dateStr).getTime()
    if (d2 - d1 !== 86400000) consecutive = false
  }
  assert('Semua tanggal berurutan tepat 24 jam', consecutive)
}

console.log('\nTEST 2: getJakartaWeekDays — Referensi Hari Minggu (Boundary End of Week)')
{
  // Minggu, 1 Nov 2026: harus tetap mengembalikan minggu yang sama (Senin 26 Okt s/d Minggu 1 Nov)
  const sundayRef = new Date('2026-11-01T15:00:00+07:00')
  const week = getJakartaWeekDays(sundayRef)

  assert('Senin tetap 2026-10-26', week[0].dateStr === '2026-10-26', `got ${week[0].dateStr}`)
  assert('Minggu tetap 2026-11-01', week[6].dateStr === '2026-11-01', `got ${week[6].dateStr}`)
}

console.log('\nTEST 3: getJakartaWeekDays — Referensi Hari Senin (Boundary Start of Week)')
{
  // Senin, 26 Okt 2026
  const mondayRef = new Date('2026-10-26T07:30:00+07:00')
  const week = getJakartaWeekDays(mondayRef)

  assert('Senin adalah 2026-10-26', week[0].dateStr === '2026-10-26')
  assert('Minggu adalah 2026-11-01', week[6].dateStr === '2026-11-01')
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CS Weekly Attendance Calculation Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 4: calculateCSWeeklyAttendance — Data Kosong (Empty State)')
{
  const week = getJakartaWeekDays(new Date('2026-10-28T09:00:00+07:00'))
  const result = calculateCSWeeklyAttendance(week, [])

  const total = result.reduce((acc, d) => acc + d.count, 0)
  assert('Total kehadiran minggu ini = 0', total === 0)
  assert('Semua hari memiliki count = 0', result.every(d => d.count === 0))
}

console.log('\nTEST 5: calculateCSWeeklyAttendance — Hadir Beberapa Hari (Senin, Rabu, Jumat)')
{
  const week = getJakartaWeekDays(new Date('2026-10-28T09:00:00+07:00'))
  const records = [
    { work_date: '2026-10-26', attendance_type: 'masuk' }, // Senin
    { work_date: '2026-10-28', attendance_type: 'masuk' }, // Rabu
    { work_date: '2026-10-30', attendance_type: 'masuk' }, // Jumat
  ]

  const result = calculateCSWeeklyAttendance(week, records)
  assert('Senin count = 1', result[0].count === 1)
  assert('Selasa count = 0', result[1].count === 0)
  assert('Rabu count = 1', result[2].count === 1)
  assert('Kamis count = 0', result[3].count === 0)
  assert('Jumat count = 1', result[4].count === 1)
  assert('Sabtu count = 0', result[5].count === 0)
  assert('Minggu count = 0', result[6].count === 0)

  const total = result.reduce((acc, d) => acc + d.count, 0)
  assert('Total kehadiran = 3', total === 3)
}

console.log('\nTEST 6: calculateCSWeeklyAttendance — Deduplikasi (Dua Presensi Masuk di Hari Yang Sama)')
{
  const week = getJakartaWeekDays(new Date('2026-10-28T09:00:00+07:00'))
  // Misalnya terjadi duplikasi rekaman masuk untuk hari Rabu
  const records = [
    { work_date: '2026-10-28', attendance_type: 'masuk' },
    { work_date: '2026-10-28', attendance_type: 'masuk' },
  ]

  const result = calculateCSWeeklyAttendance(week, records)
  assert('Rabu count tetap 1 (tidak dihitung 2x)', result[2].count === 1)

  const total = result.reduce((acc, d) => acc + d.count, 0)
  assert('Total kehadiran tetap 1', total === 1)
}

console.log('\nTEST 7: calculateCSWeeklyAttendance — Hanya Tipe Masuk yang Dihitung')
{
  const week = getJakartaWeekDays(new Date('2026-10-28T09:00:00+07:00'))
  // Rekaman istirahat atau pulang tanpa masuk tidak boleh menambah hitungan kehadiran masuk
  const records = [
    { work_date: '2026-10-27', attendance_type: 'istirahat' },
    { work_date: '2026-10-27', attendance_type: 'pulang' },
    { work_date: '2026-10-28', attendance_type: 'masuk' },
  ]

  const result = calculateCSWeeklyAttendance(week, records)
  assert('Selasa count = 0 (hanya ada istirahat/pulang)', result[1].count === 0)
  assert('Rabu count = 1 (ada masuk)', result[2].count === 1)
}

console.log('\nTEST 8: calculateCSWeeklyAttendance — Tanggal di Luar Rentang Minggu Diabaikan')
{
  const week = getJakartaWeekDays(new Date('2026-10-28T09:00:00+07:00'))
  const records = [
    { work_date: '2026-10-15', attendance_type: 'masuk' }, // Minggu lalu
    { work_date: '2026-11-05', attendance_type: 'masuk' }, // Minggu depan
    { work_date: '2026-10-28', attendance_type: 'masuk' }, // Minggu ini (Rabu)
  ]

  const result = calculateCSWeeklyAttendance(week, records)
  const total = result.reduce((acc, d) => acc + d.count, 0)
  assert('Hanya presensi minggu ini yang dihitung (total = 1)', total === 1)
  assert('Rabu count = 1', result[2].count === 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Rekap 30 Hari CS Consistency Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 9: CS 30-Day Recap — Konsistensi Hadir, Terlambat, dan Tepat Waktu')
{
  const refDate = new Date('2026-10-28T09:00:00+07:00')
  const masukRecords = [
    { work_date: '2026-10-26', attendance_type: 'masuk', attendance_status: 'tepat_waktu' },
    { work_date: '2026-10-27', attendance_type: 'masuk', attendance_status: 'terlambat' },
    { work_date: '2026-10-28', attendance_type: 'masuk', attendance_status: 'tepat_waktu' },
  ]

  const stats = calculate30DayRecap('CS', masukRecords, '2026-10-26', refDate)
  assert('Hadir = 3 hari', stats.hadir === 3)
  assert('Terlambat = 1 hari', stats.terlambat === 1)

  const tepatWaktu = Math.max(stats.hadir - stats.terlambat, 0)
  assert('Tepat Waktu = 2 hari (3 - 1)', tepatWaktu === 2)
}

console.log('\n============================================================')
if (failed === 0) {
  console.log(`🎉 SEMUA ${passed} TES CS DASHBOARD BERHASIL DENGAN SEMPURNA!`)
} else {
  console.error(`💥 ${failed} TES GAGAL! (${passed} berhasil)`)
  process.exit(1)
}
console.log('============================================================\n')
