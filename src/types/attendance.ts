// ============================================================
// SIPATEN — TypeScript Types
// ============================================================

export type UserRole = 'admin' | 'CS' | 'Security' | 'user'
export type EmployeeRole = 'CS' | 'Security'
export type Category = 'CS' | 'Security'
export type AttendanceType = 'masuk' | 'istirahat' | 'pulang'
export type ShiftType = 'Shift 1' | 'Shift 2' | 'Shift 3' | 'Shift I' | 'Shift II' | 'Shift III'
/** Weekend session labels used exclusively for Security on Sabtu–Minggu */
export type WeekendSession = 'Sesi Pagi' | 'Sesi Malam'
/** All possible Security shift/session values (weekday + weekend) */
export type SecurityShiftOption = ShiftType | WeekendSession | string
export type AttendanceStatus = 'tepat_waktu' | 'terlambat'
export type ReviewStatus = 'belum_diperiksa' | 'sudah_diperiksa' | 'perlu_tindak_lanjut'

export interface SecurityShiftItem {
  id: string
  shift_name: string
  shift_number: number
  in_start: string   // HH:mm
  in_end: string     // HH:mm
  out_start: string  // HH:mm
  out_end: string    // HH:mm
  out_next_day: boolean
}

export interface SecurityDayGroup {
  name: string
  days: number[] // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
  shifts: SecurityShiftItem[]
}

export interface SecurityScheduleConfig {
  day_groups: {
    mon_thu: SecurityDayGroup
    friday: SecurityDayGroup
    weekend: SecurityDayGroup
    [key: string]: SecurityDayGroup
  }
  thursday_friday_shift_minutes?: number
  shifts?: Record<string, unknown>
}

export interface EmployeeProfile {
  id: string
  full_name: string
  normalized_name: string
  employee_code?: string | null
  email?: string | null
  auth_uid?: string | null
  employee_role: EmployeeRole
  default_shift: SecurityShiftOption | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AttendanceRecord {
  id: string
  employee_name: string
  normalized_name: string | null
  employee_profile_id?: string | null
  auth_uid?: string | null
  category: Category
  attendance_type: AttendanceType
  shift: SecurityShiftOption | null
  work_date: string              // ISO date YYYY-MM-DD
  recorded_at: string            // ISO timestamptz
  scheduled_start: string | null // HH:mm
  scheduled_end: string | null   // HH:mm
  attendance_status: AttendanceStatus
  late_minutes: number
  selfie_storage_path: string
  review_status: ReviewStatus
  admin_notes: string | null
  idempotency_key: string
  check_in_record_id?: string | null
  latitude?: number | null
  longitude?: number | null
  distance_meters?: number | null
  reason?: string | null
  created_at: string
  updated_at: string
}

export interface AttendanceAuditLog {
  id: string
  attendance_record_id: string | null
  admin_id: string
  action: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  reason: string
  created_at: string
  admin_profiles?: {
    full_name: string
  }
}

export interface AdminProfile {
  id: string
  full_name: string
  email?: string | null
  is_active?: boolean
  created_at: string
  updated_at: string
}

export interface AttendanceSetting {
  id: string
  setting_key: string
  setting_value: unknown
  description: string | null
  updated_by: string | null
  updated_at: string
}

export interface LocationPreset {
  id: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  radius_meters: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// Dashboard stats
export interface DashboardStats {
  totalToday: number
  totalCS: number
  totalSecurity: number
  totalLate: number
  totalNeedReview: number
}

// Schedule info returned by schedule engine
export interface ScheduleInfo {
  scheduledStart: string   // HH:mm
  scheduledEnd: string     // HH:mm
  isNextDay: boolean       // pulang hari berikutnya (Shift III)
  dayType: 'normal' | 'shifted'
}

// Submission payload for Edge Function
export interface AttendanceSubmitPayload {
  employee_name: string
  category: Category
  attendance_type: AttendanceType
  shift?: SecurityShiftOption | null
  selfie_base64: string
  selfie_mime?: string
  idempotency_key: string
  check_in_record_id?: string | null
  latitude?: number | null
  longitude?: number | null
  location_accuracy?: number | null
  distance_meters?: number | null
  reason?: string | null
}

// Filter state for admin table
export interface AttendanceFilters {
  date_from: string
  date_to: string
  name: string
  category: Category | ''
  shift: ShiftType | ''
  attendance_type: AttendanceType | ''
  attendance_status: AttendanceStatus | ''
  review_status: ReviewStatus | ''
}
