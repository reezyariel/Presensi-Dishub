// ============================================================
// SIPATEN — Schedule Engine (Dynamic DB-backed)
// CS masuk: open=07:30, ontime_deadline=08:00, close=11:59
//   before open        → tombol disabled (presensi ditolak)
//   open..deadline     → tombol aktif, status tepat_waktu
//   deadline+1..close  → tombol aktif, status terlambat
//   after close        → tombol disabled (presensi ditolak)
// Security: 3-shift rotation with Thu/Fri +N min offset
// Reads authoritative schedule from attendance_settings
// ============================================================

import type { ShiftType, SecurityShiftOption, WeekendSession, AttendanceType, AttendanceStatus, ScheduleInfo, AttendanceRecord } from '../types/attendance'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { getDay, parseISO, subDays } from 'date-fns'
import { supabase } from './supabase'

export const TIMEZONE = 'Asia/Jakarta'

// Day of week helpers (0=Sun, 1=Mon, ... 4=Thu, 5=Fri, 6=Sat)
const isThursdayOrFriday = (date: Date): boolean => {
  const day = getDay(date)
  return day === 4 || day === 5
}

// Saturday = 6, Sunday = 0
export function isWeekend(date: Date): boolean {
  const day = getDay(date)
  return day === 0 || day === 6
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

  // Backward compatibility aliases:
  start?: string
  end?: string
}

export interface CSSchedule {
  masuk: CSScheduleWindow
  istirahat: { start: string; end: string }
  pulang: { start: string; end: string }
}

export const DEFAULT_CS_SCHEDULE: CSSchedule = {
  masuk: { open: '07:30', ontime_deadline: '08:00', close: '11:59', start: '07:30', end: '08:00' },
  istirahat: { start: '12:00', end: '14:00' },
  pulang: { start: '16:00', end: '18:00' },
}

// Legacy alias — keep for backward compat (reads from new structure)
export const CS_SCHEDULE = {
  masuk: { start: DEFAULT_CS_SCHEDULE.masuk.open, windowEnd: DEFAULT_CS_SCHEDULE.masuk.ontime_deadline },
  istirahat: { start: DEFAULT_CS_SCHEDULE.istirahat.start, windowEnd: DEFAULT_CS_SCHEDULE.istirahat.end },
  pulang: { start: DEFAULT_CS_SCHEDULE.pulang.start, windowEnd: DEFAULT_CS_SCHEDULE.pulang.end },
} as const

// ─────────────────────────────────────────────────────────────
// Security Schedule Types & Defaults
// ─────────────────────────────────────────────────────────────
export interface ShiftSchedule {
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
  thursday_friday_shift_minutes: 0,
  shifts: {
    'Shift I': {
      start: '07:00', window_end: '07:30',
      end: '16:00', end_window_end: '16:30',
      end_next_day: false, end_window_end_next_day: false,
    },
    'Shift II': {
      start: '15:00', window_end: '15:30',
      end: '19:30', end_window_end: '20:00',
      end_next_day: false, end_window_end_next_day: false,
    },
    'Shift III': {
      start: '19:30', window_end: '20:00',
      end: '07:00', end_window_end: '07:30',
      end_next_day: true, end_window_end_next_day: true,
    },
    // Numeric aliases (Shift 1/2/3) — same as Roman numerals
    'Shift 1': {
      start: '07:00', window_end: '07:30',
      end: '16:00', end_window_end: '16:30',
      end_next_day: false, end_window_end_next_day: false,
    },
    'Shift 2': {
      start: '15:00', window_end: '15:30',
      end: '19:30', end_window_end: '20:00',
      end_next_day: false, end_window_end_next_day: false,
    },
    'Shift 3': {
      start: '19:30', window_end: '20:00',
      end: '07:00', end_window_end: '07:30',
      end_next_day: true, end_window_end_next_day: true,
    },
  },
}

// ─────────────────────────────────────────────────────────────
// Weekend Security Schedule (Sabtu & Minggu)
// Jendela masuk: Sesi Pagi 08:00–08:30, Sesi Malam 20:00–20:30
// Tidak menggunakan label Shift I/II/III pada akhir pekan.
// ─────────────────────────────────────────────────────────────
export interface WeekendSessionSchedule {
  open: string        // HH:mm — mulai jendela masuk
  close: string       // HH:mm — tutup jendela masuk (inklusif)
}

export interface SecurityWeekendSchedule {
  sesiPagi: WeekendSessionSchedule
  sesiMalam: WeekendSessionSchedule
}

export const DEFAULT_SECURITY_WEEKEND_SCHEDULE: SecurityWeekendSchedule = {
  sesiPagi:  { open: '08:00', close: '08:30' },
  sesiMalam: { open: '20:00', close: '20:30' },
}

/**
 * Returns available SecurityShiftOptions for the given work date.
 * - Weekday (Mon–Fri): returns ['Shift I', 'Shift II', 'Shift III']
 * - Weekend (Sat–Sun): returns ['Sesi Pagi', 'Sesi Malam']
 */
export function getSecurityAvailableOptions(workDateStr: string): SecurityShiftOption[] {
  const date = parseISO(workDateStr)
  if (isWeekend(date)) {
    return ['Sesi Pagi', 'Sesi Malam']
  }
  return ['Shift I', 'Shift II', 'Shift III']
}

/**
 * Returns true if the given SecurityShiftOption is a weekend session.
 */
export function isWeekendSession(shift: SecurityShiftOption | null): shift is WeekendSession {
  return shift === 'Sesi Pagi' || shift === 'Sesi Malam'
}

/**
 * Returns the WeekendSessionSchedule for a given session label.
 */
export function getWeekendSessionSchedule(session: WeekendSession): WeekendSessionSchedule {
  const ws = getSecurityWeekendScheduleSync()
  return session === 'Sesi Pagi' ? ws.sesiPagi : ws.sesiMalam
}

export interface SecurityOptionWindowInfo {
  option: SecurityShiftOption
  label: string
  sublabel: string
  scheduledStart: string
  scheduledEnd: string
  timeRangeDisplay: string
  workHoursDisplay: string
  windowStatus: WindowStatus
  isOpenNow: boolean
}

/**
 * Returns complete time window and status info for a specific Security shift option.
 */
export function getSecurityOptionInfo(
  option: SecurityShiftOption,
  workDateStr: string,
  now: Date = new Date(),
): SecurityOptionWindowInfo {
  const windowStatus = checkAttendanceWindow('Security', 'masuk', option, workDateStr, now)
  const isOpenNow = windowStatus === 'open'

  if (isWeekendSession(option)) {
    const ws = getWeekendSessionSchedule(option)
    return {
      option,
      label: option,
      sublabel: option === 'Sesi Pagi' ? 'Sesi Akhir Pekan Pagi' : 'Sesi Akhir Pekan Malam',
      scheduledStart: ws.open,
      scheduledEnd: ws.close,
      timeRangeDisplay: `${ws.open.replace(':', '.')} – ${ws.close.replace(':', '.')} WIB`,
      workHoursDisplay: option === 'Sesi Pagi' ? '08.00 – 20.00 WIB' : '20.00 – 08.00 WIB (H+1)',
      windowStatus,
      isOpenNow,
    }
  }

  const shiftKey = option as ShiftType
  const s = getSecuritySchedule(workDateStr, shiftKey)
  const sublabel =
    option === 'Shift I'
      ? 'Shift Pagi – Sore'
      : option === 'Shift II'
        ? 'Shift Sore – Malam'
        : 'Shift Malam – Pagi'

  const workHours = `${s.start.replace(':', '.')} – ${s.end.replace(':', '.')}${s.end_next_day ? ' (H+1)' : ''} WIB`

  return {
    option,
    label: option,
    sublabel,
    scheduledStart: s.start,
    scheduledEnd: s.window_end,
    timeRangeDisplay: `${s.start.replace(':', '.')} – ${s.window_end.replace(':', '.')} WIB`,
    workHoursDisplay: workHours,
    windowStatus,
    isOpenNow,
  }
}

/**
 * Quick helper to check if a specific security shift's masuk window is open.
 */
export function checkSecurityMasukWindow(
  option: SecurityShiftOption,
  workDateStr: string,
  now: Date = new Date(),
): WindowStatus {
  return checkAttendanceWindow('Security', 'masuk', option, workDateStr, now)
}

// ─────────────────────────────────────────────────────────────
// Time Validation & Normalization Helpers
// ─────────────────────────────────────────────────────────────
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidTimeString(t: unknown): boolean {
  return typeof t === 'string' && TIME_REGEX.test(t.trim())
}

/**
 * Normalizes any raw DB/API CS schedule object into a strictly-typed CSSchedule.
 * Handles old schemas (start/end), new 3-boundary (open/ontime_deadline/close),
 * legacy (windowEnd), partial missing fields, and null/undefined values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeCSSchedule(raw: any): CSSchedule {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CS_SCHEDULE }
  }

  const rawMasuk = raw.masuk && typeof raw.masuk === 'object' ? raw.masuk : {}
  const rawIstirahat = raw.istirahat && typeof raw.istirahat === 'object' ? raw.istirahat : {}
  const rawPulang = raw.pulang && typeof raw.pulang === 'object' ? raw.pulang : {}

  const open: string =
    isValidTimeString(rawMasuk.open)
      ? rawMasuk.open.trim()
      : isValidTimeString(rawMasuk.start)
        ? rawMasuk.start.trim()
        : DEFAULT_CS_SCHEDULE.masuk.open

  const ontime_deadline: string =
    isValidTimeString(rawMasuk.ontime_deadline)
      ? rawMasuk.ontime_deadline.trim()
      : isValidTimeString(rawMasuk.end)
        ? rawMasuk.end.trim()
        : isValidTimeString(rawMasuk.windowEnd)
          ? rawMasuk.windowEnd.trim()
          : DEFAULT_CS_SCHEDULE.masuk.ontime_deadline

  const close: string =
    isValidTimeString(rawMasuk.close)
      ? rawMasuk.close.trim()
      : DEFAULT_CS_SCHEDULE.masuk.close

  const istirahatStart: string =
    isValidTimeString(rawIstirahat.start)
      ? rawIstirahat.start.trim()
      : DEFAULT_CS_SCHEDULE.istirahat.start

  const istirahatEnd: string =
    isValidTimeString(rawIstirahat.end)
      ? rawIstirahat.end.trim()
      : isValidTimeString(rawIstirahat.windowEnd)
        ? rawIstirahat.windowEnd.trim()
        : DEFAULT_CS_SCHEDULE.istirahat.end

  const pulangStart: string =
    isValidTimeString(rawPulang.start)
      ? rawPulang.start.trim()
      : DEFAULT_CS_SCHEDULE.pulang.start

  const pulangEnd: string =
    isValidTimeString(rawPulang.end)
      ? rawPulang.end.trim()
      : isValidTimeString(rawPulang.windowEnd)
        ? rawPulang.windowEnd.trim()
        : DEFAULT_CS_SCHEDULE.pulang.end

  return {
    masuk: {
      open,
      ontime_deadline,
      close,
      start: open,
      end: ontime_deadline,
    },
    istirahat: {
      start: istirahatStart,
      end: istirahatEnd,
    },
    pulang: {
      start: pulangStart,
      end: pulangEnd,
    },
  }
}

/**
 * Validates that CS schedule has all required fields and chronological coherence:
 * open <= ontime_deadline <= close
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isCSScheduleValid(cs: any): boolean {
  if (!cs || typeof cs !== 'object' || !cs.masuk || !cs.istirahat || !cs.pulang) {
    return false
  }

  const { masuk, istirahat, pulang } = cs

  if (
    !isValidTimeString(masuk.open) ||
    !isValidTimeString(masuk.ontime_deadline) ||
    !isValidTimeString(masuk.close) ||
    !isValidTimeString(istirahat.start) ||
    !isValidTimeString(istirahat.end) ||
    !isValidTimeString(pulang.start) ||
    !isValidTimeString(pulang.end)
  ) {
    return false
  }

  const openM = getTimeInMinutes(masuk.open)
  const deadlineM = getTimeInMinutes(masuk.ontime_deadline)
  const closeM = getTimeInMinutes(masuk.close)

  if (openM > deadlineM || deadlineM > closeM) {
    return false
  }

  const istirahatStartM = getTimeInMinutes(istirahat.start)
  const istirahatEndM = getTimeInMinutes(istirahat.end)
  if (istirahatStartM >= istirahatEndM) {
    return false
  }

  const pulangStartM = getTimeInMinutes(pulang.start)
  const pulangEndM = getTimeInMinutes(pulang.end)
  if (pulangStartM >= pulangEndM) {
    return false
  }

  return true
}

/**
 * Normalizes any raw DB/API Security schedule object into a strictly-typed SecuritySchedule.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeSecuritySchedule(raw: any): SecuritySchedule {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SECURITY_SCHEDULE }
  }

  const tfMin =
    typeof raw.thursday_friday_shift_minutes === 'number' && !isNaN(raw.thursday_friday_shift_minutes)
      ? raw.thursday_friday_shift_minutes
      : DEFAULT_SECURITY_SCHEDULE.thursday_friday_shift_minutes

  const shifts: Record<ShiftType, ShiftSchedule> = {
    'Shift I': { ...DEFAULT_SECURITY_SCHEDULE.shifts['Shift I'] },
    'Shift II': { ...DEFAULT_SECURITY_SCHEDULE.shifts['Shift II'] },
    'Shift III': { ...DEFAULT_SECURITY_SCHEDULE.shifts['Shift III'] },
    'Shift 1': { ...DEFAULT_SECURITY_SCHEDULE.shifts['Shift I'] },
    'Shift 2': { ...DEFAULT_SECURITY_SCHEDULE.shifts['Shift II'] },
    'Shift 3': { ...DEFAULT_SECURITY_SCHEDULE.shifts['Shift III'] },
  }

  const rawShifts = raw.shifts && typeof raw.shifts === 'object' ? raw.shifts : {}
  for (const shiftName of ['Shift I', 'Shift II', 'Shift III'] as ShiftType[]) {
    const rs = rawShifts[shiftName]
    const def = DEFAULT_SECURITY_SCHEDULE.shifts[shiftName]
    if (rs && typeof rs === 'object') {
      const resolved: ShiftSchedule = {
        start: isValidTimeString(rs.start) ? rs.start.trim() : def.start,
        window_end: isValidTimeString(rs.window_end) ? rs.window_end.trim() : def.window_end,
        end: isValidTimeString(rs.end) ? rs.end.trim() : def.end,
        end_window_end: isValidTimeString(rs.end_window_end) ? rs.end_window_end.trim() : def.end_window_end,
        end_next_day: typeof rs.end_next_day === 'boolean' ? rs.end_next_day : def.end_next_day,
        end_window_end_next_day: typeof rs.end_window_end_next_day === 'boolean' ? rs.end_window_end_next_day : def.end_window_end_next_day,
      }
      shifts[shiftName] = resolved
      // Also sync numeric alias
      const numAlias = shiftName.replace('Shift I', 'Shift 1').replace('Shift II', 'Shift 2').replace('Shift III', 'Shift 3') as ShiftType
      if (numAlias !== shiftName) shifts[numAlias] = resolved
    }
  }

  return {
    thursday_friday_shift_minutes: tfMin,
    shifts,
  }
}

/**
 * Validates Security schedule structure for given shift or all shifts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSecurityScheduleValid(sec: any, shift?: ShiftType | null): boolean {
  if (!sec || typeof sec !== 'object' || !sec.shifts || typeof sec.shifts !== 'object') {
    return false
  }
  const shiftsToCheck: ShiftType[] = shift ? [shift] : ['Shift I', 'Shift II', 'Shift III']
  for (const s of shiftsToCheck) {
    const shiftData = sec.shifts[s]
    if (!shiftData || typeof shiftData !== 'object') return false
    if (!isValidTimeString(shiftData.start) || !isValidTimeString(shiftData.window_end) || !isValidTimeString(shiftData.end)) {
      return false
    }
  }
  return true
}

/**
 * Normalizes any raw DB/API Security weekend schedule object into a strictly-typed SecurityWeekendSchedule.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeSecurityWeekendSchedule(raw: any): SecurityWeekendSchedule {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SECURITY_WEEKEND_SCHEDULE }
  }

  const rawPagi = raw.sesi_pagi || raw.sesiPagi || {}
  const rawMalam = raw.sesi_malam || raw.sesiMalam || {}

  const pagiOpen = isValidTimeString(rawPagi.open) ? rawPagi.open.trim() : DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiPagi.open
  const pagiClose = isValidTimeString(rawPagi.close) ? rawPagi.close.trim() : DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiPagi.close
  const malamOpen = isValidTimeString(rawMalam.open) ? rawMalam.open.trim() : DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiMalam.open
  const malamClose = isValidTimeString(rawMalam.close) ? rawMalam.close.trim() : DEFAULT_SECURITY_WEEKEND_SCHEDULE.sesiMalam.close

  return {
    sesiPagi: { open: pagiOpen, close: pagiClose },
    sesiMalam: { open: malamOpen, close: malamClose },
  }
}

// ─────────────────────────────────────────────────────────────
// DB Settings Cache (module-level, refreshed on demand)
// ─────────────────────────────────────────────────────────────
let _csScheduleCache: CSSchedule | null = null
let _securityScheduleCache: SecuritySchedule | null = null
let _securityWeekendScheduleCache: SecurityWeekendSchedule | null = null
let _cacheLoadedAt = 0

async function loadScheduleCache(force = false): Promise<void> {
  const now = Date.now()
  if (!force && _cacheLoadedAt > 0 && now - _cacheLoadedAt < 60_000) return // 1 min cache

  try {
    const { data, error } = await supabase
      .from('attendance_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['cs_schedule', 'security_schedule', 'security_weekend_schedule'])

    if (error) {
      console.warn('Failed to load schedule from attendance_settings:', error.message)
    }

    if (data) {
      for (const row of data) {
        if (row.setting_key === 'cs_schedule') {
          _csScheduleCache = normalizeCSSchedule(row.setting_value)
        } else if (row.setting_key === 'security_schedule') {
          _securityScheduleCache = normalizeSecuritySchedule(row.setting_value)
        } else if (row.setting_key === 'security_weekend_schedule') {
          _securityWeekendScheduleCache = normalizeSecurityWeekendSchedule(row.setting_value)
        }
      }
    }
    _cacheLoadedAt = now
  } catch (err) {
    console.warn('Error loading schedule cache:', err)
  }
}

export async function getCSSchedule(): Promise<CSSchedule> {
  await loadScheduleCache()
  return _csScheduleCache ? normalizeCSSchedule(_csScheduleCache) : DEFAULT_CS_SCHEDULE
}

export async function getSecurityScheduleFromDB(): Promise<SecuritySchedule> {
  await loadScheduleCache()
  return _securityScheduleCache ? normalizeSecuritySchedule(_securityScheduleCache) : DEFAULT_SECURITY_SCHEDULE
}

export async function getSecurityWeekendScheduleFromDB(): Promise<SecurityWeekendSchedule> {
  await loadScheduleCache()
  return getSecurityWeekendScheduleSync()
}

export function invalidateScheduleCache(): void {
  _cacheLoadedAt = 0
  _csScheduleCache = null
  _securityScheduleCache = null
  _securityWeekendScheduleCache = null
}

// ─────────────────────────────────────────────────────────────
// Synchronous fallback (for components that can't await)
// ─────────────────────────────────────────────────────────────
export function getCSScheduleSync(): CSSchedule {
  return _csScheduleCache ? normalizeCSSchedule(_csScheduleCache) : DEFAULT_CS_SCHEDULE
}

export function getSecurityScheduleSync(): SecuritySchedule {
  return _securityScheduleCache ? normalizeSecuritySchedule(_securityScheduleCache) : DEFAULT_SECURITY_SCHEDULE
}

export function getSecurityWeekendScheduleSync(): SecurityWeekendSchedule {
  return _securityWeekendScheduleCache ? normalizeSecurityWeekendSchedule(_securityWeekendScheduleCache) : DEFAULT_SECURITY_WEEKEND_SCHEDULE
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
  shift: SecurityShiftOption | null,
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

  // Weekend sessions: only masuk info
  if (isWeekendSession(shift)) {
    const ws = getWeekendSessionSchedule(shift)
    if (attendanceType === 'masuk') {
      return {
        scheduledStart: ws.open,
        scheduledEnd: ws.close,
        isNextDay: false,
        dayType: 'normal',
      }
    }
    // pulang for weekend: no specific scheduled window
    return null
  }

  // Weekday shift (Shift I/II/III)
  const shiftKey = shift as ShiftType
  const date = parseISO(workDate)
  const sec = getSecurityScheduleSync()
  const base = sec.shifts[shiftKey] ?? DEFAULT_SECURITY_SCHEDULE.shifts[shiftKey]
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
  shift: SecurityShiftOption | null,
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
    const scheduledEnd = cs.masuk.ontime_deadline   // '08:00' — batas tepat_waktu

    const lateDeadline = parseTimeOnDate(scheduledEnd, workDate)
    const diffMs = recorded.getTime() - lateDeadline.getTime()
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

  // Weekend sessions: tepat_waktu if within [open, close], terlambat after close
  if (isWeekendSession(shift)) {
    const ws = getWeekendSessionSchedule(shift)
    const closeDate = parseTimeOnDate(ws.close, workDate)
    const diffMs = recorded.getTime() - closeDate.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin <= 0) {
      return { status: 'tepat_waktu', lateMinutes: 0, scheduledStart: ws.open, scheduledEnd: ws.close }
    }
    return { status: 'terlambat', lateMinutes: diffMin, scheduledStart: ws.open, scheduledEnd: ws.close }
  }

  // Weekday shift (Shift I/II/III)
  const shiftKey = shift as ShiftType
  const s = getSecuritySchedule(workDateStr, shiftKey)
  const startStr = s.start
  const endStr = s.window_end

  const windowEndDate = parseTimeOnDate(endStr, workDate)
  const diffMs = recorded.getTime() - windowEndDate.getTime()
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
  shift: SecurityShiftOption | null,
  workDateStr: string,
  now: Date,
): WindowStatus {
  const workDate = parseISO(workDateStr)
  const current = toZonedTime(now, TIMEZONE)

  if (category === 'CS') {
    const cs = getCSScheduleSync()
    if (attendanceType === 'masuk') {
      // masuk: 3-boundary system
      const openTime = parseTimeOnDate(cs.masuk.open, workDate)
      const closeTime = parseTimeOnDate(cs.masuk.close, workDate)
      if (current < openTime) return 'not_yet'
      if (current > closeTime) return 'closed'
      return 'open'  // open includes both tepat_waktu and terlambat zones
    }
    // istirahat / pulang: simple start/end window
    const s = attendanceType === 'istirahat' ? cs.istirahat : cs.pulang
    const start = parseTimeOnDate(s.start, workDate)
    const end = parseTimeOnDate(s.end, workDate)
    if (current < start) return 'not_yet'
    if (current <= end) return 'open'
    return 'closed_accept'
  }

  // Security
  if (!shift) return 'not_yet'

  // Weekend sessions
  if (isWeekendSession(shift)) {
    const ws = getWeekendSessionSchedule(shift)
    if (attendanceType === 'masuk') {
      const openTime = parseTimeOnDate(ws.open, workDate)
      const closeTime = parseTimeOnDate(ws.close, workDate)
      if (current < openTime) return 'not_yet'
      if (current <= closeTime) return 'open'
      return 'closed'
    }

    // Weekend pulang: Sesi Pagi ends at 20:00 (same day), Sesi Malam ends at 08:00 (H+1)
    if (shift === 'Sesi Pagi') {
      const pulangStart = parseTimeOnDate('20:00', workDate, false)
      if (current < pulangStart) return 'not_yet'
      return 'open'
    }

    if (shift === 'Sesi Malam') {
      const pulangStart = parseTimeOnDate('08:00', workDate, true) // H+1
      if (current < pulangStart) return 'not_yet'
      return 'open'
    }

    return 'open'
  }

  // Weekday shifts (Shift I/II/III)
  const shiftKey = shift as ShiftType
  const s = getSecuritySchedule(workDateStr, shiftKey)

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
  shift: SecurityShiftOption | null,
  workDateStr: string,
  now: Date = new Date(),
): NextAttendanceInfo | null {
  const hasMasuk = completedTypes.includes('masuk')
  const hasIstirahat = completedTypes.includes('istirahat')
  const hasPulang = completedTypes.includes('pulang')

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

  // Weekend sessions
  if (isWeekendSession(shift)) {
    const ws = getWeekendSessionSchedule(shift)
    if (!hasMasuk) {
      return { type: 'masuk', label: 'Presensi Masuk', startTime: ws.open }
    }
    return { type: 'pulang', label: 'Presensi Pulang', startTime: ws.close }
  }

  // Weekday shifts
  const shiftKey = shift as ShiftType
  const s = getSecuritySchedule(workDateStr, shiftKey)

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
    openTime?: string
    deadlineTime?: string
    closeTime?: string
  }
  | {
    status: 'can_masuk'
    title: string
    startTime: string
    endTime: string
    isLate: boolean  // true jika saat ini sudah melewati ontime_deadline
    openTime?: string
    deadlineTime?: string
    closeTime?: string
  }
  | {
    status: 'window_closed'  // jendela presensi masuk sudah ditutup
    title: string
    message: string
    openTime?: string
    deadlineTime?: string
    closeTime?: string
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
  shift: SecurityShiftOption | null,
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
    const masukOpenMins = getTimeInMinutes(cs.masuk.open)
    const masukDeadlineMins = getTimeInMinutes(cs.masuk.ontime_deadline)
    const masukCloseMins = getTimeInMinutes(cs.masuk.close)
    const istirahatStartMins = getTimeInMinutes(cs.istirahat.start)
    const istirahatEndMins = getTimeInMinutes(cs.istirahat.end)
    const pulangStartMins = getTimeInMinutes(cs.pulang.start)

    // A. Before Check-In
    if (!completedRecords.masuk) {
      // Workday check: CS operates Monday - Friday (days 1 to 5)
      const isWorkday = dayOfWeek >= 1 && dayOfWeek <= 5
      if (!isWorkday) {
        return {
          status: 'workday_holiday',
          title: 'Hari Libur (Bukan Hari Kerja CS)',
          message: 'Layanan Cleaning Service beroperasi hari Senin sampai Jumat. Presensi tidak aktif di akhir pekan.',
        }
      }

      // Sebelum jendela dibuka
      if (currentMinutes < masukOpenMins) {
        return {
          status: 'waiting_masuk',
          title: `Presensi Masuk Dibuka Pukul ${cs.masuk.open.replace(':', '.')} WIB`,
          startTime: cs.masuk.open,
          openTime: cs.masuk.open,
          deadlineTime: cs.masuk.ontime_deadline,
          closeTime: cs.masuk.close,
          message: `Waktu check-in belum dimulai. Tombol akan aktif otomatis pukul ${cs.masuk.open.replace(':', '.')} WIB.`,
        }
      }

      // Setelah jendela ditutup
      if (currentMinutes > masukCloseMins) {
        return {
          status: 'window_closed',
          title: 'Jendela Presensi Masuk Ditutup',
          openTime: cs.masuk.open,
          deadlineTime: cs.masuk.ontime_deadline,
          closeTime: cs.masuk.close,
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
        openTime: cs.masuk.open,
        deadlineTime: cs.masuk.ontime_deadline,
        closeTime: cs.masuk.close,
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

  // Weekend sessions (Sesi Pagi / Sesi Malam)
  if (shift && isWeekendSession(shift)) {
    const ws = getWeekendSessionSchedule(shift)
    const openMins = getTimeInMinutes(ws.open)
    const closeMins = getTimeInMinutes(ws.close)
    const sessionLabel = shift === 'Sesi Pagi' ? 'Pagi' : 'Malam'

    if (!completedRecords.masuk) {
      if (currentMinutes < openMins) {
        return {
          status: 'waiting_masuk',
          title: `Presensi Masuk Sesi ${sessionLabel} Dibuka Pukul ${ws.open.replace(':', '.')} WIB`,
          startTime: ws.open,
          message: `Sesi ${sessionLabel} akhir pekan belum dibuka. Tombol aktif pukul ${ws.open.replace(':', '.')} WIB.`,
        }
      }
      if (currentMinutes > closeMins) {
        return {
          status: 'window_closed',
          title: `Jendela Presensi Sesi ${sessionLabel} Ditutup`,
          message: `Waktu presensi masuk sesi ${sessionLabel.toLowerCase()} telah berakhir pukul ${ws.close.replace(':', '.')} WIB.`,
        }
      }
      return {
        status: 'can_masuk',
        title: `Absen Masuk — Sesi ${sessionLabel}`,
        startTime: ws.open,
        endTime: ws.close,
        isLate: false,
      }
    }

    // After masuk on weekend: check pulang
    const todayJakartaStr = formatInTimeZone(jakartaNow, TIMEZONE, 'yyyy-MM-dd')
    const masukWorkDate = completedRecords.masuk.work_date || workDateStr
    const isNextDay = todayJakartaStr > masukWorkDate

    if (shift === 'Sesi Pagi') {
      const pulangMins = 20 * 60 // 20:00 WIB
      if (!isNextDay && currentMinutes < pulangMins) {
        return {
          status: 'waiting_pulang',
          title: 'Presensi berikutnya: Pulang pukul 20.00 WIB',
          startTime: '20:00',
          message: 'Check-in Sesi Pagi tercatat. Tombol presensi pulang akan aktif pukul 20.00 WIB.',
        }
      }
      return {
        status: 'can_pulang',
        title: 'Ambil Foto & Absen Pulang',
        startTime: '20:00',
      }
    } else {
      // Sesi Malam: 20:00 - 08:00 (H+1)
      const pulangMins = 8 * 60 // 08:00 WIB
      if (!isNextDay) {
        return {
          status: 'waiting_pulang',
          title: 'Presensi berikutnya: Pulang pukul 08.00 WIB (H+1)',
          startTime: '08:00',
          note: '(H+1)',
          message: 'Check-in Sesi Malam tercatat. Tombol presensi pulang akan aktif besok pagi pukul 08.00 WIB.',
        }
      }
      if (currentMinutes < pulangMins) {
        return {
          status: 'waiting_pulang',
          title: 'Presensi berikutnya: Pulang pukul 08.00 WIB',
          startTime: '08:00',
          message: 'Tombol presensi pulang Sesi Malam akan aktif pukul 08.00 WIB.',
        }
      }
      return {
        status: 'can_pulang',
        title: 'Ambil Foto & Absen Pulang',
        startTime: '08:00',
      }
    }
  }

  // Weekday shifts (Shift I/II/III)
  const currentShift = (shift as ShiftType) || 'Shift I'
  const s = getSecuritySchedule(workDateStr, currentShift)
  const masukStartMins = getTimeInMinutes(s.start)
  const masukWindowEndMins = getTimeInMinutes(s.window_end)
  const pulangStartMins = getTimeInMinutes(s.end)
  const note = s.end_next_day ? '(H+1)' : undefined

  // A. Before Check-In (Strict for Shift I, Shift II, and Shift III)
  if (!completedRecords.masuk) {
    if (currentMinutes < masukStartMins) {
      return {
        status: 'waiting_masuk',
        title: `Presensi Masuk Dibuka Pukul ${s.start.replace(':', '.')} WIB`,
        startTime: s.start,
        message: `Waktu check-in ${currentShift} belum dimulai. Tombol akan aktif pukul ${s.start.replace(':', '.')} WIB.`,
      }
    }

    const isLate = currentMinutes > masukWindowEndMins
    return {
      status: 'can_masuk',
      title: isLate ? 'Absen Masuk (Terlambat)' : 'Ambil Foto & Absen Masuk',
      startTime: s.start,
      endTime: s.window_end,
      isLate,
    }
  }

  // B. After Check-In, Haven't Checked Out
  const todayJakartaStr = formatInTimeZone(jakartaNow, TIMEZONE, 'yyyy-MM-dd')
  const masukWorkDate = completedRecords.masuk.work_date || workDateStr
  const isNextDay = todayJakartaStr > masukWorkDate

  if (s.end_next_day) {
    // Overnight shift (Shift III)
    if (!isNextDay) {
      return {
        status: 'waiting_pulang',
        title: `Presensi berikutnya: Pulang pukul ${s.end.replace(':', '.')} WIB (H+1)`,
        startTime: s.end,
        note: '(H+1)',
        message: `Check-in ${currentShift} tercatat. Tombol presensi pulang akan aktif besok pagi pukul ${s.end.replace(':', '.')} WIB.`,
      }
    }

    if (currentMinutes < pulangStartMins) {
      return {
        status: 'waiting_pulang',
        title: `Presensi berikutnya: Pulang pukul ${s.end.replace(':', '.')} WIB`,
        startTime: s.end,
        message: `Tombol presensi pulang ${currentShift} akan aktif pukul ${s.end.replace(':', '.')} WIB.`,
      }
    }

    return {
      status: 'can_pulang',
      title: 'Ambil Foto & Absen Pulang',
      startTime: s.end,
      note: undefined,
    }
  }

  // Shift I & II (same day shifts)
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

// ─────────────────────────────────────────────────────────────
// 30-Day Attendance Recap Calculation Engine
// ─────────────────────────────────────────────────────────────
export interface RecapDayStats {
  hadir: number      // Total unique workdays present (distinct work_date)
  terlambat: number  // Total unique workdays late (distinct work_date)
  tidakHadir: number // Total unique scheduled workdays absent (jatuh tempo without attendance)
}

export interface RecapMasukRecord {
  work_date: string
  attendance_type: string
  attendance_status?: string
}

/**
 * Authoritative 30-day attendance recap calculator for SIPATEN.
 *
 * Rules:
 * 1. Counts WORKDAYS (unique work_date), never raw rows, preventing duplicate counting.
 * 2. Only counts scheduled workdays that have ELAPSED (jatuh tempo):
 *    - CS: Mon–Fri only (Sat & Sun excluded).
 *    - Security: Mon–Sat only (Sun excluded).
 * 3. Today is NOT counted as absent unless the check-in window has officially closed today
 *    and the employee did not check in.
 * 4. Future days are NEVER counted as absent.
 * 5. Days before the employee's join date (created_at) are NEVER counted as absent.
 * 6. If the employee has NO attendance history and NO join date within the window,
 *    returns 0/0/0 (avoids fabricating 22 absences for uninitialized/demo accounts).
 */
export function calculate30DayRecap(
  category: 'CS' | 'Security',
  masukRecords: RecapMasukRecord[],
  joinDateStr?: string | null,
  now: Date = new Date(),
  _shift?: SecurityShiftOption | null,
): RecapDayStats {
  void _shift

  // Deduplicate records by work_date:
  const hadirDates = new Set<string>()
  const terlambatDates = new Set<string>()

  for (const r of masukRecords) {
    if (r.work_date && r.attendance_type === 'masuk') {
      hadirDates.add(r.work_date)
      if (r.attendance_status === 'terlambat') {
        terlambatDates.add(r.work_date)
      }
    }
  }

  const totalHadir = hadirDates.size
  const totalLate = terlambatDates.size

  // 30 days ago in Jakarta timezone
  const past30StartDate = new Date(now)
  past30StartDate.setDate(past30StartDate.getDate() - 30)
  const past30DaysStr = past30StartDate.toLocaleDateString('en-CA', { timeZone: TIMEZONE })

  // Rule 6: If employee has no attendance records and no join date (or join date outside window),
  // do NOT fabricate absences for an unrecorded past period.
  if (masukRecords.length === 0 && (!joinDateStr || joinDateStr < past30DaysStr)) {
    return { hadir: 0, terlambat: 0, tidakHadir: 0 }
  }

  const elapsedScheduledDays: string[] = []

  // Iterate backwards from yesterday (i=1) to 30 days ago (i=30)
  for (let i = 1; i <= 30; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const dStr = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE })

    // Rule: Skip days before employee joined
    if (joinDateStr && dStr < joinDateStr) continue
    // Rule: Skip days outside the 30-day window
    if (dStr < past30DaysStr) continue

    const dow = d.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'short' })
    const isScheduledWorkday = category === 'CS'
      ? (dow !== 'Sat' && dow !== 'Sun')
      : (dow !== 'Sun')

    if (isScheduledWorkday) {
      elapsedScheduledDays.push(dStr)
    }
  }

  // Today (i=0):
  // Today is the active/current day.
  // Per Ketentuan 4 ("Jangan menghitung tanggal mendatang atau hari kerja yang jadwalnya belum dimulai sebagai absen"),
  // hari ini tidak dihitung sebagai absen pada rekap 30 hari.
  // Kehadiran hari ini (jika sudah presensi masuk) tetap tercatat pada totalHadir.

  // Absences = scheduled elapsed days without attendance
  let absentCount = 0
  for (const dateStr of elapsedScheduledDays) {
    if (!hadirDates.has(dateStr)) {
      absentCount++
    }
  }

  return {
    hadir: totalHadir,
    terlambat: totalLate,
    tidakHadir: absentCount,
  }
}

// ─────────────────────────────────────────────────────────────
// Security Operational 30-Day Recap & Shift Session Builder
// Spec:
// 1. Shift Selesai: Shifts with both check-in (masuk) and check-out (pulang)
// 2. Keterlambatan Masuk: Check-ins marked 'terlambat'
// 3. Pulang Belum Lengkap: Past shifts with check-in but no check-out
// 4. Total Catatan Absensi: Total attendance records logged
// 5. Shift III overnight crossover correctly paired (Day N masuk + Day N+1 pulang)
// ─────────────────────────────────────────────────────────────

export interface SecurityRecapRecord {
  id?: string
  work_date: string
  attendance_type: 'masuk' | 'istirahat' | 'pulang' | string
  attendance_status?: 'tepat_waktu' | 'terlambat' | string
  shift?: SecurityShiftOption | string | null
  recorded_at?: string
  auth_uid?: string
  employee_profile_id?: string
  normalized_name?: string
  category?: string
  employee_name?: string
}

export interface Security30DayRecap {
  shiftSelesai: number
  keterlambatan: number
  pulangBelumLengkap: number
  totalCatatan: number
  totalShifts: number
}

export interface SecurityShiftSession {
  id: string
  work_date: string
  shift: SecurityShiftOption
  isOvernight: boolean
  masuk: SecurityRecapRecord | null
  pulang: SecurityRecapRecord | null
  status: 'selesai' | 'sedang_bertugas' | 'menunggu_pulang' | 'tidak_lengkap'
  isLate: boolean
  masukTime: string
  pulangTime: string
  masukRecordId?: string
  pulangRecordId?: string
}

export function calculateSecurity30DayRecap(
  records: SecurityRecapRecord[],
  todayStr: string,
  yesterdayStr: string,
  now: Date = new Date(),
): Security30DayRecap {
  const groupMap = new Map<string, { masuk: SecurityRecapRecord | null; pulang: SecurityRecapRecord | null; work_date: string; shift: SecurityShiftOption }>()

  for (const r of records) {
    if (r.attendance_type !== 'masuk' && r.attendance_type !== 'pulang') continue
    const shift = (r.shift as SecurityShiftOption) || 'Shift I'
    const key = `${r.work_date}___${shift}`
    if (!groupMap.has(key)) {
      groupMap.set(key, { masuk: null, pulang: null, work_date: r.work_date, shift })
    }
    const grp = groupMap.get(key)!
    if (r.attendance_type === 'masuk') {
      grp.masuk = r
    } else if (r.attendance_type === 'pulang') {
      grp.pulang = r
    }
  }

  let shiftSelesai = 0
  let keterlambatan = 0
  let pulangBelumLengkap = 0

  // Current Jakarta hour to evaluate overnight Shift III handover
  const currentJakartaHour = toZonedTime(now, TIMEZONE).getHours()

  for (const grp of groupMap.values()) {
    const hasMasuk = grp.masuk !== null
    const hasPulang = grp.pulang !== null

    if (hasMasuk && grp.masuk!.attendance_status === 'terlambat') {
      keterlambatan++
    }

    if (hasMasuk && hasPulang) {
      shiftSelesai++
    } else if (hasMasuk && !hasPulang) {
      const isOvernight = grp.shift === 'Shift III' || grp.shift === 'Shift 3' || grp.shift === 'Sesi Malam'
      const isTodayShift = grp.work_date === todayStr
      const isYesterdayShift = grp.work_date === yesterdayStr

      if (isTodayShift) {
        // Today's shift: guard is currently on duty or in shift window.
        // Never penalize ongoing shift today as an incomplete past shift.
      } else if (isYesterdayShift && isOvernight) {
        // Shift III from yesterday evening: handover/checkout is this morning (07.00 - 07.30 WIB).
        // If current hour is morning (< 11:00 WIB), guard is on duty or about to check out.
        // If current hour >= 11:00 WIB and still no checkout, count as incomplete.
        if (currentJakartaHour >= 11) {
          pulangBelumLengkap++
        }
      } else {
        // Any other past shift without checkout
        pulangBelumLengkap++
      }
    }
  }

  const validRecords = records.filter(r => r.attendance_type === 'masuk' || r.attendance_type === 'pulang')

  return {
    shiftSelesai,
    keterlambatan,
    pulangBelumLengkap,
    totalCatatan: validRecords.length,
    totalShifts: groupMap.size,
  }
}

export function buildSecurityShiftSessions(
  records: SecurityRecapRecord[],
  todayStr: string,
  yesterdayStr: string,
  now: Date = new Date(),
): SecurityShiftSession[] {
  const groupMap = new Map<string, { masuk: SecurityRecapRecord | null; pulang: SecurityRecapRecord | null; work_date: string; shift: SecurityShiftOption }>()

  for (const r of records) {
    if (r.attendance_type !== 'masuk' && r.attendance_type !== 'pulang') continue
    const shift = (r.shift as SecurityShiftOption) || 'Shift I'
    const key = `${r.work_date}___${shift}`
    if (!groupMap.has(key)) {
      groupMap.set(key, { masuk: null, pulang: null, work_date: r.work_date, shift })
    }
    const grp = groupMap.get(key)!
    if (r.attendance_type === 'masuk') {
      grp.masuk = r
    } else if (r.attendance_type === 'pulang') {
      grp.pulang = r
    }
  }

  const sessions: SecurityShiftSession[] = []

  for (const [key, grp] of groupMap.entries()) {
    const isOvernight = grp.shift === 'Shift III' || grp.shift === 'Shift 3' || grp.shift === 'Sesi Malam'
    const hasMasuk = grp.masuk !== null
    const hasPulang = grp.pulang !== null

    const isTodayShift = grp.work_date === todayStr
    const isOvernightActive = isOvernight && grp.work_date === yesterdayStr

    let status: SecurityShiftSession['status'] = 'selesai'

    if (hasMasuk && hasPulang) {
      status = 'selesai'
    } else if (hasMasuk && !hasPulang) {
      if (isTodayShift || isOvernightActive) {
        const win = checkAttendanceWindow('Security', 'pulang', grp.shift, grp.work_date, now)
        if (win === 'open') {
          status = 'menunggu_pulang'
        } else {
          status = 'sedang_bertugas'
        }
      } else {
        status = 'tidak_lengkap'
      }
    } else if (!hasMasuk && hasPulang) {
      status = 'selesai'
    }

    const masukTime = grp.masuk?.recorded_at ? formatJakartaTime(new Date(grp.masuk.recorded_at)) : '--:--'
    let pulangTime = '--:--'
    if (grp.pulang?.recorded_at) {
      const pt = formatJakartaTime(new Date(grp.pulang.recorded_at))
      pulangTime = isOvernight ? `${pt} (H+1)` : pt
    }

    sessions.push({
      id: key,
      work_date: grp.work_date,
      shift: grp.shift,
      isOvernight,
      masuk: grp.masuk,
      pulang: grp.pulang,
      status,
      isLate: grp.masuk?.attendance_status === 'terlambat',
      masukTime,
      pulangTime,
      masukRecordId: grp.masuk?.id,
      pulangRecordId: grp.pulang?.id,
    })
  }

  // Sort sessions descending by work_date (newest first), then by shift order
  sessions.sort((a, b) => {
    if (a.work_date !== b.work_date) {
      return b.work_date.localeCompare(a.work_date)
    }
    return b.shift.localeCompare(a.shift)
  })

  return sessions
}

// ─────────────────────────────────────────────────────────────
// Jakarta Weekly Calendar & CS Attendance Calculation
// ─────────────────────────────────────────────────────────────
export interface WeekDayCount {
  day: string
  label: string
  count: number
  dateStr: string
}

/**
 * Returns the 7 days of the current week (Senin to Minggu)
 * in Asia/Jakarta timezone, strictly formatted as YYYY-MM-DD.
 */
export function getJakartaWeekDays(refDate: Date = new Date()): WeekDayCount[] {
  const todayStr = refDate.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
  const [y, m, d] = todayStr.split('-').map(Number)

  // Use noon UTC to prevent any DST or midnight shift
  const jktNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const dayOfWeek = jktNoon.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat

  // Monday as start of week: diffToMonday = (dayOfWeek + 6) % 7
  const diffToMonday = (dayOfWeek + 6) % 7
  const monday = new Date(jktNoon)
  monday.setUTCDate(jktNoon.getUTCDate() - diffToMonday)

  const dayLabels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
  const weekDays: WeekDayCount[] = []

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(monday)
    dayDate.setUTCDate(monday.getUTCDate() + i)
    const yStr = dayDate.getUTCFullYear()
    const mStr = String(dayDate.getUTCMonth() + 1).padStart(2, '0')
    const dStr = String(dayDate.getUTCDate()).padStart(2, '0')

    weekDays.push({
      day: dayLabels[i],
      label: dayLabels[i],
      count: 0,
      dateStr: `${yStr}-${mStr}-${dStr}`,
    })
  }

  return weekDays
}

/**
 * Calculates CS weekly attendance from raw attendance records.
 * Ensures:
 * - Only valid 'masuk' records count toward attendance.
 * - Deduplicates by work_date (no double counting if multiple entries exist on the same date).
 * - Preserves exact order and metadata for Monday through Sunday.
 */
export function calculateCSWeeklyAttendance(
  weekDays: WeekDayCount[],
  records: { work_date: string; attendance_type?: string }[],
): WeekDayCount[] {
  const attendedDates = new Set<string>()

  for (const r of records) {
    if (r.work_date && (!r.attendance_type || r.attendance_type.toLowerCase().trim() === 'masuk')) {
      attendedDates.add(r.work_date)
    }
  }

  return weekDays.map(w => ({
    ...w,
    count: attendedDates.has(w.dateStr) ? 1 : 0,
  }))
}

