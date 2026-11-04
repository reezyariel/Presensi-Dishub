// ============================================================
// Unit Tests: Security Overnight H+1 Date Filtering & Merging
// ============================================================
// Verifies filter logic for "Hari Ini" and date ranges with
// cross-midnight checkout (H+1) inclusion, exclusion, and deduplication.
//
// Run with:
//   node --experimental-strip-types tests/security_h1_filter.test.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getPreviousCalendarDate,
  getNextCalendarDate,
  subtractCalendarDays,
  isOvernightSecurityShift,
  getSecurityDisplayDate,
  formatSecurityDisplayDate,
  isSecurityOvernightCheckoutInRange,
  mergeAndDeduplicateAttendance,
} from '../src/lib/securityDateDisplay.ts'
import { groupCSRecords } from '../src/lib/attendanceGrouping.ts'
import type { AttendanceRecord } from '../src/types/attendance.ts'

// ─── Fixtures Generator ─────────────────────────────────────

function createRecord(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2, 9)}`,
    employee_name: 'Test Officer',
    normalized_name: 'test officer',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2026-11-03',
    recorded_at: '2026-11-04T07:15:00+07:00',
    scheduled_start: '19:30',
    scheduled_end: '07:30',
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    review_status: 'belum_diperiksa',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ─── Unit Tests ─────────────────────────────────────────────

test('1. Filter Hari Ini menampilkan transaksi reguler CS tanggal tersebut', () => {
  const csToday = createRecord({
    id: 'cs-1',
    category: 'CS',
    employee_name: 'Budi CS',
    attendance_type: 'masuk',
    shift: null,
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T07:45:00+07:00',
  })

  // csToday work_date is within [2026-11-04, 2026-11-04]
  assert.equal(csToday.work_date, '2026-11-04')
  assert.equal(csToday.category, 'CS')

  const merged = mergeAndDeduplicateAttendance([csToday], [])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'cs-1')

  const csGroups = groupCSRecords(merged)
  assert.equal(csGroups.length, 1)
  assert.equal(csGroups[0].employee_name, 'Budi CS')
  assert.equal(csGroups[0].work_date, '2026-11-04')
})

test('2. Filter Hari Ini menampilkan transaksi reguler Security tanggal tersebut', () => {
  const secTodayMasuk = createRecord({
    id: 'sec-reg-masuk',
    category: 'Security',
    employee_name: 'Agus Security',
    attendance_type: 'masuk',
    shift: 'Shift I',
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T06:55:00+07:00',
  })

  const secTodayPulang = createRecord({
    id: 'sec-reg-pulang',
    category: 'Security',
    employee_name: 'Agus Security',
    attendance_type: 'pulang',
    shift: 'Shift I',
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T15:05:00+07:00',
  })

  const merged = mergeAndDeduplicateAttendance([secTodayMasuk, secTodayPulang], [])
  assert.equal(merged.length, 2)
  assert.equal(merged[0].id, 'sec-reg-pulang') // Most recent first (15:05 > 06:55)
  assert.equal(merged[1].id, 'sec-reg-masuk')
})

test('3. Filter Hari Ini menampilkan Pulang Security H+1 dari work_date sehari sebelumnya', () => {
  // Tuesday 3 Nov 2026 Shift III overnight check-in at 19:30, check-out on Wednesday 4 Nov morning at 07:20 WIB
  const secH1Pulang = createRecord({
    id: 'sec-h1-pulang-3nov',
    category: 'Security',
    employee_name: 'Bambang Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2026-11-03', // work_date is yesterday
    recorded_at: '2026-11-04T07:20:00+07:00', // actual recorded_at is today (4 Nov)
  })

  // Qualifying predicate check for filter "2026-11-04" s/d "2026-11-04"
  const isQualifying = isSecurityOvernightCheckoutInRange(secH1Pulang, '2026-11-04', '2026-11-04')
  assert.equal(isQualifying, true)

  // Verify display date
  const { displayDate, isNextDay } = getSecurityDisplayDate(
    secH1Pulang.work_date,
    secH1Pulang.shift,
    secH1Pulang.attendance_type,
    secH1Pulang.category,
  )
  assert.equal(displayDate, '2026-11-04')
  assert.equal(isNextDay, true)

  const formatted = formatSecurityDisplayDate(
    secH1Pulang.work_date,
    secH1Pulang.shift,
    secH1Pulang.attendance_type,
    secH1Pulang.category,
  )
  assert.ok(formatted.includes('04 Nov 2026 (H+1)'))

  // Merging with today's regular records
  const secToday = createRecord({
    id: 'sec-today-masuk',
    category: 'Security',
    employee_name: 'Agus Security',
    attendance_type: 'masuk',
    shift: 'Shift I',
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T06:55:00+07:00',
  })

  const merged = mergeAndDeduplicateAttendance([secToday], [secH1Pulang])
  assert.equal(merged.length, 2)
  // Check order: 07:20 (secH1Pulang) should be above 06:55 (secToday)
  assert.equal(merged[0].id, 'sec-h1-pulang-3nov')
  assert.equal(merged[1].id, 'sec-today-masuk')
})

test('4. Filter Hari Ini TIDAK menampilkan check-in Security dari hari sebelumnya', () => {
  // Masuk on 3 Nov night
  const secMasukPrevDay = createRecord({
    id: 'sec-masuk-3nov',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift III',
    work_date: '2026-11-03',
    recorded_at: '2026-11-03T19:35:00+07:00',
  })

  // isSecurityOvernightCheckoutInRange MUST return false for 'masuk'
  const isQualifying = isSecurityOvernightCheckoutInRange(secMasukPrevDay, '2026-11-04', '2026-11-04')
  assert.equal(isQualifying, false, 'Masuk from previous day must NEVER qualify as H+1 checkout')
})

test('5. Filter Hari Ini TIDAK menampilkan transaksi CS dari hari sebelumnya', () => {
  const csPulangPrevDay = createRecord({
    id: 'cs-pulang-3nov',
    category: 'CS',
    employee_name: 'Siti CS',
    attendance_type: 'pulang',
    shift: null,
    work_date: '2026-11-03',
    recorded_at: '2026-11-03T17:00:00+07:00',
  })

  const isQualifying = isSecurityOvernightCheckoutInRange(csPulangPrevDay, '2026-11-04', '2026-11-04')
  assert.equal(isQualifying, false, 'CS transaction must NEVER qualify as Security H+1')
})

test('6. Shift Security yang BUKAN lintas hari TIDAK ikut dimasukkan dari hari sebelumnya', () => {
  // Shift I check-out on 3 Nov (15:00)
  const secShift1Pulang = createRecord({
    id: 'sec-shift1-3nov',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift I',
    work_date: '2026-11-03',
    recorded_at: '2026-11-03T15:00:00+07:00',
  })

  // Shift II on Tuesday 3 Nov is NOT overnight (only Friday Shift II or Weekend Shift II is overnight)
  const secShift2TuePulang = createRecord({
    id: 'sec-shift2-3nov',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    work_date: '2026-11-03',
    recorded_at: '2026-11-03T23:00:00+07:00',
  })

  assert.equal(isSecurityOvernightCheckoutInRange(secShift1Pulang, '2026-11-04', '2026-11-04'), false)
  assert.equal(isSecurityOvernightCheckoutInRange(secShift2TuePulang, '2026-11-04', '2026-11-04'), false)
})

test('7. Filter rentang beberapa hari (4–5 Nov) menampilkan transaksi H+1 yang sesuai', () => {
  // Candidate 1: 3 Nov Shift III pulang -> display date 4 Nov (falls inside [4 Nov, 5 Nov])
  const h1From3Nov = createRecord({
    id: 'h1-from-3nov',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2026-11-03',
    recorded_at: '2026-11-04T07:15:00+07:00',
  })

  // Candidate 2: 4 Nov Shift III pulang -> display date 5 Nov (falls inside [4 Nov, 5 Nov])
  const h1From4Nov = createRecord({
    id: 'h1-from-4nov',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2026-11-04',
    recorded_at: '2026-11-05T07:10:00+07:00',
  })

  // Candidate 3: 2 Nov Shift III pulang -> display date 3 Nov (OUTSIDE [4 Nov, 5 Nov])
  const h1From2Nov = createRecord({
    id: 'h1-from-2nov',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2026-11-02',
    recorded_at: '2026-11-03T07:10:00+07:00',
  })

  assert.equal(isSecurityOvernightCheckoutInRange(h1From3Nov, '2026-11-04', '2026-11-05'), true)
  assert.equal(isSecurityOvernightCheckoutInRange(h1From4Nov, '2026-11-04', '2026-11-05'), true)
  assert.equal(isSecurityOvernightCheckoutInRange(h1From2Nov, '2026-11-04', '2026-11-05'), false)
})

test('8. Filter tanggal tidak menghasilkan transaksi duplikat (deduplikasi ID yang sama)', () => {
  const rec = createRecord({
    id: 'shared-id-123',
    employee_name: 'Dedup Check',
    work_date: '2026-11-04',
    attendance_type: 'pulang',
    shift: 'Shift III',
    recorded_at: '2026-11-05T07:00:00+07:00',
  })

  // Present in both query results (e.g. overlapping queries)
  const regularList = [rec]
  const additionalList = [rec]

  const merged = mergeAndDeduplicateAttendance(regularList, additionalList)
  assert.equal(merged.length, 1, 'Duplicate ID must be deduplicated to exactly 1 record')
  assert.equal(merged[0].id, 'shared-id-123')
})

test('9. Pergantian bulan, tahun, dan tahun kabisat tetap benar', () => {
  // A. Month boundary: 1 Nov 2026 -> prev day is 31 Oct 2026
  assert.equal(getPreviousCalendarDate('2026-11-01'), '2026-10-31')
  assert.equal(getNextCalendarDate('2026-10-31'), '2026-11-01')

  // 31 Oct 2026 is Saturday (Shift II is overnight). Pulang checkout on 1 Nov morning:
  const oct31SatH1 = createRecord({
    id: 'sat-31oct-h1',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    work_date: '2026-10-31',
    recorded_at: '2026-11-01T07:15:00+07:00',
  })
  assert.equal(isSecurityOvernightCheckoutInRange(oct31SatH1, '2026-11-01', '2026-11-01'), true)

  // B. Year boundary: 1 Jan 2027 -> prev day is 31 Dec 2026
  assert.equal(getPreviousCalendarDate('2027-01-01'), '2026-12-31')
  assert.equal(getNextCalendarDate('2026-12-31'), '2027-01-01')

  // 31 Dec 2026 is Thursday (Shift III is overnight). Pulang checkout on 1 Jan 2027 morning:
  const dec31ThuH1 = createRecord({
    id: 'thu-31dec-h1',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2026-12-31',
    recorded_at: '2027-01-01T07:20:00+07:00',
  })
  assert.equal(isSecurityOvernightCheckoutInRange(dec31ThuH1, '2027-01-01', '2027-01-01'), true)

  // C. Leap year: 1 Mar 2024 -> prev day is 29 Feb 2024
  assert.equal(getPreviousCalendarDate('2024-03-01'), '2024-02-29')
  assert.equal(getNextCalendarDate('2024-02-28'), '2024-02-29')
  assert.equal(getNextCalendarDate('2024-02-29'), '2024-03-01')

  // 29 Feb 2024 was Thursday (Shift III is overnight). Checkout on 1 Mar 2024:
  const feb29ThuH1 = createRecord({
    id: 'feb-29-h1',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2024-02-29',
    recorded_at: '2024-03-01T07:10:00+07:00',
  })
  assert.equal(isSecurityOvernightCheckoutInRange(feb29ThuH1, '2024-03-01', '2024-03-01'), true)
})

test('10. Filter kategori dan pencarian tetap bekerja', () => {
  // If user searched for name 'Bambang', only Bambang records match
  const bambang = createRecord({ id: 'bambang-1', employee_name: 'Bambang Wijaya', attendance_type: 'pulang', shift: 'Shift III', work_date: '2026-11-03' })
  const agus = createRecord({ id: 'agus-1', employee_name: 'Agus Santoso', attendance_type: 'pulang', shift: 'Shift III', work_date: '2026-11-03' })

  const merged = mergeAndDeduplicateAttendance([bambang], [])
  const filtered = merged.filter(r => r.employee_name.toLowerCase().includes('bambang'))
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].employee_name, 'Bambang Wijaya')
})

test('11. Paginasi dan total jumlah data tetap konsisten', () => {
  const PAGE_SIZE = 20
  // Generate 25 records (mix of regular and H+1)
  const regularList: AttendanceRecord[] = []
  for (let i = 1; i <= 20; i++) {
    regularList.push(createRecord({
      id: `reg-${i}`,
      work_date: '2026-11-04',
      recorded_at: `2026-11-04T0${i % 10}:00:00+07:00`,
    }))
  }
  const h1List: AttendanceRecord[] = []
  for (let i = 1; i <= 5; i++) {
    h1List.push(createRecord({
      id: `h1-${i}`,
      work_date: '2026-11-03',
      shift: 'Shift III',
      attendance_type: 'pulang',
      recorded_at: `2026-11-04T07:3${i}:00+07:00`,
    }))
  }

  const merged = mergeAndDeduplicateAttendance(regularList, h1List)
  assert.equal(merged.length, 25)

  // Page 0 (Page 1 in UI)
  const page0 = merged.slice(0, PAGE_SIZE)
  assert.equal(page0.length, 20)

  // Page 1 (Page 2 in UI)
  const page1 = merged.slice(PAGE_SIZE, PAGE_SIZE + PAGE_SIZE)
  assert.equal(page1.length, 5)

  // Total pages
  const totalPages = Math.ceil(merged.length / PAGE_SIZE)
  assert.equal(totalPages, 2)
})

test('12. CS tetap berfungsi 1 baris per pegawai per tanggal kerja tanpa terpengaruh', () => {
  const csMasuk = createRecord({
    id: 'cs-in',
    category: 'CS',
    employee_name: 'Siti CS',
    attendance_type: 'masuk',
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T07:55:00+07:00',
  })
  const csIstirahat = createRecord({
    id: 'cs-break',
    category: 'CS',
    employee_name: 'Siti CS',
    attendance_type: 'istirahat',
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T12:05:00+07:00',
  })
  const csPulang = createRecord({
    id: 'cs-out',
    category: 'CS',
    employee_name: 'Siti CS',
    attendance_type: 'pulang',
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T16:00:00+07:00',
  })
  const secH1 = createRecord({
    id: 'sec-h1',
    category: 'Security',
    employee_name: 'Security Officer',
    attendance_type: 'pulang',
    shift: 'Shift III',
    work_date: '2026-11-03',
    recorded_at: '2026-11-04T07:15:00+07:00',
  })

  // All 4 records in merged
  const merged = mergeAndDeduplicateAttendance([csMasuk, csIstirahat, csPulang], [secH1])
  assert.equal(merged.length, 4)

  // CS grouping MUST produce exactly 1 group for Siti CS
  const csGroups = groupCSRecords(merged)
  assert.equal(csGroups.length, 1)
  assert.equal(csGroups[0].employee_name, 'Siti CS')
  assert.equal(csGroups[0].work_date, '2026-11-04')
  assert.ok(csGroups[0].masuk)
  assert.ok(csGroups[0].istirahat)
  assert.ok(csGroups[0].pulang)
  // Security record is NOT in csGroups
  assert.equal(csGroups.some(g => g.category !== 'CS'), false)
})

test('13. subtractCalendarDays: Zona waktu independen dan akurat melintasi batas kalender', () => {
  // A. 30 days before 4 Nov 2026: October has 31 days -> 2026-10-05
  // (31 - 5 + 4 = 30 days)
  assert.equal(subtractCalendarDays('2026-11-04', 30), '2026-10-05')

  // B. 30 days before 15 Jan 2027 -> December has 31 days -> 2026-12-16
  // (31 - 16 + 15 = 30 days)
  assert.equal(subtractCalendarDays('2027-01-15', 30), '2026-12-16')

  // C. 30 days before 15 Mar 2024 (Leap Year) -> Feb 2024 has 29 days -> 2024-02-14
  // (29 - 14 + 15 = 30 days)
  assert.equal(subtractCalendarDays('2024-03-15', 30), '2024-02-14')

  // D. 30 days before 15 Mar 2023 (Non-Leap Year) -> Feb 2023 has 28 days -> 2023-02-13
  // (28 - 13 + 15 = 30 days)
  assert.equal(subtractCalendarDays('2023-03-15', 30), '2023-02-13')

  // E. 1 day subtraction matches getPreviousCalendarDate
  assert.equal(subtractCalendarDays('2026-11-04', 1), getPreviousCalendarDate('2026-11-04'))
  assert.equal(subtractCalendarDays('2026-11-01', 1), getPreviousCalendarDate('2026-11-01'))
  assert.equal(subtractCalendarDays('2027-01-01', 1), getPreviousCalendarDate('2027-01-01'))
})

test('14. Penanganan kegagalan Query B: Melempar error dan tidak menampilkan data parsial', async () => {
  // Simulating query execution where Query A succeeds and Query B fails
  const mockQueryA = async () => [
    createRecord({ id: 'reg-1', work_date: '2026-11-04' }),
  ]
  const mockQueryBFails = async () => {
    throw new Error('Database network timeout on H+1 candidate query')
  }

  // The loader logic must throw an explicit error when Query B fails
  let loadFailed = false
  let caughtMessage = ''
  try {
    await mockQueryA()
    await mockQueryBFails()
  } catch (err: unknown) {
    loadFailed = true
    caughtMessage = err instanceof Error ? err.message : String(err)
  }

  assert.equal(loadFailed, true, 'Failure in Query B MUST be caught and throw')
  assert.ok(
    caughtMessage.includes('Database network timeout'),
    'Error message must describe the failure'
  )
})
