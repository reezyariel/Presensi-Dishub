// ============================================================
// ShiftTrack — Schedule Engine (Dynamic DB-backed)
// CS masuk: open=07:30, ontime_deadline=08:00, close=11:59
//   before open        → tombol disabled (presensi ditolak)
//   open..deadline     → tombol aktif, status tepat_waktu
//   deadline+1..close  → tombol aktif, status terlambat
//   after close        → tombol disabled (presensi ditolak)
// Security: 3-shift rotation with Thu/Fri +N min offset
// Reads authoritative schedule from attendance_settings
// ============================================================

import type { ShiftType, AttendanceType, AttendanceStatus, ScheduleInfo, AttendanceRecord } from '../types/attendance'
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
export interface CSScheduleWindow {
  /** Waktu tombol mulai aktif (sebelumnya: presensi ditolak) */
  open: string           // HH:mm
  /** Batas akhir status tepat_waktu (inklusif). Setelah ini = terlambat. */
  ontime_deadline: string // HH:mm
  /** Waktu penutupan jendela (setelahnya: presensi ditolak) */
  close: string          // HH:mm
}

export interface CSSchedule {
  masuk:     CSScheduleWindow
  istirahat: { start: string; end: string }
  pulang:    { start: string; end: string }
}

export const DEFAULT_CS_SCHEDULE: CSSchedule = {
  masuk:     { open: '07:30', ontime_deadline: '08:00', close: '11:59' },
  istirahat: { start: '12:00', end: '14:00' },
  pulang:    { start: '16:00', end: '18:00' },
}

// Legacy alias — keep for backward compat (reads from new structure)
export const CS_SCHEDULE = {
  masuk:     { start: DEFAULT_CS_SCHEDULE.masuk.open, windowEnd: DEFAULT_CS_SCHEDULE.masuk.ontime_deadline },
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
    if (attendanceType === 'masuk') {
      return {
        scheduledStart: cs.masuk.open,
        scheduledEnd: cs.masuk.ontime_deadline,
        isNextDay: false,
        dayType: 'normal',
      }
    }
    const s = attendanceType === 'istirahat' ? cs.istirahat : cs.pulang
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
// CS POLICY:
//   - masuk tepat_waktu jika check-in pada atau sebelum scheduledEnd (08:00)
//   - masuk terlambat jika check-in setelah scheduledEnd (08:00), dengan
//     late_minutes dihitung dari scheduledEnd.
//   - Jadwal masuk CS: start=07:30, end=08:00 (batas terlambat)
// Security: Compare against shift start; late if after scheduled start.
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
    // CS policy:
    //   tepat_waktu  jika masuk pada atau sebelum ontime_deadline (08:00)
    //   terlambat    jika masuk SETELAH ontime_deadline tapi sebelum/pada close
    //   (Penolakan sebelum open / setelah close ditangani di edge function)
    const cs = getCSScheduleSync()
    const scheduledStart = cs.masuk.open             // '07:30'
    const scheduledEnd   = cs.masuk.ontime_deadline   // '08:00' — batas tepat_waktu

    const lateDeadline = parseTimeOnDate(scheduledEnd, workDate)
    const diffMs  = recorded.getTime() - lateDeadline.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin > 0) {
      return {
        status: 'terlambat',
        lateMinutes: diffMin,
        scheduledStart,
        scheduledEnd,
      }
    }
    return {
      status: 'tepat_waktu',
      lateMinutes: 0,
      scheduledStart,
      scheduledEnd,
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
// Returns:
//   'not_yet'      — sebelum waktu open (tombol disabled)
//   'open'         — dalam jendela (tombol aktif)
//   'closed_accept'— TIDAK DIGUNAKAN untuk CS masuk (digantikan 'closed')
//   'closed'       — setelah waktu penutupan (tombol disabled, backend menolak)
// ─────────────────────────────────────────────────────────────
export type WindowStatus = 'not_yet' | 'open' | 'closed_accept' | 'closed'

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
    if (attendanceType === 'masuk') {
      // masuk: 3-boundary system
      const openTime  = parseTimeOnDate(cs.masuk.open,            workDate)
      const closeTime = parseTimeOnDate(cs.masuk.close,           workDate)
      if (current < openTime)  return 'not_yet'
      if (current > closeTime) return 'closed'
      return 'open'  // open includes both tepat_waktu and terlambat zones
    }
    // istirahat / pulang: simple start/end window
    const s = attendanceType === 'istirahat' ? cs.istirahat : cs.pulang
    const start = parseTimeOnDate(s.start, workDate)
    const end   = parseTimeOnDate(s.end,   workDate)
    if (current < start) return 'not_yet'
    if (current <= end)  return 'open'
    return 'closed_accept'
  }

  // Security — unchanged
  if (!shift) return 'not_yet'
  const s = getSecuritySchedule(workDateStr, shift)

  if (attendanceType === 'masuk') {
    const start = parseTimeOnDate(s.start,      workDate)
    const end   = parseTimeOnDate(s.window_end, workDate)
    if (current < start) return 'not_yet'
    if (current <= end)  return 'open'
    return 'closed_accept'
  }

  // pulang
  const start = parseTimeOnDate(s.end,            workDate, s.end_next_day)
  const end   = parseTimeOnDate(s.end_window_end, workDate, s.end_window_end_next_day)
  if (current < start) return 'not_yet'
  if (current <= end)  return 'open'
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

// ─────────────────────────────────────────────────────────────
// Get next attendance step info after a completed step.
//
// Returns:
//   { type: AttendanceType, label: string, startTime: string, note?: string }
//   or null if all attendance is done for today.
//
// Used to display "Presensi berikutnya: Istirahat pukul 12.00 WIB"
// after a successful check-in.
// ─────────────────────────────────────────────────────────────
export interface NextAttendanceInfo {
  type: AttendanceType
  label: string
  startTime: string   // HH:mm
  note?: string
}

export function getTimeInMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

export function getNextAttendanceInfo(
  category: 'CS' | 'Security',
  completedTypes: AttendanceType[],
  shift: ShiftType | null,
  workDateStr: string,
  now: Date = new Date(),
): NextAttendanceInfo | null {
  const hasMasuk     = completedTypes.includes('masuk')
  const hasIstirahat = completedTypes.includes('istirahat')
  const hasPulang    = completedTypes.includes('pulang')

  // All done
  if (hasPulang) return null

  if (category === 'CS') {
    const cs = getCSScheduleSync()
    const jakartaNow = toZonedTime(now, TIMEZONE)
    const currentMinutes = jakartaNow.getHours() * 60 + jakartaNow.getMinutes()
    const istirahatEndMins = getTimeInMinutes(cs.istirahat.end)

    if (!hasMasuk) {
      return { type: 'masuk', label: 'Presensi Masuk', startTime: cs.masuk.open }
    }
    // If break was missed and istirahat period ended, next attendance is pulang
    if (!hasIstirahat && currentMinutes <= istirahatEndMins) {
      return { type: 'istirahat', label: 'Presensi Istirahat', startTime: cs.istirahat.start }
    }
    return { type: 'pulang', label: 'Presensi Pulang', startTime: cs.pulang.start }
  }

  // Security
  if (!shift) return null
  const s = getSecuritySchedule(workDateStr, shift)

  if (!hasMasuk) {
    return { type: 'masuk', label: 'Presensi Masuk', startTime: s.start }
  }
  // Security has no istirahat step — after masuk, next is pulang
  const note = s.end_next_day ? '(H+1)' : undefined
  return {
    type: 'pulang',
    label: 'Presensi Pulang',
    startTime: s.end,
    note,
  }
}

// ─────────────────────────────────────────────────────────────
// Authoritative Attendance Button State Engine
// Controls exact appearance, availability, and scheduling messages
// for employee attendance actions (CS & Security)
// ─────────────────────────────────────────────────────────────
export type AttendanceButtonState =
  | {
      status: 'workday_holiday'
      title: string
      message: string
    }
  | {
      status: 'waiting_masuk'
      title: string
      startTime: string
      message: string
    }
  | {
      status: 'can_masuk'
      title: string
      startTime: string
      endTime: string
      isLate: boolean  // true jika saat ini sudah melewati ontime_deadline
    }
  | {
      status: 'window_closed'  // jendela presensi masuk sudah ditutup
      title: string
      message: string
    }
  | {
      status: 'waiting_istirahat'
      title: string
      startTime: string
      message: string
    }
  | {
      status: 'can_istirahat'
      title: string
      startTime: string
      endTime: string
    }
  | {
      status: 'waiting_pulang'
      title: string
      startTime: string
      message: string
      note?: string
    }
  | {
      status: 'can_pulang'
      title: string
      startTime: string
      note?: string
    }
  | {
      status: 'completed'
      title: string
      message: string
    }

export function getAttendanceButtonState(
  category: 'CS' | 'Security',
  completedRecords: {
    masuk: AttendanceRecord | null
    istirahat: AttendanceRecord | null
    pulang: AttendanceRecord | null
  },
  shift: ShiftType | null,
  workDateStr: string,
  now: Date = new Date(),
): AttendanceButtonState {
  // 1. If already checked out (pulang is done)
  if (completedRecords.pulang) {
    return {
      status: 'completed',
      title: 'Presensi Selesai',
      message: 'Semua presensi hari ini sudah tercatat.',
    }
  }

  const jakartaNow = toZonedTime(now, TIMEZONE)
  const currentMinutes = jakartaNow.getHours() * 60 + jakartaNow.getMinutes()
  const dayOfWeek = getDay(jakartaNow) // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

  // ─────────────────────────────────────────────────────────────
  // CS Branch
  // ─────────────────────────────────────────────────────────────
  if (category === 'CS') {
    const cs = getCSScheduleSync()
    const masukOpenMins     = getTimeInMinutes(cs.masuk.open)
    const masukDeadlineMins = getTimeInMinutes(cs.masuk.ontime_deadline)
    const masukCloseMins    = getTimeInMinutes(cs.masuk.close)
    const istirahatStartMins = getTimeInMinutes(cs.istirahat.start)
    const istirahatEndMins   = getTimeInMinutes(cs.istirahat.end)
    const pulangStartMins    = getTimeInMinutes(cs.pulang.start)

    // A. Before Check-In
    if (!completedRecords.masuk) {
      // Workday check: CS operates Monday - Friday (days 1 to 5)
      const isWorkday = dayOfWeek >= 1 && dayOfWeek <= 5
      if (!isWorkday) {
        return {
          status: 'workday_holiday',
          title: 'Hari Libur (Bukan Hari Kerja CS)',
          message: 'Layanan Customer Service beroperasi hari Senin sampai Jumat. Presensi tidak aktif di akhir pekan.',
        }
      }

      // Sebelum jendela dibuka
      if (currentMinutes < masukOpenMins) {
        return {
          status: 'waiting_masuk',
          title: `Presensi Masuk Dibuka Pukul ${cs.masuk.open.replace(':', '.')} WIB`,
          startTime: cs.masuk.open,
          message: `Waktu check-in belum dimulai. Tombol akan aktif otomatis pukul ${cs.masuk.open.replace(':', '.')} WIB.`,
        }
      }

      // Setelah jendela ditutup
      if (currentMinutes > masukCloseMins) {
        return {
          status: 'window_closed',
          title: 'Jendela Presensi Masuk Ditutup',
          message: `Waktu presensi masuk telah berakhir pukul ${cs.masuk.close.replace(':', '.')} WIB. Presensi hari ini tidak dapat dilakukan.`,
        }
      }

      // Dalam jendela: tandai apakah sudah melewati batas tepat_waktu
      const isLate = currentMinutes > masukDeadlineMins
      return {
        status: 'can_masuk',
        title: isLate ? 'Absen Masuk (Terlambat)' : 'Ambil Foto & Absen Masuk',
        startTime: cs.masuk.open,
        endTime: cs.masuk.close,
        isLate,
      }
    }

    // B. After Check-In, Haven't Checked Out
    // Case 1: Haven't taken istirahat
    if (!completedRecords.istirahat) {
      // Before istirahat start time (e.g. before 12.00 WIB)
      if (currentMinutes < istirahatStartMins) {
        return {
          status: 'waiting_istirahat',
          title: `Presensi berikutnya: Istirahat pukul ${cs.istirahat.start.replace(':', '.')} WIB`,
          startTime: cs.istirahat.start,
          message: `Check-in berhasil. Tombol presensi istirahat akan aktif otomatis pukul ${cs.istirahat.start.replace(':', '.')} WIB.`,
        }
      }

      // Within istirahat window (e.g. 12.00 - 14.00 WIB)
      if (currentMinutes <= istirahatEndMins) {
        return {
          status: 'can_istirahat',
          title: 'Ambil Foto & Absen Istirahat',
          startTime: cs.istirahat.start,
          endTime: cs.istirahat.end,
        }
      }

      // Past istirahat window (> 14.00 WIB), missed break -> advance to pulang
      if (currentMinutes < pulangStartMins) {
        return {
          status: 'waiting_pulang',
          title: `Presensi berikutnya: Pulang pukul ${cs.pulang.start.replace(':', '.')} WIB`,
          startTime: cs.pulang.start,
          message: `Waktu istirahat telah berakhir. Tombol presensi pulang akan aktif pukul ${cs.pulang.start.replace(':', '.')} WIB.`,
        }
      }

      return {
        status: 'can_pulang',
        title: 'Ambil Foto & Absen Pulang',
        startTime: cs.pulang.start,
      }
    }

    // Case 2: Already taken istirahat
    if (currentMinutes < pulangStartMins) {
      return {
        status: 'waiting_pulang',
        title: `Presensi berikutnya: Pulang pukul ${cs.pulang.start.replace(':', '.')} WIB`,
        startTime: cs.pulang.start,
        message: `Presensi istirahat telah tercatat. Tombol presensi pulang akan aktif pukul ${cs.pulang.start.replace(':', '.')} WIB.`,
      }
    }

    return {
      status: 'can_pulang',
      title: 'Ambil Foto & Absen Pulang',
      startTime: cs.pulang.start,
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Security Branch
  // ─────────────────────────────────────────────────────────────
  const currentShift = shift || 'Shift I'
  const s = getSecuritySchedule(workDateStr, currentShift)
  const masukStartMins = getTimeInMinutes(s.start)
  const pulangStartMins = getTimeInMinutes(s.end)
  const note = s.end_next_day ? '(H+1)' : undefined

  // A. Before Check-In
  if (!completedRecords.masuk) {
    if (currentShift === 'Shift III') {
      // Shift III evening check: starts e.g. 20:00 (or 20:30)
      if (currentMinutes < masukStartMins && currentMinutes > 12 * 60) {
        return {
          status: 'waiting_masuk',
          title: `Presensi Masuk Dibuka Pukul ${s.start.replace(':', '.')} WIB`,
          startTime: s.start,
          message: `Waktu check-in Shift III belum dimulai. Tombol akan aktif pukul ${s.start.replace(':', '.')} WIB.`,
        }
      }
      return {
        status: 'can_masuk',
        title: 'Ambil Foto & Absen Masuk',
        startTime: s.start,
        endTime: s.window_end,
        isLate: false,
      }
    }

    // Shift I and II
    if (currentMinutes < masukStartMins) {
      return {
        status: 'waiting_masuk',
        title: `Presensi Masuk Dibuka Pukul ${s.start.replace(':', '.')} WIB`,
        startTime: s.start,
        message: `Waktu check-in belum dimulai. Tombol akan aktif pukul ${s.start.replace(':', '.')} WIB.`,
      }
    }

    return {
      status: 'can_masuk',
      title: 'Ambil Foto & Absen Masuk',
      startTime: s.start,
      endTime: s.window_end,
      isLate: false,
    }
  }

  // B. After Check-In, Haven't Checked Out
  if (currentShift === 'Shift III') {
    // If night time (>= 18:00 WIB), guard checked in tonight, checkout is tomorrow morning
    if (currentMinutes >= 18 * 60 || currentMinutes >= masukStartMins) {
      return {
        status: 'waiting_pulang',
        title: `Presensi berikutnya: Pulang pukul ${s.end.replace(':', '.')} WIB (H+1)`,
        startTime: s.end,
        note: '(H+1)',
        message: `Check-in Shift III tercatat. Tombol presensi pulang akan aktif besok pagi pukul ${s.end.replace(':', '.')} WIB.`,
      }
    }
    // Morning time (before 12:00)
    if (currentMinutes < pulangStartMins) {
      return {
        status: 'waiting_pulang',
        title: `Presensi berikutnya: Pulang pukul ${s.end.replace(':', '.')} WIB`,
        startTime: s.end,
        message: `Tombol presensi pulang akan aktif pukul ${s.end.replace(':', '.')} WIB.`,
      }
    }
    return {
      status: 'can_pulang',
      title: 'Ambil Foto & Absen Pulang',
      startTime: s.end,
      note: undefined,
    }
  }

  // Shift I & II
  if (currentMinutes < pulangStartMins) {
    return {
      status: 'waiting_pulang',
      title: `Presensi berikutnya: Pulang pukul ${s.end.replace(':', '.')} WIB`,
      startTime: s.end,
      note,
      message: `Check-in tercatat. Tombol presensi pulang akan aktif pukul ${s.end.replace(':', '.')} WIB.`,
    }
  }

  return {
    status: 'can_pulang',
    title: 'Ambil Foto & Absen Pulang',
    startTime: s.end,
    note,
  }
}

