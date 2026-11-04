// ============================================================
// Unit Tests: Security Overnight H+1 Date Display
// Tests for getSecurityDisplayDate() and formatSecurityDisplayDate()
// ============================================================
// Run with:
//   node --experimental-strip-types tests/security_overnight_display.test.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'

// ─── Inline helper (mirrors src/lib/securityDateDisplay.ts) ──────────────────
// We inline the logic here to avoid the supabase import chain in scheduleEngine.

import { getDay, parseISO } from 'date-fns'
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'

const TIMEZONE = 'Asia/Jakarta'

function jakartaDayOfWeek(workDateStr: string): number {
  const d = parseISO(workDateStr)
  const zoned = toZonedTime(d, TIMEZONE)
  return getDay(zoned)
}

function canonicalShift(shift: string | null | undefined): string {
  if (!shift) return ''
  const s = shift.trim()
  if (s === 'Shift 1' || s === 'Shift I' || s === 'Sesi Pagi') return 'Shift I'
  if (s === 'Shift 2' || s === 'Shift II' || s === 'Sesi Malam') return 'Shift II'
  if (s === 'Shift 3' || s === 'Shift III') return 'Shift III'
  return s
}

function isOvernightSecurityShift(workDateStr: string, shift: string | null): boolean {
  if (!shift) return false
  const day = jakartaDayOfWeek(workDateStr)
  const canon = canonicalShift(shift)
  if (day >= 1 && day <= 4) return canon === 'Shift III'
  if (day === 5) return canon === 'Shift II'
  if (day === 0 || day === 6) return canon === 'Shift II' || shift === 'Sesi Malam'
  return false
}

function getSecurityDisplayDate(
  workDateStr: string,
  shift: string | null,
  attendanceType: string,
  category: string,
): { displayDate: string; isNextDay: boolean } {
  if (
    category === 'Security' &&
    attendanceType === 'pulang' &&
    shift !== null &&
    isOvernightSecurityShift(workDateStr, shift)
  ) {
    const [y, m, d] = workDateStr.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    const ny = next.getUTCFullYear()
    const nm = String(next.getUTCMonth() + 1).padStart(2, '0')
    const nd = String(next.getUTCDate()).padStart(2, '0')
    return { displayDate: `${ny}-${nm}-${nd}`, isNextDay: true }
  }
  return { displayDate: workDateStr, isNextDay: false }
}

function formatSecurityDisplayDate(
  workDateStr: string,
  shift: string | null,
  attendanceType: string,
  category: string,
): string {
  const { displayDate, isNextDay } = getSecurityDisplayDate(workDateStr, shift, attendanceType, category)
  const formatted = formatInTimeZone(parseISO(displayDate), TIMEZONE, 'dd MMM yyyy')
  return isNextDay ? `${formatted} (H+1)` : formatted
}

// ─── Helper ──────────────────────────────────────────────────

function displayDate(workDateStr: string, shift: string | null, type: string, category: string) {
  return getSecurityDisplayDate(workDateStr, shift, type, category).displayDate
}

function isNextDay(workDateStr: string, shift: string | null, type: string, category: string) {
  return getSecurityDisplayDate(workDateStr, shift, type, category).isNextDay
}

// ─── Tests ───────────────────────────────────────────────────

// Day verification helper (for test clarity)
// 2026-11-02 = Mon, 2026-11-03 = Tue, 2026-11-04 = Wed, 2026-11-05 = Thu
// 2026-11-06 = Fri, 2026-11-07 = Sat, 2026-11-08 = Sun

test('1. Pulang Shift III Senin (Mon) → H+1', () => {
  // 2026-11-02 is Monday (day 1)
  assert.equal(jakartaDayOfWeek('2026-11-02'), 1) // Monday
  assert.ok(isNextDay('2026-11-02', 'Shift III', 'pulang', 'Security'))
  assert.equal(displayDate('2026-11-02', 'Shift III', 'pulang', 'Security'), '2026-11-03')
})

test('2. Pulang Shift III Kamis (Thu) → H+1', () => {
  // 2026-11-05 is Thursday (day 4)
  assert.equal(jakartaDayOfWeek('2026-11-05'), 4) // Thursday
  assert.ok(isNextDay('2026-11-05', 'Shift III', 'pulang', 'Security'))
  assert.equal(displayDate('2026-11-05', 'Shift III', 'pulang', 'Security'), '2026-11-06')
})

test('3. Pulang Shift II Jumat (Fri) → H+1', () => {
  // 2026-11-06 is Friday (day 5)
  assert.equal(jakartaDayOfWeek('2026-11-06'), 5) // Friday
  assert.ok(isNextDay('2026-11-06', 'Shift II', 'pulang', 'Security'))
  assert.equal(displayDate('2026-11-06', 'Shift II', 'pulang', 'Security'), '2026-11-07')
})

test('4. Pulang Shift II Sabtu (Sat) → H+1', () => {
  // 2026-11-07 is Saturday (day 6)
  assert.equal(jakartaDayOfWeek('2026-11-07'), 6) // Saturday
  assert.ok(isNextDay('2026-11-07', 'Shift II', 'pulang', 'Security'))
  assert.equal(displayDate('2026-11-07', 'Shift II', 'pulang', 'Security'), '2026-11-08')
})

test('5. Pulang Sesi Malam Sabtu → H+1', () => {
  // 2026-11-07 is Saturday (day 6), Sesi Malam is treated as Shift II
  assert.ok(isNextDay('2026-11-07', 'Sesi Malam', 'pulang', 'Security'))
  assert.equal(displayDate('2026-11-07', 'Sesi Malam', 'pulang', 'Security'), '2026-11-08')
})

test('6. Pulang Shift II Minggu (Sun) → H+1', () => {
  // 2026-11-08 is Sunday (day 0)
  assert.equal(jakartaDayOfWeek('2026-11-08'), 0) // Sunday
  assert.ok(isNextDay('2026-11-08', 'Shift II', 'pulang', 'Security'))
  assert.equal(displayDate('2026-11-08', 'Shift II', 'pulang', 'Security'), '2026-11-09')
})

test('7. Masuk Shift III Senin → tanggal asli (no H+1)', () => {
  assert.equal(isNextDay('2026-11-02', 'Shift III', 'masuk', 'Security'), false)
  assert.equal(displayDate('2026-11-02', 'Shift III', 'masuk', 'Security'), '2026-11-02')
})

test('8. Pulang Shift I Senin → tanggal asli (Shift I bukan overnight)', () => {
  assert.equal(isNextDay('2026-11-02', 'Shift I', 'pulang', 'Security'), false)
  assert.equal(displayDate('2026-11-02', 'Shift I', 'pulang', 'Security'), '2026-11-02')
})

test('9. Pulang Shift II Selasa (Tue) → tanggal asli (Shift II bukan overnight di hari kerja)', () => {
  // 2026-11-03 is Tuesday (day 2), Shift II on Tue is NOT overnight
  assert.equal(jakartaDayOfWeek('2026-11-03'), 2) // Tuesday
  assert.equal(isNextDay('2026-11-03', 'Shift II', 'pulang', 'Security'), false)
  assert.equal(displayDate('2026-11-03', 'Shift II', 'pulang', 'Security'), '2026-11-03')
})

test('10. CS record → no H+1 regardless of shift', () => {
  // CS should never get H+1 treatment
  assert.equal(isNextDay('2026-11-02', 'Shift III', 'pulang', 'CS'), false)
  assert.equal(displayDate('2026-11-02', 'Shift III', 'pulang', 'CS'), '2026-11-02')
  assert.equal(isNextDay('2026-11-07', 'Shift II', 'pulang', 'CS'), false)
})

test('11. Batas bulan: 30 Nov (Senin) Shift III → 01 Des', () => {
  // 2026-11-30 is Monday (day 1)
  assert.equal(jakartaDayOfWeek('2026-11-30'), 1) // Monday
  assert.ok(isNextDay('2026-11-30', 'Shift III', 'pulang', 'Security'))
  assert.equal(displayDate('2026-11-30', 'Shift III', 'pulang', 'Security'), '2026-12-01')
})

test('12. Batas tahun: 31 Des (Kamis) Shift III → 01 Jan tahun depan', () => {
  // 2026-12-31 is Thursday (day 4)
  assert.equal(jakartaDayOfWeek('2026-12-31'), 4) // Thursday
  assert.ok(isNextDay('2026-12-31', 'Shift III', 'pulang', 'Security'))
  assert.equal(displayDate('2026-12-31', 'Shift III', 'pulang', 'Security'), '2027-01-01')
})

test('13. Tahun kabisat: 28 Feb 2024 (Rabu) Shift III → 29 Feb 2024', () => {
  // 2024-02-28 is Wednesday (day 3)
  assert.equal(jakartaDayOfWeek('2024-02-28'), 3) // Wednesday
  assert.ok(isNextDay('2024-02-28', 'Shift III', 'pulang', 'Security'))
  assert.equal(displayDate('2024-02-28', 'Shift III', 'pulang', 'Security'), '2024-02-29')
})

test('14. work_date string tidak berubah setelah pemanggilan fungsi', () => {
  const originalDate = '2026-11-02'
  const originalShift = 'Shift III'
  const result = getSecurityDisplayDate(originalDate, originalShift, 'pulang', 'Security')
  // Original strings untouched
  assert.equal(originalDate, '2026-11-02')
  assert.equal(originalShift, 'Shift III')
  // Only display date changes
  assert.equal(result.displayDate, '2026-11-03')
  assert.equal(result.isNextDay, true)
})

test('15. Masuk semua shift tidak mendapat H+1', () => {
  const shifts = ['Shift I', 'Shift II', 'Shift III', 'Sesi Pagi', 'Sesi Malam']
  for (const shift of shifts) {
    // Mon (overnight candidate for Shift III), should not get H+1 on masuk
    assert.equal(
      isNextDay('2026-11-02', shift, 'masuk', 'Security'),
      false,
      `Masuk ${shift} should not be H+1`
    )
  }
})

test('16. Pulang Shift III Rabu (Wed) → H+1', () => {
  // 2026-11-04 is Wednesday (day 3) — covers mid-week scenario
  assert.equal(jakartaDayOfWeek('2026-11-04'), 3) // Wednesday
  assert.ok(isNextDay('2026-11-04', 'Shift III', 'pulang', 'Security'))
  assert.equal(displayDate('2026-11-04', 'Shift III', 'pulang', 'Security'), '2026-11-05')
})

test('17. Pulang Sesi Malam Minggu (Sun) → H+1', () => {
  // 2026-11-08 is Sunday (day 0)
  assert.ok(isNextDay('2026-11-08', 'Sesi Malam', 'pulang', 'Security'))
  assert.equal(displayDate('2026-11-08', 'Sesi Malam', 'pulang', 'Security'), '2026-11-09')
})

test('18. Pulang shift null → tanggal asli', () => {
  assert.equal(isNextDay('2026-11-02', null, 'pulang', 'Security'), false)
  assert.equal(displayDate('2026-11-02', null, 'pulang', 'Security'), '2026-11-02')
})

test('19. formatSecurityDisplayDate: Shift III Mon pulang → includes (H+1)', () => {
  const result = formatSecurityDisplayDate('2026-11-02', 'Shift III', 'pulang', 'Security')
  assert.ok(result.includes('(H+1)'), `Expected "(H+1)" in: ${result}`)
  assert.ok(result.includes('03'), `Expected "03" (Nov 3) in: ${result}`)
})

test('20. formatSecurityDisplayDate: Shift I Mon pulang → no (H+1)', () => {
  const result = formatSecurityDisplayDate('2026-11-02', 'Shift I', 'pulang', 'Security')
  assert.ok(!result.includes('(H+1)'), `Expected no "(H+1)" in: ${result}`)
  assert.ok(result.includes('02'), `Expected "02" (Nov 2) in: ${result}`)
})
