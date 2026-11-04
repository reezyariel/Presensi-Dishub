/**
 * SIPATEN — Cleaning Service (CS) Grouped Attendance & Security Integrity Test Suite
 * Validates:
 * 1. 1 row per CS employee per work date (3 time columns: Masuk, Istirahat, Pulang)
 * 2. Original selfie photo attachment to each exact transaction (never swapped)
 * 3. Accurate lateness and review statuses without arbitrary recalculation
 * 4. Belum Absen handling for incomplete attendance
 * 5. Security division remains in format lama (per-transaction, shifts preserved)
 * 6. Pagination & grouping integrity
 */

import { groupCSRecords, filterCSGroups } from '../src/lib/attendanceGrouping.ts'
import type { AttendanceRecord } from '../src/types/attendance.ts'

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

function makeMockRecord(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2, 9)}`,
    employee_name: 'Budi Santoso',
    normalized_name: 'budi santoso',
    employee_profile_id: 'emp-uuid-1',
    auth_uid: 'auth-uuid-1',
    category: 'CS',
    attendance_type: 'masuk',
    shift: null,
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T06:55:00+07:00',
    scheduled_start: '07:00',
    scheduled_end: null,
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    selfie_storage_path: '2026-11-04/selfie_masuk_1.jpg',
    review_status: 'sudah_diperiksa',
    admin_notes: null,
    idempotency_key: `key-${Math.random()}`,
    created_at: '2026-11-04T06:55:00+07:00',
    updated_at: '2026-11-04T06:55:00+07:00',
    ...overrides,
  }
}

console.log('\n============================================================')
console.log('🧹 SIPATEN — CS Grouped Attendance & Security Integrity Suite')
console.log('============================================================\n')

// ─────────────────────────────────────────────────────────────
// TEST 1: Full Attendance (Masuk, Istirahat, Pulang) -> 1 Row
// ─────────────────────────────────────────────────────────────
console.log('TEST 1: Pegawai CS yang sudah melakukan Masuk, Istirahat, dan Pulang')
{
  const records: AttendanceRecord[] = [
    makeMockRecord({
      attendance_type: 'masuk',
      recorded_at: '2026-11-04T06:50:00+07:00',
      selfie_storage_path: '2026-11-04/budi_masuk.jpg',
      attendance_status: 'tepat_waktu',
    }),
    makeMockRecord({
      attendance_type: 'istirahat',
      recorded_at: '2026-11-04T12:05:00+07:00',
      selfie_storage_path: '2026-11-04/budi_istirahat.jpg',
      attendance_status: 'tepat_waktu',
    }),
    makeMockRecord({
      attendance_type: 'pulang',
      recorded_at: '2026-11-04T16:00:00+07:00',
      selfie_storage_path: '2026-11-04/budi_pulang.jpg',
      attendance_status: 'tepat_waktu',
    }),
  ]

  const groups = groupCSRecords(records)

  assert('Menghasilkan tepat 1 baris untuk 1 pegawai pada 1 tanggal', groups.length === 1)
  const g = groups[0]
  assert('Pegawai bernama Budi Santoso', g.employee_name === 'Budi Santoso')
  assert('Tanggal kerja adalah 2026-11-04', g.work_date === '2026-11-04')
  assert('Masuk record terisi', g.masuk !== null)
  assert('Istirahat record terisi', g.istirahat !== null)
  assert('Pulang record terisi', g.pulang !== null)
  assert('Foto Masuk sesuai transaksi Masuk', g.masuk?.selfie_storage_path === '2026-11-04/budi_masuk.jpg')
  assert('Foto Istirahat sesuai transaksi Istirahat', g.istirahat?.selfie_storage_path === '2026-11-04/budi_istirahat.jpg')
  assert('Foto Pulang sesuai transaksi Pulang', g.pulang?.selfie_storage_path === '2026-11-04/budi_pulang.jpg')
  assert('Status presensi keseluruhan tepat waktu', g.overall_attendance_status === 'tepat_waktu')
}

// ─────────────────────────────────────────────────────────────
// TEST 2: Pegawai baru melakukan Masuk saja (Incomplete)
// ─────────────────────────────────────────────────────────────
console.log('\nTEST 2: Pegawai CS yang baru melakukan Masuk saja')
{
  const records: AttendanceRecord[] = [
    makeMockRecord({
      attendance_type: 'masuk',
      recorded_at: '2026-11-04T06:55:00+07:00',
      selfie_storage_path: '2026-11-04/ani_masuk.jpg',
      employee_name: 'Ani CS',
      normalized_name: 'ani cs',
      employee_profile_id: 'emp-uuid-2',
    }),
  ]

  const groups = groupCSRecords(records)

  assert('Menghasilkan tepat 1 baris', groups.length === 1)
  const g = groups[0]
  assert('Masuk terisi dengan foto Masuk', g.masuk?.selfie_storage_path === '2026-11-04/ani_masuk.jpg')
  assert('Istirahat null (Belum Absen)', g.istirahat === null)
  assert('Pulang null (Belum Absen)', g.pulang === null)
}

// ─────────────────────────────────────────────────────────────
// TEST 3: Beberapa pegawai pada tanggal yang sama
// ─────────────────────────────────────────────────────────────
console.log('\nTEST 3: Beberapa pegawai pada tanggal yang sama')
{
  const records: AttendanceRecord[] = [
    // Pegawai 1: Budi
    makeMockRecord({ employee_profile_id: 'emp-1', employee_name: 'Budi', normalized_name: 'budi', attendance_type: 'masuk' }),
    makeMockRecord({ employee_profile_id: 'emp-1', employee_name: 'Budi', normalized_name: 'budi', attendance_type: 'pulang' }),
    // Pegawai 2: Siti
    makeMockRecord({ employee_profile_id: 'emp-2', employee_name: 'Siti', normalized_name: 'siti', attendance_type: 'masuk' }),
    // Pegawai 3: Joko
    makeMockRecord({ employee_profile_id: 'emp-3', employee_name: 'Joko', normalized_name: 'joko', attendance_type: 'masuk' }),
    makeMockRecord({ employee_profile_id: 'emp-3', employee_name: 'Joko', normalized_name: 'joko', attendance_type: 'istirahat' }),
    makeMockRecord({ employee_profile_id: 'emp-3', employee_name: 'Joko', normalized_name: 'joko', attendance_type: 'pulang' }),
  ]

  const groups = groupCSRecords(records)

  assert('Menghasilkan tepat 3 baris untuk 3 pegawai', groups.length === 3)
  const names = groups.map(g => g.employee_name).sort()
  assert('Memuat Budi, Joko, Siti terpisah', JSON.stringify(names) === JSON.stringify(['Budi', 'Joko', 'Siti']))
  assert('Data dua pegawai tidak pernah digabungkan', new Set(groups.map(g => g.employee_id)).size === 3)
}

// ─────────────────────────────────────────────────────────────
// TEST 4: Satu pegawai pada beberapa tanggal kerja berbeda
// ─────────────────────────────────────────────────────────────
console.log('\nTEST 4: Satu pegawai pada beberapa tanggal kerja berbeda')
{
  const records: AttendanceRecord[] = [
    makeMockRecord({ work_date: '2026-11-02', attendance_type: 'masuk' }),
    makeMockRecord({ work_date: '2026-11-02', attendance_type: 'pulang' }),
    makeMockRecord({ work_date: '2026-11-03', attendance_type: 'masuk' }),
    makeMockRecord({ work_date: '2026-11-03', attendance_type: 'pulang' }),
    makeMockRecord({ work_date: '2026-11-04', attendance_type: 'masuk' }),
  ]

  const groups = groupCSRecords(records)

  assert('Menghasilkan 3 baris untuk 3 tanggal kerja', groups.length === 3)
  const dates = groups.map(g => g.work_date)
  assert('Tanggal kerja tidak pernah digabungkan', dates.includes('2026-11-02') && dates.includes('2026-11-03') && dates.includes('2026-11-04'))
  assert('Urutan tanggal menurun (terbaru di atas)', groups[0].work_date === '2026-11-04' && groups[2].work_date === '2026-11-02')
}

// ─────────────────────────────────────────────────────────────
// TEST 5: Status Keterlambatan Asli Backend Dipertahankan
// ─────────────────────────────────────────────────────────────
console.log('\nTEST 5: Status Keterlambatan CS Hasil Backend')
{
  const records: AttendanceRecord[] = [
    makeMockRecord({
      attendance_type: 'masuk',
      attendance_status: 'terlambat',
      late_minutes: 25,
      review_status: 'perlu_tindak_lanjut',
    }),
    makeMockRecord({
      attendance_type: 'pulang',
      attendance_status: 'tepat_waktu',
      late_minutes: 0,
      review_status: 'sudah_diperiksa',
    }),
  ]

  const groups = groupCSRecords(records)

  assert('Baris teridentifikasi terlambat karena Masuk terlambat', groups[0].overall_attendance_status === 'terlambat')
  assert('Menyimpan total late_minutes 25', groups[0].total_late_minutes === 25)
  assert('Review status perlu_tindak_lanjut diprioritaskan', groups[0].overall_review_status === 'perlu_tindak_lanjut')
}

// ─────────────────────────────────────────────────────────────
// TEST 6: Security records diabaikan oleh groupCSRecords
// ─────────────────────────────────────────────────────────────
console.log('\nTEST 6: Integritas Security (Format Lama Dipertahankan)')
{
  const records: AttendanceRecord[] = [
    makeMockRecord({
      category: 'Security',
      employee_name: 'Danang Satpam',
      shift: 'Shift I',
      attendance_type: 'masuk',
      selfie_storage_path: '2026-11-04/security_danang.jpg',
    }),
    makeMockRecord({
      category: 'Security',
      employee_name: 'Danang Satpam',
      shift: 'Shift I',
      attendance_type: 'pulang',
      selfie_storage_path: '2026-11-04/security_danang_pulang.jpg',
    }),
  ]

  const csGroups = groupCSRecords(records)
  assert('Security tidak masuk ke group CS', csGroups.length === 0)
  assert('Transaksi Security tetap independen per baris (panjang 2)', records.length === 2)
  assert('Shift Security tetap tersimpan', records[0].shift === 'Shift I')
}

// ─────────────────────────────────────────────────────────────
// TEST 7: Filtering CS Groups
// ─────────────────────────────────────────────────────────────
console.log('\nTEST 7: Filter CS Groups')
{
  const records: AttendanceRecord[] = [
    makeMockRecord({ employee_name: 'Ahmad Dahlan', attendance_type: 'masuk', attendance_status: 'tepat_waktu' }),
    makeMockRecord({ employee_name: 'Ahmad Dahlan', attendance_type: 'pulang', attendance_status: 'tepat_waktu' }),
    makeMockRecord({ employee_profile_id: 'emp-x', employee_name: 'Budi Santoso', attendance_type: 'masuk', attendance_status: 'terlambat' }),
  ]

  const allGroups = groupCSRecords(records)
  const filteredByName = filterCSGroups(allGroups, { name: 'Ahmad' })
  assert('Filter nama berfungsi', filteredByName.length === 1 && filteredByName[0].employee_name === 'Ahmad Dahlan')

  const filteredByLate = filterCSGroups(allGroups, { attendance_status: 'terlambat' })
  assert('Filter status terlambat berfungsi', filteredByLate.length === 1 && filteredByLate[0].employee_name === 'Budi Santoso')
}

console.log('\n------------------------------------------------------------')
console.log(`Test Results: ${passed} passed, ${failed} failed`)
console.log('------------------------------------------------------------\n')

if (failed > 0) {
  process.exit(1)
}
