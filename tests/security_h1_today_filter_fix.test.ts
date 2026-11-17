// ============================================================
// SIPATEN — Test Suite: Security Check-Out H+1 on Filter Hari Ini
// Verification of:
// 1. Shift III check-in on day 16 and check-out on day 17 appearing on "Hari Ini" 17
// 2. Unclosed Shift III from day 16 appearing on "Hari Ini" 17 as active shift
// 3. Normal day 17 transactions appearing normally
// 4. Past non-overnight transactions from day 16 excluded from day 17
// 5. Internal shift keys ('shift_3', 'Shift III') correctly recognized
// 6. Zero duplicate transactions
// 7. Work date preservation and H+1 badge indicator
// 8. "Semua Tanggal" filter displaying full history
// 9. CS filter unaffected
// ============================================================

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isOvernightSecurityShift,
  isSecurityOvernightCheckoutInRange,
  getQualifyingSecurityOvernightRecords,
  mergeAndDeduplicateAttendance,
  getSecurityDisplayDate,
  formatSecurityDisplayDate,
} from '../src/lib/securityDateDisplay.ts'
import { groupCSRecords } from '../src/lib/attendanceGrouping.ts'
import type { AttendanceRecord } from '../src/types/attendance.ts'

function createRecord(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2, 9)}`,
    employee_name: 'Security Officer',
    normalized_name: 'security officer',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2026-11-16',
    recorded_at: '2026-11-17T07:40:00+07:00',
    scheduled_start: '19:30',
    scheduled_end: '07:30',
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    review_status: 'belum_diperiksa',
    created_at: '2026-11-17T07:40:00+07:00',
    updated_at: '2026-11-17T07:40:00+07:00',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────
// 1. Shift III Check-In 16 Nov & Check-Out 17 Nov on Filter 17 Nov
// ─────────────────────────────────────────────────────────────
test('1. Shift III check-in tanggal 16 dan check-out tanggal 17 muncul pada filter Hari Ini tanggal 17', () => {
  const checkInId = 'sec-shift3-in-16'
  const secShift3Masuk = createRecord({
    id: checkInId,
    employee_name: 'Doni Pratama',
    attendance_type: 'masuk',
    shift: 'Shift III',
    work_date: '2026-11-16',
    recorded_at: '2026-11-16T20:14:00+07:00',
  })

  const secShift3Pulang = createRecord({
    id: 'sec-shift3-out-17',
    employee_name: 'Doni Pratama',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2026-11-16',
    check_in_record_id: checkInId,
    recorded_at: '2026-11-17T07:40:00+07:00', // checkout actual date: 17 Nov
  })

  // Candidates on prevDate (16 Nov)
  const prevDayRecords = [secShift3Masuk, secShift3Pulang]

  // Filter "Hari Ini" on 17 Nov (dateFrom: 2026-11-17, dateTo: 2026-11-17)
  const qualifying = getQualifyingSecurityOvernightRecords(
    prevDayRecords,
    '2026-11-17',
    '2026-11-17'
  )

  assert.equal(qualifying.length, 2, 'Kedua transaksi (masuk dan pulang) harus masuk kualifikasi filter hari ini')
  const hasMasuk = qualifying.some(r => r.id === checkInId && r.attendance_type === 'masuk')
  const hasPulang = qualifying.some(r => r.id === 'sec-shift3-out-17' && r.attendance_type === 'pulang')
  assert.equal(hasMasuk, true, 'Check-in Shift III tanggal 16 harus muncul')
  assert.equal(hasPulang, true, 'Check-out Shift III tanggal 17 harus muncul')

  // Tanggal kerja tetap 16 November
  assert.equal(secShift3Pulang.work_date, '2026-11-16')
  assert.equal(secShift3Masuk.work_date, '2026-11-16')
})

// ─────────────────────────────────────────────────────────────
// 2. Unclosed Shift III on Day 16 appears on Day 17 filter
// ─────────────────────────────────────────────────────────────
test('2. Shift III yang belum check-out tetap tampil sesuai perilaku yang benar pada Hari Ini tanggal 17', () => {
  const unclosedShift3 = createRecord({
    id: 'sec-unclosed-in-16',
    employee_name: 'Heri Susanto',
    attendance_type: 'masuk',
    shift: 'Shift III',
    work_date: '2026-11-16',
    recorded_at: '2026-11-16T20:30:00+07:00',
  })

  const prevDayRecords = [unclosedShift3]

  const qualifying = getQualifyingSecurityOvernightRecords(
    prevDayRecords,
    '2026-11-17',
    '2026-11-17'
  )

  assert.equal(qualifying.length, 1, 'Check-in Shift III yang belum check-out harus muncul di filter hari ini')
  assert.equal(qualifying[0].id, 'sec-unclosed-in-16')
  assert.equal(qualifying[0].attendance_type, 'masuk')
})

// ─────────────────────────────────────────────────────────────
// 3. Normal Day 17 Transactions + Prev Day Merging
// ─────────────────────────────────────────────────────────────
test('3. Transaksi normal pada tanggal 17 tetap tampil dan bergabung dengan transaksi H+1', () => {
  // Transaksi reguler tanggal 17 (Shift I)
  const todayMasuk = createRecord({
    id: 'sec-shift1-in-17',
    employee_name: 'Agus Ramadhan',
    attendance_type: 'masuk',
    shift: 'Shift I',
    work_date: '2026-11-17',
    recorded_at: '2026-11-17T06:50:00+07:00',
  })

  // Transaksi H+1 dari tanggal 16
  const h1Pulang = createRecord({
    id: 'sec-shift3-out-17',
    employee_name: 'Doni Pratama',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2026-11-16',
    recorded_at: '2026-11-17T07:40:00+07:00',
  })

  const merged = mergeAndDeduplicateAttendance([todayMasuk], [h1Pulang])
  assert.equal(merged.length, 2, 'Kedua transaksi harus muncul')
  // Urutan waktu: 07:40 (h1Pulang) di atas 06:50 (todayMasuk)
  assert.equal(merged[0].id, 'sec-shift3-out-17')
  assert.equal(merged[1].id, 'sec-shift1-in-17')
})

// ─────────────────────────────────────────────────────────────
// 4. Past Non-Overnight Records on Day 16 Excluded
// ─────────────────────────────────────────────────────────────
test('4. Transaksi normal tanggal 16 yang bukan lintas hari TIDAK muncul pada filter tanggal 17', () => {
  const shift1Masuk16 = createRecord({
    id: 'sec-shift1-in-16',
    employee_name: 'Budi Security',
    attendance_type: 'masuk',
    shift: 'Shift I',
    work_date: '2026-11-16',
    recorded_at: '2026-11-16T06:55:00+07:00',
  })

  const shift1Pulang16 = createRecord({
    id: 'sec-shift1-out-16',
    employee_name: 'Budi Security',
    attendance_type: 'pulang',
    shift: 'Shift I',
    work_date: '2026-11-16',
    recorded_at: '2026-11-16T15:05:00+07:00',
  })

  const prevDayRecords = [shift1Masuk16, shift1Pulang16]

  const qualifying = getQualifyingSecurityOvernightRecords(
    prevDayRecords,
    '2026-11-17',
    '2026-11-17'
  )

  assert.equal(qualifying.length, 0, 'Transaksi Shift I tanggal 16 tidak boleh muncul di filter tanggal 17')
})

// ─────────────────────────────────────────────────────────────
// 5. Internal Shift Keys Support ('shift_3')
// ─────────────────────────────────────────────────────────────
test('5. Internal shift key shift_3 dikenali sebagai overnight shift dan check-out H+1 muncul', () => {
  assert.equal(isOvernightSecurityShift('2026-11-16', 'shift_3'), true)
  assert.equal(isOvernightSecurityShift('2026-11-16', 'Shift III'), true)

  const recWithInternalKey = createRecord({
    id: 'sec-internal-key-out',
    attendance_type: 'pulang',
    shift: 'shift_3',
    work_date: '2026-11-16',
    recorded_at: '2026-11-17T07:35:00+07:00',
  })

  const isQualifying = isSecurityOvernightCheckoutInRange(
    recWithInternalKey,
    '2026-11-17',
    '2026-11-17'
  )
  assert.equal(isQualifying, true, 'shift_3 harus lolos kualifikasi check-out H+1')
})

// ─────────────────────────────────────────────────────────────
// 6. Zero Duplicate Transactions
// ─────────────────────────────────────────────────────────────
test('6. Tidak ada transaksi ganda ketika record ada di kedua query', () => {
  const rec = createRecord({
    id: 'unique-rec-id-999',
    employee_name: 'Test Officer',
    work_date: '2026-11-16',
    attendance_type: 'pulang',
    recorded_at: '2026-11-17T07:40:00+07:00',
  })

  const merged = mergeAndDeduplicateAttendance([rec], [rec])
  assert.equal(merged.length, 1, 'ID yang sama harus terdeduplikasi menjadi tepat 1 record')
})

// ─────────────────────────────────────────────────────────────
// 7. Work Date & H+1 Badge Format
// ─────────────────────────────────────────────────────────────
test('7. Tanggal kerja tetap mempertahankan tanggal asli dan badge H+1 tampil benar', () => {
  const checkoutRecord = createRecord({
    id: 'sec-h1-check',
    work_date: '2026-11-16',
    shift: 'Shift III',
    attendance_type: 'pulang',
    recorded_at: '2026-11-17T07:40:00+07:00',
  })

  const { displayDate, isNextDay } = getSecurityDisplayDate(
    checkoutRecord.work_date,
    checkoutRecord.shift,
    checkoutRecord.attendance_type,
    checkoutRecord.category
  )

  assert.equal(displayDate, '2026-11-17')
  assert.equal(isNextDay, true)

  const formatted = formatSecurityDisplayDate(
    checkoutRecord.work_date,
    checkoutRecord.shift,
    checkoutRecord.attendance_type,
    checkoutRecord.category
  )

  assert.ok(formatted.includes('17 Nov 2026 (H+1)'))
})

// ─────────────────────────────────────────────────────────────
// 8. Filter Semua Tanggal Tetap Berfungsi Lengkap
// ─────────────────────────────────────────────────────────────
test('8. Filter Semua Tanggal tetap menampilkan riwayat lengkap kedua tanggal', () => {
  const rec16Masuk = createRecord({ id: 'r1', work_date: '2026-11-16', attendance_type: 'masuk', recorded_at: '2026-11-16T20:14:00+07:00' })
  const rec16Pulang = createRecord({ id: 'r2', work_date: '2026-11-16', attendance_type: 'pulang', recorded_at: '2026-11-17T07:40:00+07:00' })
  const rec17Masuk = createRecord({ id: 'r3', work_date: '2026-11-17', attendance_type: 'masuk', recorded_at: '2026-11-17T06:50:00+07:00' })

  const merged = mergeAndDeduplicateAttendance([rec16Masuk, rec16Pulang, rec17Masuk], [])
  assert.equal(merged.length, 3, 'Semua 3 transaksi harus tampil pada Semua Tanggal')
})

// ─────────────────────────────────────────────────────────────
// 9. CS Filter Unaffected
// ─────────────────────────────────────────────────────────────
test('9. Filter CS tetap berfungsi normal (1 baris per pegawai per tanggal kerja)', () => {
  const csMasuk = createRecord({
    id: 'cs-in-1',
    category: 'CS',
    employee_name: 'Siti Aminah',
    work_date: '2026-11-17',
    attendance_type: 'masuk',
    shift: null,
    recorded_at: '2026-11-17T06:55:00+07:00',
  })

  const csPulang = createRecord({
    id: 'cs-out-1',
    category: 'CS',
    employee_name: 'Siti Aminah',
    work_date: '2026-11-17',
    attendance_type: 'pulang',
    shift: null,
    recorded_at: '2026-11-17T16:05:00+07:00',
  })

  const groups = groupCSRecords([csMasuk, csPulang])
  assert.equal(groups.length, 1, 'CS tetap dikelompokkan 1 baris per pegawai')
  assert.equal(groups[0].employee_name, 'Siti Aminah')
  assert.equal(groups[0].masuk?.id, 'cs-in-1')
  assert.equal(groups[0].pulang?.id, 'cs-out-1')
})

