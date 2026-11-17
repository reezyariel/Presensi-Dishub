// ============================================================
// SIPATEN — Review Assistance & Evidence Integrity Engine
// Pure helper functions for Admin Review Absensi inspection
// Zero mutation of schedules, shifts, or database schemas
// ============================================================

import type { AttendanceRecord } from '../types/attendance'
import { formatJakartaTime, formatJakartaDate } from './scheduleEngine'
import { formatSecurityDisplayDate } from './securityDateDisplay'
import { formatDistance } from './officeLocation'

export interface ReviewAssistanceFlags {
  missingPhoto: boolean
  missingGps: boolean
  outsideGeofence: boolean
  isLate: boolean
  possibleDuplicate: boolean
  missingInfo: boolean
  warningCount: number
  reasons: string[]
}

/**
 * Evaluates visual aid indicators for an attendance record.
 * Purely informational flags for Admin — does NOT auto-approve or auto-reject.
 */
export function getReviewAssistanceFlags(
  record: AttendanceRecord,
  allRecords: AttendanceRecord[] = [],
  officeRadiusMeters = 100
): ReviewAssistanceFlags {
  const missingPhoto = !record.selfie_storage_path || !record.selfie_storage_path.trim()
  const missingGps =
    record.latitude === null ||
    record.latitude === undefined ||
    record.longitude === null ||
    record.longitude === undefined
  const outsideGeofence =
    record.distance_meters !== null &&
    record.distance_meters !== undefined &&
    record.distance_meters > officeRadiusMeters
  const isLate = record.attendance_status === 'terlambat' || (record.late_minutes ?? 0) > 0

  // Potential duplicate: another record for same employee, work_date, and attendance_type
  const possibleDuplicate = allRecords.some((r) => {
    if (r.id === record.id) return false
    const sameEmployee =
      (record.employee_profile_id && r.employee_profile_id === record.employee_profile_id) ||
      (r.normalized_name && record.normalized_name && r.normalized_name === record.normalized_name) ||
      r.employee_name.toLowerCase().trim() === record.employee_name.toLowerCase().trim()
    return sameEmployee && r.work_date === record.work_date && r.attendance_type === record.attendance_type
  })

  const reasons: string[] = []
  if (missingPhoto) reasons.push('Foto selfie verifikasi tidak tersedia')
  if (missingGps) reasons.push('Koordinat GPS tidak tercatat pada pengajuan')
  if (outsideGeofence) {
    const distText = record.distance_meters !== null && record.distance_meters !== undefined
      ? formatDistance(record.distance_meters)
      : 'Di luar radius'
    reasons.push(`Lokasi berada di luar radius geofence kantor (${distText} > ${officeRadiusMeters}m)`)
  }
  if (isLate) reasons.push(`Tercatat terlambat (+${record.late_minutes ?? 0} menit)`)
  if (possibleDuplicate) reasons.push('Terindikasi duplikat (ada pengajuan lain untuk pegawai, tanggal, dan jenis yang sama)')

  const missingInfo = missingPhoto || missingGps

  return {
    missingPhoto,
    missingGps,
    outsideGeofence,
    isLate,
    possibleDuplicate,
    missingInfo,
    warningCount: reasons.length,
    reasons,
  }
}

/**
 * Returns employee code or short ID for clear UI identification.
 */
export function getEmployeeDisplayCode(
  record: AttendanceRecord,
  codeMap?: Map<string, string>
): string {
  if (codeMap) {
    if (record.employee_profile_id && codeMap.has(record.employee_profile_id)) {
      return codeMap.get(record.employee_profile_id)!
    }
    if (record.normalized_name && codeMap.has(record.normalized_name)) {
      return codeMap.get(record.normalized_name)!
    }
    const nameKey = record.employee_name.toLowerCase().trim()
    if (codeMap.has(nameKey)) {
      return codeMap.get(nameKey)!
    }
  }

  // Fallback to employee_profile_id or record ID slice
  if (record.employee_profile_id) {
    return record.employee_profile_id.slice(0, 8).toUpperCase()
  }
  return record.id.slice(0, 8).toUpperCase()
}

/**
 * Filters a record based on search term (name, code, or ID).
 */
export function matchesReviewSearch(
  record: AttendanceRecord,
  query: string,
  codeMap?: Map<string, string>
): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true

  // Match employee name
  if (record.employee_name.toLowerCase().includes(q)) return true
  if (record.normalized_name && record.normalized_name.toLowerCase().includes(q)) return true

  // Match record ID
  if (record.id.toLowerCase().includes(q)) return true

  // Match employee code
  const code = getEmployeeDisplayCode(record, codeMap).toLowerCase()
  if (code.includes(q)) return true

  return false
}

/**
 * Formats display date according to CS vs Security role.
 */
export function formatReviewWorkDate(record: AttendanceRecord): string {
  if (record.category === 'Security') {
    return formatSecurityDisplayDate(record.work_date, record.shift, record.attendance_type, record.category)
  }
  return formatJakartaDate(record.work_date)
}

/**
 * Formats recorded timestamp to Jakarta WIB string.
 */
export function formatReviewTime(recordedAt: string | null | undefined): string {
  if (!recordedAt) return '--:-- WIB'
  return `${formatJakartaTime(new Date(recordedAt))} WIB`
}

/**
 * Checks if a Security record is an overnight shift checkout.
 */
export function isOvernightSecurityRecord(record: AttendanceRecord): boolean {
  if (record.category !== 'Security' || record.attendance_type !== 'pulang') {
    return false
  }
  const shiftStr = String(record.shift || '').toLowerCase()
  return (
    shiftStr.includes('shift 3') ||
    shiftStr.includes('shift iii') ||
    shiftStr.includes('shift_2_malam') ||
    shiftStr.includes('sesi malam')
  )
}
