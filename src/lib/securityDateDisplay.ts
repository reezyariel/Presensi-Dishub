// ============================================================
// SIPATEN — Security Date Display Utility (Pure, no supabase)
// ============================================================
// Provides display-only date helpers for Security overnight shifts.
// NEVER modifies work_date in the database or any grouping/filtering.
//
// Overnight rules (based on work_date day of week, NOT checkout date):
//   Mon–Thu (day 1–4): Shift III   → checkout displays H+1
//   Fri     (day 5):   Shift II    → checkout displays H+1
//   Sat–Sun (day 0,6): Shift II or Sesi Malam → checkout displays H+1
// ============================================================

import { getDay, parseISO } from 'date-fns'
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'
import type { SecurityShiftOption, AttendanceType, AttendanceRecord } from '../types/attendance'

const TIMEZONE = 'Asia/Jakarta'

// ─── Internal helpers (pure, no supabase) ───────────────────

/** Returns day-of-week (0=Sun, 1=Mon, …, 6=Sat) in Asia/Jakarta from a YYYY-MM-DD string. */
function jakartaDayOfWeek(workDateStr: string): number {
  const d = parseISO(workDateStr)
  const zoned = toZonedTime(d, TIMEZONE)
  return getDay(zoned)
}

/** Normalizes common shift name variants to canonical form. */
function canonicalShift(shift: string | null | undefined): string {
  if (!shift) return ''
  const s = shift.trim()
  if (s === 'Shift 1' || s === 'Shift I' || s === 'Sesi Pagi') return 'Shift I'
  if (s === 'Shift 2' || s === 'Shift II' || s === 'Sesi Malam') return 'Shift II'
  if (s === 'Shift 3' || s === 'Shift III') return 'Shift III'
  return s
}

/**
 * Returns true if the given shift on work_date is an overnight (cross-midnight) Security shift.
 *
 * Uses work_date's day of week (Jakarta time), NOT the actual checkout timestamp.
 *
 * @param workDateStr - YYYY-MM-DD string from the attendance_records.work_date column
 * @param shift       - Security shift option from the record
 */
export function isOvernightSecurityShift(
  workDateStr: string,
  shift: SecurityShiftOption | null,
): boolean {
  if (!shift) return false
  const day = jakartaDayOfWeek(workDateStr)
  const canon = canonicalShift(shift)

  // Mon–Thu (1–4): Shift III is overnight
  if (day >= 1 && day <= 4) return canon === 'Shift III'

  // Fri (5): shift_2_malam is overnight; Shift II for backward compat
  if (day === 5) return shift === 'shift_2_malam' || canon === 'Shift II'

  // Sat (6) or Sun (0): Shift II or Sesi Malam is overnight
  if (day === 0 || day === 6) return canon === 'Shift II' || shift === 'Sesi Malam'

  return false
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Computes the display date for a Security attendance transaction.
 *
 * Rules:
 * - If the record is a Security "pulang" on an overnight shift, display date = work_date + 1 day.
 * - In all other cases (or for CS), display date = work_date as-is.
 *
 * Date arithmetic is done in UTC components to avoid any timezone shift;
 * the result is a plain YYYY-MM-DD string safe for further formatting.
 *
 * NEVER mutates the original record or the database work_date value.
 *
 * @param workDateStr      - YYYY-MM-DD from attendance_records.work_date
 * @param shift            - Shift option from the record (nullable)
 * @param attendanceType   - 'masuk' | 'istirahat' | 'pulang'
 * @param category         - 'CS' | 'Security'
 */
export function getSecurityDisplayDate(
  workDateStr: string,
  shift: SecurityShiftOption | null,
  attendanceType: AttendanceType,
  category: string,
): { displayDate: string; isNextDay: boolean } {
  if (
    category === 'Security' &&
    attendanceType === 'pulang' &&
    shift !== null &&
    isOvernightSecurityShift(workDateStr, shift)
  ) {
    // Increment calendar day using UTC components — correct across all month/year boundaries
    const [y, m, d] = workDateStr.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    const ny = next.getUTCFullYear()
    const nm = String(next.getUTCMonth() + 1).padStart(2, '0')
    const nd = String(next.getUTCDate()).padStart(2, '0')
    return { displayDate: `${ny}-${nm}-${nd}`, isNextDay: true }
  }
  return { displayDate: workDateStr, isNextDay: false }
}

/**
 * Formats the display date for a Security record as a human-readable Jakarta date string.
 * Appends "(H+1)" label when the checkout falls on the next calendar day.
 *
 * Uses Asia/Jakarta timezone for display formatting.
 *
 * @example
 *   formatSecurityDisplayDate('2026-11-03', 'Shift III', 'pulang', 'Security')
 *   // → "04 Nov 2026 (H+1)"
 *
 * @example
 *   formatSecurityDisplayDate('2026-11-03', 'Shift I', 'masuk', 'Security')
 *   // → "03 Nov 2026"
 */
export function formatSecurityDisplayDate(
  workDateStr: string,
  shift: SecurityShiftOption | null,
  attendanceType: AttendanceType,
  category: string,
): string {
  const { displayDate, isNextDay } = getSecurityDisplayDate(
    workDateStr,
    shift,
    attendanceType,
    category,
  )
  // Format the date in Asia/Jakarta using 'dd MMM yyyy' pattern
  const formatted = formatInTimeZone(parseISO(displayDate), TIMEZONE, 'dd MMM yyyy')
  return isNextDay ? `${formatted} (H+1)` : formatted
}

// ─── Filter & Range Query Helpers (Pure, no DB mutation) ────

/**
 * Subtracts N calendar days from a YYYY-MM-DD date string.
 * Uses pure UTC calendar arithmetic so that the calculation is completely
 * independent of the browser's local timezone.
 *
 * @example
 *   subtractCalendarDays('2026-11-04', 30) // → '2026-10-05'
 *   subtractCalendarDays('2026-11-04', 1)  // → '2026-11-03'
 */
export function subtractCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d - days))
  const ry = dt.getUTCFullYear()
  const rm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const rd = String(dt.getUTCDate()).padStart(2, '0')
  return `${ry}-${rm}-${rd}`
}

/**
 * Returns the calendar date immediately preceding the given date string (YYYY-MM-DD).
 * Computed using UTC components to guarantee exact boundary calculation
 * across months, years, and leap years without any timezone shift.
 *
 * @example
 *   getPreviousCalendarDate('2026-11-04') // → '2026-11-03'
 *   getPreviousCalendarDate('2026-11-01') // → '2026-10-31'
 *   getPreviousCalendarDate('2027-01-01') // → '2026-12-31'
 *   getPreviousCalendarDate('2024-03-01') // → '2024-02-29'
 */
export function getPreviousCalendarDate(dateStr: string): string {
  return subtractCalendarDays(dateStr, 1)
}

/**
 * Returns the calendar date immediately following the given date string (YYYY-MM-DD).
 *
 * @example
 *   getNextCalendarDate('2026-11-03') // → '2026-11-04'
 *   getNextCalendarDate('2026-10-31') // → '2026-11-01'
 *   getNextCalendarDate('2026-12-31') // → '2027-01-01'
 *   getNextCalendarDate('2024-02-28') // → '2024-02-29'
 */
export function getNextCalendarDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  const ny = next.getUTCFullYear()
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0')
  const nd = String(next.getUTCDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

/**
 * Checks whether an attendance record is an overnight Security "pulang" transaction
 * whose actual calendar checkout date (work_date + 1 day) falls within [dateFrom, dateTo].
 *
 * Conditions that must all be satisfied:
 * 1. category === 'Security'
 * 2. attendance_type === 'pulang'
 * 3. shift is identified as an overnight shift via isOvernightSecurityShift(work_date, shift)
 * 4. Actual display date (work_date + 1 day) is between dateFrom and dateTo (inclusive)
 *
 * Excludes:
 * - CS records
 * - Check-in ('masuk') records
 * - Non-overnight shifts (e.g. Shift I, weekday Shift II)
 * - Checkouts whose display date falls outside the filter range
 */
export function isSecurityOvernightCheckoutInRange(
  record: AttendanceRecord,
  dateFrom?: string | null,
  dateTo?: string | null,
): boolean {
  // 1. Must be Security category
  if (record.category !== 'Security') return false

  // 2. Must be 'pulang' attendance type
  if (record.attendance_type !== 'pulang') return false

  // 3. Must have a shift and be recognized as overnight shift on its work_date
  if (!record.shift || !isOvernightSecurityShift(record.work_date, record.shift)) {
    return false
  }

  // 4. Actual checkout calendar date (work_date + 1 day)
  const { displayDate, isNextDay } = getSecurityDisplayDate(
    record.work_date,
    record.shift,
    record.attendance_type,
    record.category,
  )

  if (!isNextDay) return false

  if (dateFrom && displayDate < dateFrom) return false
  if (dateTo && displayDate > dateTo) return false

  return true
}

/**
 * Merges two arrays of AttendanceRecord (regular records + additional H+1 records),
 * deduplicating by transaction ID, and returns the combined list sorted by
 * recorded_at descending (most recent transaction first).
 *
 * Guaranteed properties:
 * - Zero duplicate IDs.
 * - Deterministic chronological sorting.
 * - Does NOT mutate input arrays.
 */
export function mergeAndDeduplicateAttendance(
  regularRecords: AttendanceRecord[],
  additionalRecords: AttendanceRecord[],
): AttendanceRecord[] {
  const recordMap = new Map<string, AttendanceRecord>()

  // 1. Insert regular records
  for (const r of regularRecords) {
    recordMap.set(r.id, r)
  }

  // 2. Insert additional records (if already present, regular record is preserved)
  for (const r of additionalRecords) {
    if (!recordMap.has(r.id)) {
      recordMap.set(r.id, r)
    }
  }

  // 3. Convert to array and sort descending by recorded_at
  return Array.from(recordMap.values()).sort((a, b) => {
    const timeA = new Date(a.recorded_at).getTime()
    const timeB = new Date(b.recorded_at).getTime()
    return timeB - timeA
  })
}
