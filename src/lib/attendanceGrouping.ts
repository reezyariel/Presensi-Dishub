import type {
  AttendanceRecord,
  CSGroupedAttendance,
  AttendanceStatus,
  ReviewStatus,
} from '../types/attendance'

/**
 * Group raw CS attendance records so that 1 employee on 1 work_date = 1 row.
 * Strictly preserves transactions:
 * - Masuk transaction -> masuk
 * - Istirahat transaction -> istirahat
 * - Pulang transaction -> pulang
 * - Never combines different employees or different work dates.
 */
export function groupCSRecords(records: AttendanceRecord[]): CSGroupedAttendance[] {
  // Only process CS records
  const csRecords = records.filter(r => r.category === 'CS')

  const groupMap = new Map<string, CSGroupedAttendance>()

  for (const rec of csRecords) {
    // Unique identifier for employee: prefer employee_profile_id, then normalized_name, then lowercase employee_name
    const empId = rec.employee_profile_id || rec.normalized_name || rec.employee_name.toLowerCase().trim()
    const groupKey = `${empId}___${rec.work_date}`

    let group = groupMap.get(groupKey)
    if (!group) {
      group = {
        id: `${empId}_${rec.work_date}`,
        employee_id: empId,
        employee_name: rec.employee_name,
        normalized_name: rec.normalized_name,
        category: 'CS',
        work_date: rec.work_date,
        masuk: null,
        istirahat: null,
        pulang: null,
        overall_attendance_status: 'tepat_waktu',
        overall_review_status: 'sudah_diperiksa',
        total_late_minutes: 0,
        records: [],
      }
      groupMap.set(groupKey, group)
    }

    // Attach transaction based on attendance_type
    if (rec.attendance_type === 'masuk') {
      group.masuk = rec
    } else if (rec.attendance_type === 'istirahat') {
      group.istirahat = rec
    } else if (rec.attendance_type === 'pulang') {
      group.pulang = rec
    }

    group.records.push(rec)
  }

  // Derive aggregated statuses for each group
  const result: CSGroupedAttendance[] = []

  for (const group of groupMap.values()) {
    // Sort transactions inside group by recorded_at
    group.records.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())

    // Overall attendance status: 'terlambat' if any transaction is late
    const hasLate = group.records.some(r => r.attendance_status === 'terlambat')
    group.overall_attendance_status = hasLate ? 'terlambat' : 'tepat_waktu'

    // Overall review status:
    // If any is 'perlu_tindak_lanjut' -> 'perlu_tindak_lanjut'
    // Else if any is 'belum_diperiksa' -> 'belum_diperiksa'
    // Else if all are 'sudah_diperiksa' -> 'sudah_diperiksa'
    const hasNeedAction = group.records.some(r => r.review_status === 'perlu_tindak_lanjut')
    const hasPending = group.records.some(r => r.review_status === 'belum_diperiksa')

    if (hasNeedAction) {
      group.overall_review_status = 'perlu_tindak_lanjut'
    } else if (hasPending) {
      group.overall_review_status = 'belum_diperiksa'
    } else {
      group.overall_review_status = 'sudah_diperiksa'
    }

    group.total_late_minutes = group.records.reduce((acc, r) => acc + (r.late_minutes || 0), 0)

    result.push(group)
  }

  // Sort groups: newest work_date first, then employee name alphabetical
  result.sort((a, b) => {
    if (a.work_date !== b.work_date) {
      return b.work_date.localeCompare(a.work_date)
    }
    return a.employee_name.localeCompare(b.employee_name)
  })

  return result
}

/**
 * Filter CSGroupedAttendance records by search criteria.
 */
export function filterCSGroups(
  groups: CSGroupedAttendance[],
  filters: {
    name?: string
    attendance_type?: string
    attendance_status?: AttendanceStatus | ''
    review_status?: ReviewStatus | ''
  }
): CSGroupedAttendance[] {
  return groups.filter(g => {
    if (filters.name) {
      const q = filters.name.toLowerCase()
      if (!g.employee_name.toLowerCase().includes(q)) return false
    }

    if (filters.attendance_type) {
      if (filters.attendance_type === 'masuk' && !g.masuk) return false
      if (filters.attendance_type === 'istirahat' && !g.istirahat) return false
      if (filters.attendance_type === 'pulang' && !g.pulang) return false
    }

    if (filters.attendance_status) {
      if (filters.attendance_status !== g.overall_attendance_status) return false
    }

    if (filters.review_status) {
      if (filters.review_status !== g.overall_review_status) return false
    }

    return true
  })
}
