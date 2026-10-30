/**
 * SIPATEN — Authoritative 30-Day Attendance Recap Calculation Tests
 *
 * Directly tests calculate30DayRecap from src/lib/scheduleEngine.ts.
 * Run with: npx tsx tests/recap30days.test.ts
 */

import { calculate30DayRecap, type RecapMasukRecord } from '../src/lib/scheduleEngine'

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

function makeMasuk(work_date: string, status = 'tepat_waktu'): RecapMasukRecord {
  return { work_date, attendance_type: 'masuk', attendance_status: status }
}

// Fixed Reference Time for Deterministic Testing:
// Wednesday, 2026-10-21 09:35:30 WIB (UTC: 2026-10-21T02:35:30Z)
// Day of week: Rabu (Wednesday). Check-in window CS (07:00-11:59) is OPEN at 09:35 WIB.
const WEDNESDAY_MORNING = new Date('2026-10-21T02:35:30Z')

// Wednesday, 2026-10-21 14:00:00 WIB (UTC: 2026-10-21T07:00:00Z)
// Day of week: Rabu (Wednesday). Check-in window CS (closes at 11:59) is CLOSED at 14:00 WIB.
const WEDNESDAY_AFTERNOON = new Date('2026-10-21T07:00:00Z')

// Pre-computed verified calendar stats for the 30-day window (i=1..30)
// from Wednesday 2026-10-21:
// Range: 2026-09-21 (Mon) to 2026-10-20 (Tue)
// - Total calendar days: 30
// - CS (Mon-Sun, 7 days): all 30 calendar days are workdays = 30
// - Security (Mon-Sat): exactly 26 workdays (30 - 4 Sundays: Oct-18, Oct-11, Oct-04, Sep-27 = 26)
const CS_30DAY_WORKDAYS = 30   // CS sekarang beroperasi Senin–Minggu (7 hari penuh)
const SEC_30DAY_WORKDAYS = 26

console.log('\n============================================================')
console.log('📅  SIPATEN — Rekap 30 Hari Calculation Test Suite')
console.log('============================================================\n')

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pegawai Tanpa Riwayat Presensi
// ─────────────────────────────────────────────────────────────────────────────
console.log('TEST 1: Pegawai Baru — Tanpa Riwayat Presensi (Bergabung Hari Ini)')
{
  const joinDate = '2026-10-21' // joined today
  const result = calculate30DayRecap('CS', [], joinDate, WEDNESDAY_MORNING)
  assert('hadir = 0', result.hadir === 0)
  assert('terlambat = 0', result.terlambat === 0)
  assert('absen = 0 (bergabung hari ini, belum ada hari kerja jatuh tempo lampau)', result.tidakHadir === 0, `got ${result.tidakHadir}`)
}

console.log('\nTEST 2: Pegawai Tanpa Riwayat Presensi & Tanpa Join Date (Uninitialized Account)')
{
  // Demo/fresh account with empty attendance history & no join date
  const result = calculate30DayRecap('CS', [], null, WEDNESDAY_MORNING)
  assert('hadir = 0', result.hadir === 0)
  assert('terlambat = 0', result.terlambat === 0)
  assert('absen = 0 (jangan mengarang 22 absen untuk akun tanpa data)', result.tidakHadir === 0, `got ${result.tidakHadir}`)
}

console.log('\nTEST 3: Pegawai Security Tanpa Riwayat Presensi (Bergabung Hari Ini)')
{
  const result = calculate30DayRecap('Security', [], '2026-10-21', WEDNESDAY_MORNING, 'Shift I')
  assert('hadir = 0', result.hadir === 0)
  assert('absen = 0', result.tidakHadir === 0, `got ${result.tidakHadir}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Hari Kerja Mendatang & Hari Ini (Ongoing vs Closed)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 4: Hari Mendatang — Tidak Pernah Dihitung Sebagai Absen')
{
  // Join date is in the future
  const result = calculate30DayRecap('CS', [], '2027-01-01', WEDNESDAY_MORNING)
  assert('absen = 0 jika tanggal bergabung di masa depan', result.tidakHadir === 0, `got ${result.tidakHadir}`)
}

console.log('\nTEST 5: Hari Ini — Saat Jendela Masuk Masih Terbuka (Pagi: 09:35 WIB)')
{
  // Pegawai CS yang sudah bergabung sejak 2026-09-21 (30 hari lalu)
  // Belum check-in pagi ini (09:35 WIB), jendela CS masih buka sampai 11:59 WIB.
  // Hari ini TIDAK boleh dihitung absen. Absen hanya 30 hari lampau (i=1..30).
  // CS beroperasi 7 hari = semua 30 hari kalender adalah hari kerja.
  const result = calculate30DayRecap('CS', [], '2026-09-21', WEDNESDAY_MORNING)
  assert(`absen = ${CS_30DAY_WORKDAYS} (hari ini belum jatuh tempo karena jendela masih buka)`, result.tidakHadir === CS_30DAY_WORKDAYS, `got ${result.tidakHadir}`)
}

console.log('\nTEST 6: Hari Ini — Tetap Tidak Dihitung Sebagai Absen Sepanjang Hari Berjalan')
{
  // Hari ini (Rabu) adalah hari operasional berjalan.
  // Sesuai Ketentuan 4, hari ini tidak dihitung sebagai absen pada Rekap 30 Hari.
  // CS 7 hari = 30 hari kerja lampau.
  const result = calculate30DayRecap('CS', [], '2026-09-21', WEDNESDAY_AFTERNOON)
  assert(`absen = ${CS_30DAY_WORKDAYS} (hari ini tidak dihitung absen sepanjang hari berjalan)`, result.tidakHadir === CS_30DAY_WORKDAYS, `got ${result.tidakHadir}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CS 7 Hari vs Security
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 7: CS Beroperasi 7 Hari — Seluruh Hari Kalender Adalah Hari Kerja CS')
{
  // CS sekarang beroperasi Senin-Minggu: semua 30 hari kalender = hari kerja
  const result = calculate30DayRecap('CS', [], '2026-09-21', WEDNESDAY_MORNING)
  assert(`CS absen = ${CS_30DAY_WORKDAYS} (semua 30 hari kalender adalah hari kerja)`, result.tidakHadir === CS_30DAY_WORKDAYS, `got ${result.tidakHadir}`)
}

console.log('\nTEST 8: CS (30 hari) vs Security (26 hari) — CS Punya Lebih Banyak Hari Kerja')
{
  // CS beroperasi 7 hari (30), Security beroperasi Mon-Sat (26)
  // CS HARUS memiliki MORE scheduled workdays daripada Security
  const csResult = calculate30DayRecap('CS', [], '2026-09-21', WEDNESDAY_MORNING)
  const secResult = calculate30DayRecap('Security', [], '2026-09-21', WEDNESDAY_MORNING, 'Shift I')
  assert(`CS hari kerja (${csResult.tidakHadir}) > Security (${secResult.tidakHadir})`, csResult.tidakHadir > secResult.tidakHadir)
  assert(`Security absen = ${SEC_30DAY_WORKDAYS} (Minggu libur, Sabtu hari kerja)`, secResult.tidakHadir === SEC_30DAY_WORKDAYS, `got ${secResult.tidakHadir}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tanggal Bergabung / Mulai Bekerja (Join Date)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 9: Tanggal Mulai Bekerja — Hari Sebelum Bergabung Tidak Dihitung')
{
  // Pegawai bergabung pada 2026-10-19 (Senin).
  // Hari kerja sebelum 2026-10-19 (Jumat 2026-10-16 dsb) TIDAK BOLEH dihitung absen!
  // Dari Senin 2026-10-19 sampai kemarin Selasa 2026-10-20: tepat 2 hari kerja CS.
  const result = calculate30DayRecap('CS', [], '2026-10-19', WEDNESDAY_MORNING)
  assert('absen = 2 (hanya Senin 19 Okt & Selasa 20 Okt yang jatuh tempo)', result.tidakHadir === 2, `got ${result.tidakHadir}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Deduplikasi Presensi & Metrik Berbasis Hari Kerja
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 10: Deduplikasi — Dua Presensi Masuk di Hari Yang Sama Tetap Dihitung 1 Hari')
{
  // Pegawai presensi 2x pada 2026-10-20 karena retry jaringan
  const records = [
    makeMasuk('2026-10-20', 'tepat_waktu'),
    makeMasuk('2026-10-20', 'tepat_waktu'),
  ]
  const result = calculate30DayRecap('CS', records, '2026-10-19', WEDNESDAY_MORNING)
  assert('hadir = 1 (1 hari kerja hadir, bukan 2 rekaman)', result.hadir === 1)
  assert('absen = 1 (Senin 19 Okt tidak hadir, Selasa 20 Okt hadir)', result.tidakHadir === 1, `got ${result.tidakHadir}`)
}

console.log('\nTEST 11: Terlambat — Status Terlambat Dihitung Berdasarkan Hari Kerja')
{
  const records = [
    makeMasuk('2026-10-20', 'terlambat'),
    makeMasuk('2026-10-20', 'terlambat'), // duplikat di hari yang sama
    makeMasuk('2026-10-19', 'tepat_waktu'),
  ]
  const result = calculate30DayRecap('CS', records, '2026-10-19', WEDNESDAY_MORNING)
  assert('hadir = 2', result.hadir === 2)
  assert('terlambat = 1 (1 hari kerja terlambat)', result.terlambat === 1)
  assert('absen = 0 (semua hari kerja sejak 19 Okt terpenuhi)', result.tidakHadir === 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Security Shift Malam (Shift III Lintas Hari)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 12: Security Shift III — Presensi Masuk Malam Hari Meng-cover Hari Tersebut')
{
  // Pegawai Security Shift III masuk pada 2026-10-20 pukul 20:00 WIB (work_date: 2026-10-20).
  // Presensi pulang dilakukan besok paginya (2026-10-21 07:30 H+1).
  // work_date rekaman masuk adalah 2026-10-20.
  // Pegawai bergabung pada 2026-10-19.
  // Hari kerja lampau: 2026-10-19 (Mon) dan 2026-10-20 (Tue) = 2 hari.
  // Hari 2026-10-20 tercover presensi masuk Shift III -> absen = 1 (19 Okt).
  const records = [makeMasuk('2026-10-20', 'tepat_waktu')]
  const result = calculate30DayRecap('Security', records, '2026-10-19', WEDNESDAY_MORNING, 'Shift III')
  assert('hadir = 1 (Shift III pada 20 Okt)', result.hadir === 1)
  assert('absen = 1 (19 Okt absen, 20 Okt hadir Shift III)', result.tidakHadir === 1, `got ${result.tidakHadir}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Kehadiran Hari Ini Tidak Mengurangi Absen Hari Lampau
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 13: Presensi Masuk Hari Ini Tidak Menghapus Absen Hari Kemarin')
{
  // Pegawai bergabung 2026-10-19 (Mon).
  // Hari lampau yang jatuh tempo: 19 Okt & 20 Okt.
  // Pegawai TIDAK hadir pada 19 Okt dan 20 Okt (2 hari absen).
  // Pegawai hadir HARI INI (21 Okt).
  // Hadir harus = 1. Absen harus TETAP = 2 (tidak boleh berkurang menjadi 1 karena kehadiran hari ini).
  const records = [makeMasuk('2026-10-21', 'tepat_waktu')]
  const result = calculate30DayRecap('CS', records, '2026-10-19', WEDNESDAY_MORNING)
  assert('hadir = 1 (hadir hari ini)', result.hadir === 1)
  assert('absen = 2 (absen 19 & 20 Okt tidak terhapus)', result.tidakHadir === 2, `got ${result.tidakHadir}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Seluruh Hari Kerja Terpenuhi → Absen = 0
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 14: Seluruh Hari Kerja Terpenuhi → Absen = 0')
{
  // Pegawai bergabung 2026-10-13 (Selasa).
  // Hari kerja lampau CS (7 hari penuh) dari 2026-10-13 s.d. 2026-10-20:
  //   13(Sel), 14(Rab), 15(Kam), 16(Jum), 17(Sab), 18(Min), 19(Sen), 20(Sel) = 8 hari
  // Records harus cover semua 8 hari agar absen = 0.
  const records = [
    makeMasuk('2026-10-13'),
    makeMasuk('2026-10-14'),
    makeMasuk('2026-10-15'),
    makeMasuk('2026-10-16'),
    makeMasuk('2026-10-17'), // Sabtu — sekarang hari kerja CS
    makeMasuk('2026-10-18'), // Minggu — sekarang hari kerja CS
    makeMasuk('2026-10-19'),
    makeMasuk('2026-10-20'),
  ]
  const result = calculate30DayRecap('CS', records, '2026-10-13', WEDNESDAY_MORNING)
  assert('hadir = 8', result.hadir === 8, `got ${result.hadir}`)
  assert('absen = 0', result.tidakHadir === 0, `got ${result.tidakHadir}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Sabtu dan Minggu Dihitung Sebagai Hari Kerja CS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 15: CS — Sabtu dan Minggu Dihitung Absen Jika Tidak Hadir')
{
  // Pegawai bergabung 2026-10-17 (Sabtu), hari lampau: Sab 17, Min 18, Sen 19, Sel 20 = 4 hari
  // Records kosong → absen = 4
  const result = calculate30DayRecap('CS', [], '2026-10-17', WEDNESDAY_MORNING)
  assert('absen = 4 (Sab 17, Min 18, Sen 19, Sel 20 semua terhitung)', result.tidakHadir === 4, `got ${result.tidakHadir}`)
}

console.log('\nTEST 16: CS — Hadir Sabtu dan Minggu Mengurangi Absen')
{
  // Bergabung 2026-10-17 (Sabtu), hadir Sab 17 & Min 18, absen Sen 19 & Sel 20
  const records = [
    makeMasuk('2026-10-17'), // Sabtu
    makeMasuk('2026-10-18'), // Minggu
  ]
  const result = calculate30DayRecap('CS', records, '2026-10-17', WEDNESDAY_MORNING)
  assert('hadir = 2 (Sab 17 & Min 18)', result.hadir === 2, `got ${result.hadir}`)
  assert('absen = 2 (Sen 19 & Sel 20 tidak hadir)', result.tidakHadir === 2, `got ${result.tidakHadir}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n============================================================')
if (failed === 0) {
  console.log(`🎉 SEMUA ${passed} TES REKAP 30 HARI BERHASIL DENGAN SEMPURNA!`)
} else {
  console.error(`⚠️  ${passed} berhasil, ${failed} GAGAL`)
  process.exit(1)
}
console.log('============================================================\n')
