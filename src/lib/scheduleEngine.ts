// ============================================================
// ShiftTrack — Schedule Engine
// Handles CS and Security attendance rules including Shift III
// midnight crossover and Thursday/Friday schedule shift
// ============================================================

import type { ShiftType, AttendanceType, AttendanceStatus, ScheduleInfo } from '../types/attendance'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { getDay, parseISO, subDays } from 'date-fns'

export const TIMEZONE = 'Asia/Jakarta'

// Day of week helpers (0=Sun, 1=Mon, ... 4=Thu, 5=Fri)
const isThursdayOrFriday = (date: Date): boolean => {
  const day = getDay(date) // in local time
  return day === 4 || day === 5
}

// ─────────────────────────────────────────────────────────────
// CS Schedule
// ─────────────────────────────────────────────────────────────
export const CS_SCHEDULE = {
  masuk:     { start: '07:00', windowEnd: '08:00' },
  istirahat: { start: '12:00', windowEnd: '14:00' },
  pulang:    { start: '16:00', windowEnd: '18:00' },
} as const

// ─────────────────────────────────────────────────────────────
// Security Schedule Lookup
// ─────────────────────────────────────────────────────────────
interface ShiftSchedule {
  start: string    // HH:mm — jam mulai shift (acuan keterlambatan)
  windowEnd: string  // HH:mm — batas jendela masuk
  end: string      // HH:mm — jam selesai shift
  endNextDay: boolean
  endWindowEnd: string // HH:mm — batas jendela pulang
  endWindowEndNextDay: boolean
}

type SecurityScheduleMap = Record<ShiftType, ShiftSchedule>

const SECURITY_NORMAL: SecurityScheduleMap = {
  'Shift I': {
    start: '07:30', windowEnd: '08:00',
    end: '16:00', endNextDay: false,
    endWindowEnd: '16:30', endWindowEndNextDay: false,
  },
  'Shift II': {
    start: '16:00', windowEnd: '16:30',
    end: '20:00', endNextDay: false,
    endWindowEnd: '20:30', endWindowEndNextDay: false,
  },
  'Shift III': {
    start: '20:00', windowEnd: '20:30',
    end: '07:30', endNextDay: true,
    endWindowEnd: '08:00', endWindowEndNextDay: true,
  },
}

const SECURITY_SHIFTED: SecurityScheduleMap = {
  'Shift I': {
    start: '08:00', windowEnd: '08:30',
    end: '16:30', endNextDay: false,
    endWindowEnd: '17:00', endWindowEndNextDay: false,
  },
  'Shift II': {
    start: '16:30', windowEnd: '17:00',
    end: '20:30', endNextDay: false,
    endWindowEnd: '21:00', endWindowEndNextDay: false,
  },
  'Shift III': {
    start: '20:30', windowEnd: '21:00',
    end: '08:00', endNextDay: true,
    endWindowEnd: '08:30', endWindowEndNextDay: true,
  },
}

// ─────────────────────────────────────────────────────────────
// Get schedule for Security based on work_date and shift
// work_date determines whether to use shifted schedule
// ─────────────────────────────────────────────────────────────
export function getSecuritySchedule(workDate: string, shift: ShiftType): ShiftSchedule {
  const date = parseISO(workDate)
  const shifted = isThursdayOrFriday(date)
  return shifted ? SECURITY_SHIFTED[shift] : SECURITY_NORMAL[shift]
}

// ─────────────────────────────────────────────────────────────
// Get ScheduleInfo for display purposes
// ─────────────────────────────────────────────────────────────
export function getScheduleInfo(
  category: 'CS' | 'Security',
  attendanceType: AttendanceType,
  shift: ShiftType | null,
  workDate: string,
): ScheduleInfo | null {
  if (category === 'CS') {
    const s = CS_SCHEDULE[attendanceType]
    return {
      scheduledStart: s.start,
      scheduledEnd: s.windowEnd,
      isNextDay: false,
      dayType: 'normal',
    }
  }

  if (!shift) return null
  const date = parseISO(workDate)
  const shifted = isThursdayOrFriday(date)
  const s = shifted ? SECURITY_SHIFTED[shift] : SECURITY_NORMAL[shift]

  if (attendanceType === 'masuk') {
    return {
      scheduledStart: s.start,
      scheduledEnd: s.windowEnd,
      isNextDay: false,
      dayType: shifted ? 'shifted' : 'normal',
    }
  }

  return {
    scheduledStart: s.end,
    scheduledEnd: s.endWindowEnd,
    isNextDay: s.endNextDay,
    dayType: shifted ? 'shifted' : 'normal',
  }
}

// ─────────────────────────────────────────────────────────────
// Parse HH:mm time on a given date (Jakarta tz)
// Returns a Date object
// ─────────────────────────────────────────────────────────────
function parseTimeOnDate(timeStr: string, date: Date, nextDay = false): Date {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(date)
  if (nextDay) d.setDate(d.getDate() + 1)
  d.setHours(h, m, 0, 0)
  return d
}

// ─────────────────────────────────────────────────────────────
// Determine work_date for a Security Shift III pulang record
// If recorded_at is before noon, assume it's the next day after
// the shift started, so work_date = recorded_at date - 1 day
// ─────────────────────────────────────────────────────────────
export function determineShiftIIIWorkDate(recordedAt: Date): string {
  const jakartaTime = toZonedTime(recordedAt, TIMEZONE)
  const hour = jakartaTime.getHours()
  // If before noon (12:00), it's the morning-after portion of Shift III
  if (hour < 12) {
    const workDate = subDays(jakartaTime, 1)
    return formatInTimeZone(workDate, TIMEZONE, 'yyyy-MM-dd')
  }
  return formatInTimeZone(jakartaTime, TIMEZONE, 'yyyy-MM-dd')
}

// ─────────────────────────────────────────────────────────────
// Calculate attendance status and late_minutes
// recordedAt: actual server time
// workDateStr: ISO date YYYY-MM-DD (work_date)
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

  // Only masuk is evaluated for lateness per PRD
  if (attendanceType !== 'masuk') {
    return { status: 'tepat_waktu', lateMinutes: 0, scheduledStart: '', scheduledEnd: '' }
  }

  if (category === 'CS') {
    // CS attendance never receives 'terlambat' status per established policy
    return {
      status: 'tepat_waktu',
      lateMinutes: 0,
      scheduledStart: CS_SCHEDULE.masuk.start,
      scheduledEnd: CS_SCHEDULE.masuk.windowEnd,
    }
  }

  if (!shift) throw new Error('shift required for Security')
  const s = getSecuritySchedule(workDateStr, shift)
  const startStr = s.start
  const endStr = s.windowEnd

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
// Check if attendance window is open
// Returns: 'not_yet' | 'open' | 'closed_accept'
// 'not_yet'       → jendela belum dibuka
// 'open'          → dalam jendela masuk (tepat waktu possible)
// 'closed_accept' → lewat jendela tapi tetap diterima
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
    const s = CS_SCHEDULE[attendanceType]
    const start = parseTimeOnDate(s.start, workDate)
    const end = parseTimeOnDate(s.windowEnd, workDate)

    if (current < start) return 'not_yet'
    if (current <= end) return 'open'
    return 'closed_accept'
  }

  // Security
  if (!shift) return 'not_yet'
  const s = getSecuritySchedule(workDateStr, shift)

  if (attendanceType === 'masuk') {
    const start = parseTimeOnDate(s.start, workDate)
    const end = parseTimeOnDate(s.windowEnd, workDate)
    if (current < start) return 'not_yet'
    if (current <= end) return 'open'
    return 'closed_accept'
  }

  // pulang
  const start = parseTimeOnDate(s.end, workDate, s.endNextDay)
  const end = parseTimeOnDate(s.endWindowEnd, workDate, s.endWindowEndNextDay)
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
