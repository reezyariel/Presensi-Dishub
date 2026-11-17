// ============================================================
// SIPATEN — Operational Status & Monitoring Utility
// Pure logic for deriving operational status for CS & Security
// Admin Monitoring & Employee Personal Dashboard
// ============================================================

import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import type { AttendanceRecord, EmployeeRole, SecurityShiftOption } from '../types/attendance'
import {
  todayJakarta,
  formatJakartaTime,
  getCSScheduleSync,
  getSecurityShiftDisplayLabel,
  isOvernightSecurityShift,
  getSecurityShiftItem,
} from './scheduleEngine'
import { getPreviousCalendarDate } from './securityDateDisplay'

const TIMEZONE = 'Asia/Jakarta'

export type OperationalStatusType =
  | 'sedang_bertugas'
  | 'belum_bertugas'
  | 'menunggu_jadwal'
  | 'tugas_selesai'
  | 'perlu_perhatian'

export interface OperationalStatusMeta {
  key: OperationalStatusType
  label: string
  description: string
  isPulsing: boolean
}

export const OPERATIONAL_STATUS_CONFIG: Record<OperationalStatusType, OperationalStatusMeta> = {
  sedang_bertugas: {
    key: 'sedang_bertugas',
    label: 'Sedang Bertugas',
    description: 'Pegawai telah check-in dan dinas operasional sedang berlangsung.',
    isPulsing: true,
  },
  belum_bertugas: {
    key: 'belum_bertugas',
    label: 'Belum Bertugas',
    description: 'Jadwal presensi telah dibuka tetapi pegawai belum melakukan check-in.',
    isPulsing: false,
  },
  menunggu_jadwal: {
    key: 'menunggu_jadwal',
    label: 'Menunggu Jadwal',
    description: 'Jadwal dinas atau jendela presensi belum dibuka.',
    isPulsing: false,
  },
  tugas_selesai: {
    key: 'tugas_selesai',
    label: 'Tugas Selesai',
    description: 'Presensi masuk dan pulang telah lengkap terselesaikan.',
    isPulsing: false,
  },
  perlu_perhatian: {
    key: 'perlu_perhatian',
    label: 'Perlu Perhatian',
    description: 'Terdapat catatan presensi yang belum lengkap atau membutuhkan tindak lanjut.',
    isPulsing: false,
  },
}

export interface EmployeeMonitoringItem {
  employeeId: string
  employeeName: string
  employeeCode?: string
  category: 'CS' | 'Security'
  shift?: string | null
  workDate: string
  checkInTime: string | null
  checkInDate?: string | null
  checkOutTime: string | null
  checkOutDate?: string | null
  isCheckoutNextDay: boolean
  operationalStatus: OperationalStatusType
  reviewStatus?: string
  lateMinutes?: number
  avatarUrl?: string | null
  authUid?: string | null
}

export interface DivisionOperationalSummary {
  sedangBertugas: number
  belumCheckIn: number
  tugasSelesai: number
  total: number
}

/**
 * Resolves whether the current time in Jakarta is before a given 'HH:mm' time string.
 */
function isBeforeTime(currentTime: Date, targetTimeStr: string): boolean {
  const currentStr = formatInTimeZone(currentTime, TIMEZONE, 'HH:mm')
  return currentStr < targetTimeStr
}

/**
 * Derives operational status for a CS employee based on actual attendance records and schedule.
 */
export function deriveCSOperationalStatus(
  masukRecord: AttendanceRecord | null,
  pulangRecord: AttendanceRecord | null,
  currentTime: Date = new Date(),
  reviewStatus?: string,
): OperationalStatusType {
  // If flagged with perlu_tindak_lanjut
  if (
    reviewStatus === 'perlu_tindak_lanjut' ||
    masukRecord?.review_status === 'perlu_tindak_lanjut' ||
    pulangRecord?.review_status === 'perlu_tindak_lanjut'
  ) {
    return 'perlu_perhatian'
  }

  // If both masuk and pulang exist -> Tugas Selesai
  if (masukRecord && pulangRecord) {
    return 'tugas_selesai'
  }

  // If masuk exists and no pulang -> Sedang Bertugas
  if (masukRecord && !pulangRecord) {
    return 'sedang_bertugas'
  }

  // If no check-in yet, check if CS schedule has opened
  let openTime = '06:00'
  try {
    const csSched = getCSScheduleSync()
    if (csSched?.masuk?.open) {
      openTime = csSched.masuk.open
    }
  } catch {
    openTime = '06:00'
  }

  if (isBeforeTime(currentTime, openTime)) {
    return 'menunggu_jadwal'
  }

  return 'belum_bertugas'
}

/**
 * Derives operational status for a Security employee based on actual attendance records and schedule.
 */
export function deriveSecurityOperationalStatus(
  masukRecord: AttendanceRecord | null,
  pulangRecord: AttendanceRecord | null,
  scheduledShift: SecurityShiftOption | null = null,
  workDateStr: string = todayJakarta(),
  currentTime: Date = new Date(),
  reviewStatus?: string,
): OperationalStatusType {
  // If flagged with perlu_tindak_lanjut
  if (
    reviewStatus === 'perlu_tindak_lanjut' ||
    masukRecord?.review_status === 'perlu_tindak_lanjut' ||
    pulangRecord?.review_status === 'perlu_tindak_lanjut'
  ) {
    return 'perlu_perhatian'
  }

  // If both masuk and pulang exist -> Tugas Selesai
  if (masukRecord && pulangRecord) {
    return 'tugas_selesai'
  }

  // If active masuk exists and no pulang -> Sedang Bertugas
  if (masukRecord && !pulangRecord) {
    return 'sedang_bertugas'
  }

  // If no check-in yet, check shift schedule if available
  const effectiveShift = (masukRecord?.shift as SecurityShiftOption) || scheduledShift
  if (effectiveShift) {
    try {
      const shiftItem = getSecurityShiftItem(workDateStr, effectiveShift)
      if (shiftItem?.in_start && isBeforeTime(currentTime, shiftItem.in_start)) {
        return 'menunggu_jadwal'
      }
    } catch {
      // Fallback
    }
  } else {
    // Generic morning boundary (07:00) if no shift selected
    if (isBeforeTime(currentTime, '07:00')) {
      return 'menunggu_jadwal'
    }
  }

  return 'belum_bertugas'
}

/**
 * Calculates full operational status and division summaries for Admin Dashboard.
 * Guarantees zero duplicate counting of any employee.
 *
 * @param activeEmployees - List of active employee profiles from DB
 * @param todayRecords    - Attendance records for today
 * @param yesterdayH1Records - Pulang/masuk records from yesterday (for overnight crossover)
 * @param currentTime     - Current effective date/time
 */
export function calculateAdminOperationalMonitoring(
  activeEmployees: Array<{
    id: string
    full_name: string
    normalized_name?: string
    employee_code?: string
    role?: EmployeeRole | string
    employee_role?: EmployeeRole | string
    default_shift?: string | null
    avatar_url?: string | null
    auth_uid?: string | null
  }>,
  todayRecords: AttendanceRecord[],
  yesterdayH1Records: AttendanceRecord[] = [],
  currentTime: Date = new Date(),
): {
  csSummary: DivisionOperationalSummary
  securitySummary: DivisionOperationalSummary
  items: EmployeeMonitoringItem[]
} {
  const today = todayJakarta()
  const yesterday = getPreviousCalendarDate(today)

  const csItems: EmployeeMonitoringItem[] = []
  const secItems: EmployeeMonitoringItem[] = []

  let csBertugas = 0
  let csBelum = 0
  let csSelesai = 0

  let secBertugas = 0
  let secBelum = 0
  let secSelesai = 0

  for (const emp of activeEmployees) {
    const rawRole = (emp.role || emp.employee_role || '').toString().toUpperCase()
    const isSecurity = rawRole === 'SECURITY'
    const category: 'CS' | 'Security' = isSecurity ? 'Security' : 'CS'

    const normName = emp.normalized_name || emp.full_name.toLowerCase().trim()

    // Find today's records for this employee
    const empTodayRecs = todayRecords.filter(r => {
      if (r.auth_uid && emp.auth_uid && r.auth_uid === emp.auth_uid) return true
      if (r.employee_profile_id && r.employee_profile_id === emp.id) return true
      return (
        r.category === category &&
        (r.normalized_name === normName || r.employee_name?.toLowerCase().trim() === normName)
      )
    })

    if (!isSecurity) {
      // ─── Cleaning Service (CS) ─────────────────────────────────
      const masuk = empTodayRecs.find(r => r.attendance_type === 'masuk') || null
      const pulang = empTodayRecs.find(r => r.attendance_type === 'pulang') || null

      const opStatus = deriveCSOperationalStatus(masuk, pulang, currentTime)

      if (opStatus === 'sedang_bertugas') {
        csBertugas++
      } else if (opStatus === 'tugas_selesai') {
        csSelesai++
      } else {
        // belum_bertugas or menunggu_jadwal or perlu_perhatian without check-in
        csBelum++
      }

      csItems.push({
        employeeId: emp.id,
        employeeName: emp.full_name,
        employeeCode: emp.employee_code,
        category: 'CS',
        shift: 'Reguler (06.00 – 16.00)',
        workDate: today,
        checkInTime: masuk?.recorded_at ? formatJakartaTime(masuk.recorded_at) : null,
        checkInDate: masuk?.recorded_at
          ? formatInTimeZone(parseISO(masuk.recorded_at), TIMEZONE, 'dd MMM yyyy')
          : null,
        checkOutTime: pulang?.recorded_at ? formatJakartaTime(pulang.recorded_at) : null,
        checkOutDate: pulang?.recorded_at
          ? formatInTimeZone(parseISO(pulang.recorded_at), TIMEZONE, 'dd MMM yyyy')
          : null,
        isCheckoutNextDay: false,
        operationalStatus: opStatus,
        reviewStatus: masuk?.review_status || pulang?.review_status,
        lateMinutes: masuk?.late_minutes || 0,
        avatarUrl: emp.avatar_url,
        authUid: emp.auth_uid,
      })
    } else {
      // ─── Security ──────────────────────────────────────────────
      // Also look for unclosed overnight check-in from yesterday
      const empYestRecs = yesterdayH1Records.filter(r => {
        if (r.auth_uid && emp.auth_uid && r.auth_uid === emp.auth_uid) return true
        if (r.employee_profile_id && r.employee_profile_id === emp.id) return true
        return (
          r.category === 'Security' &&
          (r.normalized_name === normName || r.employee_name?.toLowerCase().trim() === normName)
        )
      })

      const yestMasukList = empYestRecs.filter(r => r.attendance_type === 'masuk')
      const yestPulangList = empYestRecs.filter(r => r.attendance_type === 'pulang')
      const todayMasukList = empTodayRecs.filter(r => r.attendance_type === 'masuk')
      const todayPulangList = empTodayRecs.filter(r => r.attendance_type === 'pulang')

      // Check if yesterday had an unclosed overnight shift
      const unclosedYestOvernight = yestMasukList.find(m => {
        if (!isOvernightSecurityShift(yesterday, m.shift)) return false
        const hasPulang =
          yestPulangList.some(p => p.check_in_record_id === m.id || p.work_date === yesterday) ||
          todayPulangList.some(p => p.check_in_record_id === m.id || p.work_date === yesterday)
        return !hasPulang
      })

      // Check if yesterday overnight was closed today
      const completedYestOvernightMasuk = yestMasukList.find(m => {
        if (!isOvernightSecurityShift(yesterday, m.shift)) return false
        return (
          yestPulangList.some(p => p.check_in_record_id === m.id || p.work_date === yesterday) ||
          todayPulangList.some(p => p.check_in_record_id === m.id || p.work_date === yesterday)
        )
      })

      let activeMasuk: AttendanceRecord | null = null
      let activePulang: AttendanceRecord | null = null
      let activeWorkDate = today
      let isNextDay = false

      if (unclosedYestOvernight) {
        // Officer is currently on active overnight duty from yesterday
        activeMasuk = unclosedYestOvernight
        activePulang = null
        activeWorkDate = yesterday
      } else if (todayMasukList.length > 0) {
        // Today has check-in
        const todayMasuk = todayMasukList[todayMasukList.length - 1]
        const todayPulang =
          todayPulangList.find(p => p.check_in_record_id === todayMasuk.id) ||
          todayPulangList[todayPulangList.length - 1] ||
          null

        activeMasuk = todayMasuk
        activePulang = todayPulang
        activeWorkDate = today
      } else if (completedYestOvernightMasuk) {
        // Yesterday overnight was completed today
        const matchingPulang =
          todayPulangList.find(p => p.check_in_record_id === completedYestOvernightMasuk.id) ||
          yestPulangList.find(p => p.check_in_record_id === completedYestOvernightMasuk.id) ||
          null

        activeMasuk = completedYestOvernightMasuk
        activePulang = matchingPulang
        activeWorkDate = yesterday
        isNextDay = true
      }

      const defaultShiftOpt = (emp.default_shift as SecurityShiftOption) || null
      const effectiveShift = (activeMasuk?.shift as SecurityShiftOption) || defaultShiftOpt
      const opStatus = deriveSecurityOperationalStatus(
        activeMasuk,
        activePulang,
        effectiveShift,
        activeWorkDate,
        currentTime,
      )

      if (opStatus === 'sedang_bertugas') {
        secBertugas++
      } else if (opStatus === 'tugas_selesai') {
        secSelesai++
      } else {
        secBelum++
      }

      // Check if checkout falls on next day (H+1)
      if (activePulang && activeMasuk) {
        const isOvernight = isOvernightSecurityShift(
          activeMasuk.work_date,
          activeMasuk.shift as SecurityShiftOption,
        )
        if (isOvernight) {
          isNextDay = true
        }
      }

      const shiftDisplay = effectiveShift
        ? getSecurityShiftDisplayLabel(effectiveShift, activeWorkDate)
        : 'Shift Belum Ditentukan'

      secItems.push({
        employeeId: emp.id,
        employeeName: emp.full_name,
        employeeCode: emp.employee_code,
        category: 'Security',
        shift: shiftDisplay,
        workDate: activeWorkDate,
        checkInTime: activeMasuk?.recorded_at ? formatJakartaTime(activeMasuk.recorded_at) : null,
        checkInDate: activeMasuk?.recorded_at
          ? formatInTimeZone(parseISO(activeMasuk.recorded_at), TIMEZONE, 'dd MMM yyyy')
          : null,
        checkOutTime: activePulang?.recorded_at ? formatJakartaTime(activePulang.recorded_at) : null,
        checkOutDate: activePulang?.recorded_at
          ? formatInTimeZone(parseISO(activePulang.recorded_at), TIMEZONE, 'dd MMM yyyy')
          : null,
        isCheckoutNextDay: isNextDay,
        operationalStatus: opStatus,
        reviewStatus: activeMasuk?.review_status || activePulang?.review_status,
        lateMinutes: activeMasuk?.late_minutes || 0,
        avatarUrl: emp.avatar_url,
        authUid: emp.auth_uid,
      })
    }
  }

  return {
    csSummary: {
      sedangBertugas: csBertugas,
      belumCheckIn: csBelum,
      tugasSelesai: csSelesai,
      total: csItems.length,
    },
    securitySummary: {
      sedangBertugas: secBertugas,
      belumCheckIn: secBelum,
      tugasSelesai: secSelesai,
      total: secItems.length,
    },
    items: [...csItems, ...secItems],
  }
}
