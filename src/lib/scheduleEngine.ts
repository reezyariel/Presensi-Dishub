// ============================================================
// ShiftTrack — Schedule Engine (Dynamic DB-backed)
// CS: any check-in within [start, end] = tepat_waktu
// Security: 3-shift rotation with Thu/Fri +N min offset
// Reads authoritative schedule from attendance_settings
// ============================================================

import type { ShiftType, AttendanceType, AttendanceStatus, ScheduleInfo } from '../types/attendance'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { getDay, parseISO, subDays } from 'date-fns'
import { supabase } from './supabase'

export const TIMEZONE = 'Asia/Jakarta'

// Day of week helpers (0=Sun, 1=Mon, ... 4=Thu, 5=Fri)
const isThursdayOrFriday = (date: Date): boolean => {
  const day = getDay(date)
  return day === 4 || day === 5
}

// ─────────────────────────────────────────────────────────────
// CS Schedule Types & Defaults
// ─────────────────────────────────────────────────────────────
export interface CSSchedule {
  masuk:     { start: string; end: string }
  istirahat: { start: string; end: string }
  pulang:    { start: string; end: string }
}

export const DEFAULT_CS_SCHEDULE: CSSchedule = {
  masuk:     { start: '07:00', end: '08:00' },
  istirahat: { start: '12:00', end: '14:00' },
  pulang:    { start: '16:00', end: '18:00' },
}

// Legacy alias used in older code — keep for backward compat
export const CS_SCHEDULE = {
  masuk:     { start: DEFAULT_CS_SCHEDULE.masuk.start,     windowEnd: DEFAULT_CS_SCHEDULE.masuk.end },
  istirahat: { start: DEFAULT_CS_SCHEDULE.istirahat.start, windowEnd: DEFAULT_CS_SCHEDULE.istirahat.end },
  pulang:    { start: DEFAULT_CS_SCHEDULE.pulang.start,    windowEnd: DEFAULT_CS_SCHEDULE.pulang.end },
} as const

// ─────────────────────────────────────────────────────────────
// Security Schedule Types & Defaults
// ─────────────────────────────────────────────────────────────
interface ShiftSchedule {
  start: string
  window_end: string
  end: string
  end_window_end: string
  end_next_day: boolean
  end_window_end_next_day: boolean
}

export interface SecuritySchedule {
  thursday_friday_shift_minutes: number
  shifts: Record<ShiftType, ShiftSchedule>
}

export const DEFAULT_SECURITY_SCHEDULE: SecuritySchedule = {
  thursday_friday_shift_minutes: 30,
  shifts: {
    'Shift I': {
      start: '07:30', window_end: '08:00',
      end: '16:00', end_window_end: '16:30',
      end_next_day: false, end_window_end_next_day: false,
    },
    'Shift II': {
      start: '16:00', window_end: '16:30',
      end: '20:00', end_window_end: '20:30',
      end_next_day: false, end_window_end_next_day: false,
    },
    'Shift III': {
      start: '20:00', window_end: '20:30',
      end: '07:30', end_window_end: '08:00',
      end_next_day: true, end_window_end_next_day: true,
    },
  },
}

// ─────────────────────────────────────────────────────────────
// DB Settings Cache (module-level, refreshed on demand)
// ─────────────────────────────────────────────────────────────
let _csScheduleCache: CSSchedule | null = null
let _securityScheduleCache: SecuritySchedule | null = null
let _cacheLoadedAt = 0

async function loadScheduleCache(force = false): Promise<void> {
  const now = Date.now()
  if (!force && _cacheLoadedAt > 0 && now - _cacheLoadedAt < 60_000) return // 1 min cache

  try {
    const { data } = await supabase
      .from('attendance_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['cs_schedule', 'security_schedule'])

    if (data) {
      for (const row of data) {
        if (row.setting_key === 'cs_schedule') {
          _csScheduleCache = row.setting_value as CSSchedule
        } else if (row.setting_key === 'security_schedule') {
          _securityScheduleCache = row.setting_value as SecuritySchedule
        }
      }
    }
    _cacheLoadedAt = now
  } catch {
    // fallback to defaults on error
  }
}

export async function getCSSchedule(): Promise<CSSchedule> {
  await loadScheduleCache()
  return _csScheduleCache ?? DEFAULT_CS_SCHEDULE
}

export async function getSecurityScheduleFromDB(): Promise<SecuritySchedule> {
  await loadScheduleCache()
  return _securityScheduleCache ?? DEFAULT_SECURITY_SCHEDULE
}

export function invalidateScheduleCache(): void {
  _cacheLoadedAt = 0
}

// ─────────────────────────────────────────────────────────────
// Synchronous fallback (for components that can't await)
// ─────────────────────────────────────────────────────────────
export function getCSScheduleSync(): CSSchedule {
  return _csScheduleCache ?? DEFAULT_CS_SCHEDULE
}

export function getSecurityScheduleSync(): SecuritySchedule {
  return _securityScheduleCache ?? DEFAULT_SECURITY_SCHEDULE
}

// ─────────────────────────────────────────────────────────────
// Apply Thu/Fri offset to shift schedule
// ─────────────────────────────────────────────────────────────
function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function getShiftedSchedule(base: ShiftSchedule, offsetMin: number): ShiftSchedule {
  return {
    start: addMinutesToTime(base.start, offsetMin),
    window_end: addMinutesToTime(base.window_end, offsetMin),
    end: addMinutesToTime(base.end, offsetMin),
    end_window_end: addMinutesToTime(base.end_window_end, offsetMin),
    end_next_day: base.end_next_day,
    end_window_end_next_day: base.end_window_end_next_day,
  }
}

// ─────────────────────────────────────────────────────────────
// Get Security shift schedule for given date and shift (sync)
// ─────────────────────────────────────────────────────────────
export function getSecuritySchedule(workDate: string, shift: ShiftType): ShiftSchedule {
  const sec = getSecurityScheduleSync()
  const base = sec.shifts[shift] ?? DEFAULT_SECURITY_SCHEDULE.shifts[shift]
  const date = parseISO(workDate)
  if (isThursdayOrFriday(date)) {
    return getShiftedSchedule(base, sec.thursday_friday_shift_minutes)
  }
  return base
}

// ─────────────────────────────────────────────────────────────
// Pre-load schedule cache at app startup (call once)
// ─────────────────────────────────────────────────────────────
export async function preloadSchedules(): Promise<void> {
  await loadScheduleCache(true)
}

// ─────────────────────────────────────────────────────────────
// Get ScheduleInfo for display (synchronous, uses cache)
// ─────────────────────────────────────────────────────────────
export function getScheduleInfo(
  category: 'CS' | 'Security',
  attendanceType: AttendanceType,
  shift: ShiftType | null,
  workDate: string,
): ScheduleInfo | null {
  if (category === 'CS') {
    const cs = getCSScheduleSync()
    const s = cs[attendanceType]
    return {
      scheduledStart: s.start,
      scheduledEnd: s.end,
      isNextDay: false,
      dayType: 'normal',
    }
  }

  if (!shift) return null
  const date = parseISO(workDate)
  const sec = getSecurityScheduleSync()
  const base = sec.shifts[shift] ?? DEFAULT_SECURITY_SCHEDULE.shifts[shift]
  const shifted = isThursdayOrFriday(date)
  const s = shifted ? getShiftedSchedule(base, sec.thursday_friday_shift_minutes) : base

  if (attendanceType === 'masuk') {
    return {
      scheduledStart: s.start,
      scheduledEnd: s.window_end,
      isNextDay: false,
      dayType: shifted ? 'shifted' : 'normal',
    }
  }

  return {
    scheduledStart: s.end,
    scheduledEnd: s.end_window_end,
    isNextDay: s.end_next_day,
    dayType: shifted ? 'shifted' : 'normal',
  }
}

// ─────────────────────────────────────────────────────────────
// Parse HH:mm time on a given date
// ─────────────────────────────────────────────────────────────
function parseTimeOnDate(timeStr: string, date: Date, nextDay = false): Date {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(date)
  if (nextDay) d.setDate(d.getDate() + 1)
  d.setHours(h, m, 0, 0)
  return d
}

// ─────────────────────────────────────────────────────────────
// Determine work_date for Security Shift III pulang
// ─────────────────────────────────────────────────────────────
export function determineShiftIIIWorkDate(recordedAt: Date): string {
  const jakartaTime = toZonedTime(recordedAt, TIMEZONE)
  const hour = jakartaTime.getHours()
  if (hour < 12) {
    const workDate = subDays(jakartaTime, 1)
    return formatInTimeZone(workDate, TIMEZONE, 'yyyy-MM-dd')
  }
  return formatInTimeZone(jakartaTime, TIMEZONE, 'yyyy-MM-dd')
}

// ─────────────────────────────────────────────────────────────
// Calculate attendance status (synchronous, uses cache)
//
// CS POLICY: Any masuk within [start, end] = tepat_waktu (late_minutes: 0)
//            This is per business requirement — CS is never "terlambat"
//            as long as they check in before window end.
// Security:  Compare against shift start; late if after scheduled start.
// ─────────────────────────────────────────────────────────────
export function calculateAttendanceStatus(
  category: 'CS' | 'Security',
  attendanceType: AttendanceType,
  shift: ShiftType | null,
  workDateStr: string,
  recordedAt: Date,
): { status: AttendanceStatus; lateMinutes: number; scheduledStart: string; scheduledEnd: string } {
  const workDate = parseISO(workDateStr)
  const recorded = toZonedTime(recordedAt, TIMEZONE)

  // Only masuk is evaluated for lateness
  if (attendanceType !== 'masuk') {
    return { status: 'tepat_waktu', lateMinutes: 0, scheduledStart: '', scheduledEnd: '' }
  }

  if (category === 'CS') {
    // CS policy: tepat_waktu if within window [start, end], no late penalty
    const cs = getCSScheduleSync()
    return {
      status: 'tepat_waktu',
      lateMinutes: 0,
      scheduledStart: cs.masuk.start,
      scheduledEnd: cs.masuk.end,
    }
  }

  if (!shift) throw new Error('shift required for Security')
  const s = getSecuritySchedule(workDateStr, shift)
  const startStr = s.start
  const endStr = s.window_end

  const scheduledStartDate = parseTimeOnDate(startStr, workDate)
  const diffMs = recorded.getTime() - scheduledStartDate.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin <= 0) {
    return { status: 'tepat_waktu', lateMinutes: 0, scheduledStart: startStr, scheduledEnd: endStr }
  }

  return {
    status: 'terlambat',
    lateMinutes: diffMin,
    scheduledStart: startStr,
    scheduledEnd: endStr,
  }
}

// ─────────────────────────────────────────────────────────────
// Check if attendance window is open (synchronous)
// Returns: 'not_yet' | 'open' | 'closed_accept'
// ─────────────────────────────────────────────────────────────
export type WindowStatus = 'not_yet' | 'open' | 'closed_accept'

export function checkAttendanceWindow(
  category: 'CS' | 'Security',
  attendanceType: AttendanceType,
  shift: ShiftType | null,
  workDateStr: string,
  now: Date,
): WindowStatus {
  const workDate = parseISO(workDateStr)
  const current = toZonedTime(now, TIMEZONE)

  if (category === 'CS') {
    const cs = getCSScheduleSync()
    const s = cs[attendanceType]
    const start = parseTimeOnDate(s.start, workDate)
    const end = parseTimeOnDate(s.end, workDate)

    if (current < start) return 'not_yet'
    if (current <= end) return 'open'
    return 'closed_accept'
  }

  // Security
  if (!shift) return 'not_yet'
  const s = getSecuritySchedule(workDateStr, shift)

  if (attendanceType === 'masuk') {
    const start = parseTimeOnDate(s.start, workDate)
    const end = parseTimeOnDate(s.window_end, workDate)
    if (current < start) return 'not_yet'
    if (current <= end) return 'open'
    return 'closed_accept'
  }

  // pulang
  const start = parseTimeOnDate(s.end, workDate, s.end_next_day)
  const end = parseTimeOnDate(s.end_window_end, workDate, s.end_window_end_next_day)
  if (current < start) return 'not_yet'
  if (current <= end) return 'open'
  return 'closed_accept'
}

// ─────────────────────────────────────────────────────────────
// Format time helpers
// ─────────────────────────────────────────────────────────────
export function nowJakarta(): Date {
  return toZonedTime(new Date(), TIMEZONE)
}

export function formatJakartaTime(date: Date | string, fmt = 'HH:mm'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatInTimeZone(d, TIMEZONE, fmt)
}

export function formatJakartaDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatInTimeZone(d, TIMEZONE, 'dd MMMM yyyy')
}

export function formatJakartaDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatInTimeZone(d, TIMEZONE, 'dd MMM yyyy, HH:mm')
}

export function todayJakarta(): string {
  return formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd')
}

export function getDayName(dateStr: string): string {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const date = parseISO(dateStr)
  return days[getDay(date)]
}
