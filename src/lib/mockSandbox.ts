// ============================================================
// SIPATEN — Local Testing Sandbox & Mock Service Layer
// Completely isolates frontend testing from Supabase Production.
// In Testing Mode:
// - Zero write operations (INSERT, UPDATE, DELETE, UPSERT) touch Supabase Production.
// - Zero Edge Function invocations touch remote server.
// - Zero photos uploaded to Supabase Storage.
// - Full business logic, schedule engine, and shift rules are executed locally.
// - In production build (import.meta.env.DEV = false), this module is completely inert.
// ============================================================

import { getEffectiveNow, getEffectiveTodayJakarta } from './mockClock'
import {
  checkAttendanceWindow,
  DEFAULT_SECURITY_SCHEDULE,
  getCSScheduleSync,
  isOvernightSecurityShift,
  isOvernightCheckout,
  getSecurityShiftItem,
  shiftsCompatible,
} from './scheduleEngine'
import { DEFAULT_OFFICE_CONFIG, calculateDistanceMeters } from './officeLocation'
import type {
  AttendanceRecord,
  EmployeeProfile,
  AdminProfile,
  SecurityShiftOption,
  AttendanceType,
} from '../types/attendance'

export { shiftsCompatible }

const STORAGE_ACTIVE_KEY = 'sipaten_mock_sandbox_active'
const STORAGE_ROLE_KEY = 'sipaten_mock_sandbox_role'
const STORAGE_RECORDS_KEY = 'sipaten_mock_sandbox_records'
const STORAGE_EMPLOYEES_KEY = 'sipaten_mock_sandbox_employees'
const STORAGE_SETTINGS_KEY = 'sipaten_mock_sandbox_settings'

export function isDev(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.DEV === 'boolean') {
      return import.meta.env.DEV
    }
    const proc = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process
    return typeof proc !== 'undefined' && proc.env?.NODE_ENV !== 'production'
  } catch {
    return false
  }
}

/**
 * Checks if local testing sandbox mode is active.
 * STRICTLY returns false in production builds.
 */
export function isTestingModeActive(): boolean {
  if (!isDev()) return false
  try {
    return sessionStorage.getItem(STORAGE_ACTIVE_KEY) === 'true'
  } catch {
    return false
  }
}

export type MockRole = 'admin' | 'Security' | 'CS'

export function getActiveMockRole(): MockRole {
  if (!isDev()) return 'admin'
  try {
    const r = sessionStorage.getItem(STORAGE_ROLE_KEY) as MockRole
    if (r === 'admin' || r === 'Security' || r === 'CS') return r
  } catch {}
  return 'admin'
}

export function setActiveMockRole(role: MockRole): void {
  if (!isDev()) return
  try {
    sessionStorage.setItem(STORAGE_ROLE_KEY, role)
    window.dispatchEvent(new CustomEvent('sipaten_mock_role_changed', { detail: { role } }))
  } catch {}
}

export function setTestingModeActive(active: boolean, initialRole: MockRole = 'admin'): void {
  if (!isDev()) {
    console.warn('[SIPATEN Mock Sandbox] Cannot activate testing mode in production build.')
    return
  }
  try {
    if (active) {
      sessionStorage.setItem(STORAGE_ACTIVE_KEY, 'true')
      sessionStorage.setItem(STORAGE_ROLE_KEY, initialRole)
      // Initialize seed data if not present
      initSeedData()
    } else {
      sessionStorage.removeItem(STORAGE_ACTIVE_KEY)
    }
    window.dispatchEvent(new CustomEvent('sipaten_testing_mode_changed', { detail: { active, role: initialRole } }))
  } catch (err) {
    console.error('[SIPATEN Mock Sandbox] Error toggling testing mode:', err)
  }
}

// ------------------------------------------------------------
// SEED DATA GENERATOR
// ------------------------------------------------------------

export const MOCK_ADMIN_USER: AdminProfile = {
  id: 'mock-admin-01',
  full_name: 'Bambang Supriyanto (Admin SIPATEN)',
  email: 'admin@sipaten.id',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

export const MOCK_SECURITY_USER: EmployeeProfile = {
  id: 'mock-sec-01',
  auth_uid: 'mock-sec-01',
  employee_code: 'SEC-001',
  full_name: 'Ahmad Dani',
  normalized_name: 'ahmad dani',
  employee_role: 'Security',
  default_shift: 'shift_1_reguler',
  is_active: true,
  notes: 'Petugas Security Shift Operasional Reguler & Panjang',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

export const MOCK_CS_USER: EmployeeProfile = {
  id: 'mock-cs-01',
  auth_uid: 'mock-cs-01',
  employee_code: 'CS-001',
  full_name: 'Budi Santoso',
  normalized_name: 'budi santoso',
  employee_role: 'CS',
  default_shift: null,
  is_active: true,
  notes: 'Petugas Kebersihan / Cleaning Service',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

export const MOCK_EMPLOYEES_LIST: EmployeeProfile[] = [
  MOCK_SECURITY_USER,
  {
    id: 'mock-sec-02',
    auth_uid: 'mock-sec-02',
    employee_code: 'SEC-002',
    full_name: 'Eko Prasetyo',
    normalized_name: 'eko prasetyo',
    employee_role: 'Security',
    default_shift: 'shift_2_malam',
    is_active: true,
    notes: 'Petugas Security Shift Malam',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  MOCK_CS_USER,
  {
    id: 'mock-cs-02',
    auth_uid: 'mock-cs-02',
    employee_code: 'CS-002',
    full_name: 'Siti Rahma',
    normalized_name: 'siti rahma',
    employee_role: 'CS',
    default_shift: null,
    is_active: true,
    notes: 'Petugas CS Gedung Utama',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

// In-memory / sessionStorage image store (base64)
const mockStorageMap = new Map<string, string>()

export function getMockStorageImage(path: string): string | null {
  return mockStorageMap.get(path) || null
}

export function setMockStorageImage(path: string, base64: string): void {
  mockStorageMap.set(path, base64)
}

function generateInitialMockRecords(): AttendanceRecord[] {
  const records: AttendanceRecord[] = []
  const now = getEffectiveNow()
  const todayStr = getEffectiveTodayJakarta()

  // Generate 14 days of realistic past records for CS & Security
  // Strictly in the past: d.getDate() - i where i >= 1
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    if (dateStr >= todayStr) continue
    const dayOfWeek = d.getDay() // 0=Sun, 5=Fri, 6=Sat

    // Security (Ahmad Dani)
    const secShift: SecurityShiftOption =
      dayOfWeek === 5
        ? (i % 2 === 0 ? 'shift_1_reguler' : 'shift_1_panjang')
        : (dayOfWeek === 0 || dayOfWeek === 6)
          ? 'Shift I'
          : 'Shift I'

    records.push({
      id: `mock_rec_sec_masuk_${dateStr}`,
      employee_name: MOCK_SECURITY_USER.full_name,
      normalized_name: MOCK_SECURITY_USER.normalized_name,
      employee_profile_id: MOCK_SECURITY_USER.id,
      auth_uid: MOCK_SECURITY_USER.auth_uid,
      category: 'Security',
      attendance_type: 'masuk',
      shift: secShift,
      work_date: dateStr,
      recorded_at: `${dateStr}T07:14:00+07:00`,
      scheduled_start: '07:00',
      scheduled_end: '07:30',
      attendance_status: i === 3 ? 'terlambat' : 'tepat_waktu',
      late_minutes: i === 3 ? 12 : 0,
      selfie_storage_path: `mock_selfies/${dateStr}_sec_masuk.jpg`,
      review_status: 'sudah_diperiksa',
      admin_notes: i === 3 ? 'Terlambat 12 menit - Macet' : null,
      idempotency_key: `idemp_sec_m_${dateStr}`,
      latitude: -6.175392,
      longitude: 106.827153,
      distance_meters: 18,
      created_at: `${dateStr}T07:14:00+07:00`,
      updated_at: `${dateStr}T07:14:00+07:00`,
    })

    records.push({
      id: `mock_rec_sec_pulang_${dateStr}`,
      employee_name: MOCK_SECURITY_USER.full_name,
      normalized_name: MOCK_SECURITY_USER.normalized_name,
      employee_profile_id: MOCK_SECURITY_USER.id,
      auth_uid: MOCK_SECURITY_USER.auth_uid,
      category: 'Security',
      attendance_type: 'pulang',
      shift: secShift,
      work_date: dateStr,
      recorded_at: `${dateStr}T16:15:00+07:00`,
      scheduled_start: '16:00',
      scheduled_end: '16:30',
      attendance_status: 'tepat_waktu',
      late_minutes: 0,
      selfie_storage_path: `mock_selfies/${dateStr}_sec_pulang.jpg`,
      review_status: 'sudah_diperiksa',
      admin_notes: null,
      idempotency_key: `idemp_sec_p_${dateStr}`,
      latitude: -6.175392,
      longitude: 106.827153,
      distance_meters: 15,
      check_in_record_id: `mock_rec_sec_masuk_${dateStr}`,
      created_at: `${dateStr}T16:15:00+07:00`,
      updated_at: `${dateStr}T16:15:00+07:00`,
    })

    // CS (Budi Santoso)
    records.push({
      id: `mock_rec_cs_masuk_${dateStr}`,
      employee_name: MOCK_CS_USER.full_name,
      normalized_name: MOCK_CS_USER.normalized_name,
      employee_profile_id: MOCK_CS_USER.id,
      auth_uid: MOCK_CS_USER.auth_uid,
      category: 'CS',
      attendance_type: 'masuk',
      shift: null,
      work_date: dateStr,
      recorded_at: `${dateStr}T07:45:00+07:00`,
      scheduled_start: '07:30',
      scheduled_end: '08:00',
      attendance_status: 'tepat_waktu',
      late_minutes: 0,
      selfie_storage_path: `mock_selfies/${dateStr}_cs_masuk.jpg`,
      review_status: 'sudah_diperiksa',
      admin_notes: null,
      idempotency_key: `idemp_cs_m_${dateStr}`,
      latitude: -6.175392,
      longitude: 106.827153,
      distance_meters: 10,
      created_at: `${dateStr}T07:45:00+07:00`,
      updated_at: `${dateStr}T07:45:00+07:00`,
    })

    records.push({
      id: `mock_rec_cs_pulang_${dateStr}`,
      employee_name: MOCK_CS_USER.full_name,
      normalized_name: MOCK_CS_USER.normalized_name,
      employee_profile_id: MOCK_CS_USER.id,
      auth_uid: MOCK_CS_USER.auth_uid,
      category: 'CS',
      attendance_type: 'pulang',
      shift: null,
      work_date: dateStr,
      recorded_at: `${dateStr}T16:30:00+07:00`,
      scheduled_start: '16:00',
      scheduled_end: '18:00',
      attendance_status: 'tepat_waktu',
      late_minutes: 0,
      selfie_storage_path: `mock_selfies/${dateStr}_cs_pulang.jpg`,
      review_status: 'sudah_diperiksa',
      admin_notes: null,
      idempotency_key: `idemp_cs_p_${dateStr}`,
      latitude: -6.175392,
      longitude: 106.827153,
      distance_meters: 12,
      created_at: `${dateStr}T16:30:00+07:00`,
      updated_at: `${dateStr}T16:30:00+07:00`,
    })
  }

  return records
}

export function initSeedData(forceReset = false): void {
  if (!isDev()) return
  try {
    if (forceReset) {
      mockStorageMap.clear()
    }
    if (forceReset || !sessionStorage.getItem(STORAGE_RECORDS_KEY)) {
      const records = generateInitialMockRecords()
      sessionStorage.setItem(STORAGE_RECORDS_KEY, JSON.stringify(records))
    }
    if (forceReset || !sessionStorage.getItem(STORAGE_EMPLOYEES_KEY)) {
      sessionStorage.setItem(STORAGE_EMPLOYEES_KEY, JSON.stringify(MOCK_EMPLOYEES_LIST))
    }
    if (forceReset || !sessionStorage.getItem(STORAGE_SETTINGS_KEY)) {
      const settings = {
        security_schedule: DEFAULT_SECURITY_SCHEDULE,
        cs_schedule: getCSScheduleSync(),
        office_location: DEFAULT_OFFICE_CONFIG,
      }
      sessionStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings))
    }
  } catch (e) {
    console.warn('[SIPATEN Mock Sandbox] Could not persist seed data to sessionStorage:', e)
  }
}

export function getMockRecords(): AttendanceRecord[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_RECORDS_KEY)
    if (raw) {
      const records: AttendanceRecord[] = JSON.parse(raw)
      const currentToday = getEffectiveTodayJakarta()
      // Filter out any SEED records that lie on or after currentEffectiveToday
      // (Seed records have IDs starting with mock_rec_sec_masuk_, mock_rec_sec_pulang_, etc.)
      // User-created test records (mock_rec_<timestamp>_...) are NEVER filtered out!
      return records.filter(r => {
        const isSeedRecord =
          r.id.startsWith('mock_rec_sec_masuk_') ||
          r.id.startsWith('mock_rec_sec_pulang_') ||
          r.id.startsWith('mock_rec_cs_masuk_') ||
          r.id.startsWith('mock_rec_cs_pulang_') ||
          r.id.startsWith('mock_rec_cs_istirahat_')
        if (isSeedRecord && r.work_date >= currentToday) {
          return false
        }
        return true
      })
    }
  } catch {}
  return []
}

export function saveMockRecords(records: AttendanceRecord[]): void {
  try {
    sessionStorage.setItem(STORAGE_RECORDS_KEY, JSON.stringify(records))
  } catch {}
}

export function getMockEmployees(): EmployeeProfile[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_EMPLOYEES_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return MOCK_EMPLOYEES_LIST
}

export function saveMockEmployees(employees: EmployeeProfile[]): void {
  try {
    sessionStorage.setItem(STORAGE_EMPLOYEES_KEY, JSON.stringify(employees))
  } catch {}
}

export function getMockSettings(): Record<string, any> {
  try {
    const raw = sessionStorage.getItem(STORAGE_SETTINGS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {
    security_schedule: DEFAULT_SECURITY_SCHEDULE,
    cs_schedule: getCSScheduleSync(),
    office_location: DEFAULT_OFFICE_CONFIG,
  }
}

export function saveMockSettings(settings: Record<string, any>): void {
  try {
    sessionStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}

// ------------------------------------------------------------
// LOCAL MOCK EDGE FUNCTION SIMULATOR: submit-attendance
// ------------------------------------------------------------

export interface MockSubmitAttendancePayload {
  employee_name: string
  category: 'CS' | 'Security'
  attendance_type: AttendanceType
  shift?: SecurityShiftOption | null
  check_in_record_id?: string
  work_date?: string
  selfie_base64: string
  idempotency_key: string
  latitude?: number | null
  longitude?: number | null
  location_accuracy?: number | null
  distance_meters?: number | null
  reason?: string
}

export interface MockSubmitAttendanceResult {
  success?: boolean
  data?: AttendanceRecord
  error?: string
  error_code?: string
  requires_reason?: boolean
}

/**
 * Local simulation of Supabase Edge Function `submit-attendance`.
 * Uses `getEffectiveNow()` so DevClock fully controls testing time!
 */
export function simulateMockSubmitAttendance(
  payload: MockSubmitAttendancePayload
): MockSubmitAttendanceResult {
  const {
    employee_name,
    category,
    attendance_type,
    shift,
    check_in_record_id,
    work_date,
    selfie_base64,
    idempotency_key,
    latitude,
    longitude,
    reason,
  } = payload

  // 1. Mandatory Selfie Validation
  if (!selfie_base64) {
    return { error: 'Foto selfie bukti presensi wajib diambil.' }
  }

  // 2. Validate Category & Shift
  if (category === 'Security') {
    if (attendance_type === 'istirahat') {
      return { error: 'Kategori Security tidak memiliki tipe absensi istirahat.' }
    }

    const validShifts = [
      'Shift 1', 'Shift 2', 'Shift 3',
      'Shift I', 'Shift II', 'Shift III',
      'Sesi Pagi', 'Sesi Malam',
      'shift_1_reguler', 'shift_1_panjang', 'shift_2_malam',
    ]

    if (!shift || !validShifts.includes(shift)) {
      return {
        error: 'Pilih shift yang valid untuk Security (Shift I, Shift II, Shift III, shift_1_reguler, shift_1_panjang, shift_2_malam).',
      }
    }
  }

  // 3. Time & Date evaluation from DevClock (Authoritative in mock mode)
  const now = getEffectiveNow()
  const todayStr = getEffectiveTodayJakarta()
  const existingRecords = getMockRecords()

  // 4. Determine Work Date & find matching check-in
  let workDateStr = work_date || todayStr
  let matchedMasuk: AttendanceRecord | undefined

  if (category === 'Security') {
    if (attendance_type === 'pulang') {
      // Find check-in record
      if (check_in_record_id) {
        matchedMasuk = existingRecords.find(r => r.id === check_in_record_id)
        if (matchedMasuk) {
          workDateStr = matchedMasuk.work_date
        }
      }

      if (!matchedMasuk) {
        // Look up by employee and shift
        // If today is morning (< 14:00) and shift is overnight checkout (e.g. Kamis Shift III -> Jumat pagi):
        const yesterdayDate = new Date(now)
        yesterdayDate.setDate(yesterdayDate.getDate() - 1)
        const yesterdayStr = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

        const candidateDates = (now.getHours() < 14 && isOvernightCheckout(todayStr, shift ?? null))
          ? [yesterdayStr, todayStr]
          : [todayStr, yesterdayStr]

        for (const cDate of candidateDates) {
          const found = existingRecords.find(
            r =>
              r.employee_name === employee_name &&
              r.category === 'Security' &&
              r.attendance_type === 'masuk' &&
              r.work_date === cDate &&
              shiftsCompatible(r.shift, shift)
          )
          if (found) {
            matchedMasuk = found
            workDateStr = found.work_date
            break
          }
        }
      }

      // Check-in prerequisite for checkout
      if (!matchedMasuk) {
        return {
          error: `Presensi PULANG ditolak. Anda belum tercatat melakukan presensi MASUK untuk shift ${shift || ''} pada tanggal kerja ${workDateStr}.`,
          error_code: 'NO_CHECK_IN_FOUND',
        }
      }
    } else if (attendance_type === 'masuk') {
      // Check if user still has an active uncompleted overnight shift
      const yesterdayDate = new Date(now)
      yesterdayDate.setDate(yesterdayDate.getDate() - 1)
      const yesterdayStr = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

      const uncompletedOvernight = existingRecords.find(
        r =>
          r.employee_name === employee_name &&
          r.category === 'Security' &&
          r.attendance_type === 'masuk' &&
          r.work_date === yesterdayStr &&
          isOvernightSecurityShift(yesterdayStr, r.shift) &&
          !existingRecords.some(p => p.employee_name === employee_name && p.work_date === yesterdayStr && p.attendance_type === 'pulang')
      )

      if (uncompletedOvernight) {
        return {
          error: `Anda masih memiliki tugas aktif ${uncompletedOvernight.shift} yang belum melakukan presensi pulang. Selesaikan check-out terlebih dahulu sebelum memulai shift baru.`,
          error_code: 'ACTIVE_OVERNIGHT_SHIFT_IN_PROGRESS',
        }
      }

      workDateStr = work_date || todayStr
    }
  } else if (category === 'CS') {
    if (attendance_type === 'pulang') {
      matchedMasuk = existingRecords.find(
        r =>
          r.employee_name === employee_name &&
          r.category === 'CS' &&
          r.attendance_type === 'masuk' &&
          r.work_date === workDateStr
      )
      if (!matchedMasuk) {
        return {
          error: 'Presensi PULANG ditolak. Anda belum tercatat melakukan presensi MASUK hari ini.',
          error_code: 'NO_CHECK_IN_FOUND',
        }
      }
    }
  }

  // 5. Validate Shift for Day based on workDateStr (Senin-Kamis, Jumat, or Weekend)
  if (category === 'Security' && shift) {
    const [wY, wM, wD] = workDateStr.split('-').map(Number)
    const workDateObj = new Date(Date.UTC(wY, wM - 1, wD))
    const workDayOfWeek = workDateObj.getUTCDay() // 0=Sun, 1=Mon, ..., 4=Thu, 5=Fri, 6=Sat

    const isFriday = workDayOfWeek === 5
    const isWeekend = workDayOfWeek === 0 || workDayOfWeek === 6

    const allowed = isFriday
      ? ['shift_1_reguler', 'shift_1_panjang', 'shift_2_malam', 'Shift I', 'Shift II', 'Shift 1', 'Shift 2']
      : isWeekend
        ? ['Shift I', 'Shift II', 'Shift 1', 'Shift 2', 'Sesi Pagi', 'Sesi Malam']
        : ['Shift I', 'Shift II', 'Shift III', 'Shift 1', 'Shift 2', 'Shift 3']

    if (!allowed.includes(shift)) {
      const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
      return {
        error: `Pilihan shift ${shift} tidak sesuai dengan jadwal hari ${dayNames[workDayOfWeek]}. Shift yang tersedia: ${allowed.join(', ')}.`,
        error_code: 'INVALID_SHIFT_FOR_DAY',
      }
    }
  }

  // 6. GPS & Geofence Check
  const officeConfig = DEFAULT_OFFICE_CONFIG
  let distanceMeters: number | null = null
  let isOutsideGeofence = false

  if (latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null) {
    distanceMeters = calculateDistanceMeters(latitude, longitude, officeConfig.latitude, officeConfig.longitude)
    isOutsideGeofence = distanceMeters > officeConfig.radiusMeters
  } else {
    isOutsideGeofence = true // GPS missing
  }

  if (isOutsideGeofence) {
    if (!reason || reason.trim().length < 5) {
      return {
        requires_reason: true,
        error: distanceMeters !== null
          ? `Posisi Anda terdeteksi di luar radius kantor (${Math.round(distanceMeters)}m, batas ${officeConfig.radiusMeters}m). Wajib menyertakan alasan resmi (minimal 5 karakter).`
          : 'Lokasi GPS tidak terdeteksi. Harap izinkan akses lokasi atau sertakan alasan kendala lokasi (minimal 5 karakter).',
      }
    }
  }

  // 7. Window Check & Lateness Evaluation
  let attendance_status: 'tepat_waktu' | 'terlambat' = 'tepat_waktu'
  let late_minutes = 0
  let scheduled_start = '07:00'
  let scheduled_end = '16:00'

  if (category === 'Security' && shift) {
    const item = getSecurityShiftItem(workDateStr, shift)
    scheduled_start = attendance_type === 'masuk' ? item.in_start : item.out_start
    scheduled_end = attendance_type === 'masuk' ? item.in_end : item.out_end

    const currentMins = now.getHours() * 60 + now.getMinutes()
    const inStartMins = parseInt(item.in_start.split(':')[0]) * 60 + parseInt(item.in_start.split(':')[1])
    const inEndMins = parseInt(item.in_end.split(':')[0]) * 60 + parseInt(item.in_end.split(':')[1])
    const outStartMins = parseInt(item.out_start.split(':')[0]) * 60 + parseInt(item.out_start.split(':')[1])
    const outEndMins = parseInt(item.out_end.split(':')[0]) * 60 + parseInt(item.out_end.split(':')[1])

    if (attendance_type === 'masuk') {
      if (todayStr === workDateStr && currentMins < inStartMins) {
        return {
          error: `Presensi masuk ${shift} belum dibuka. Jendela presensi masuk dimulai pukul ${item.in_start} WIB.`,
          error_code: 'WINDOW_NOT_OPEN',
        }
      }
      if (currentMins > inEndMins || todayStr > workDateStr) {
        attendance_status = 'terlambat'
        late_minutes = currentMins > inEndMins ? currentMins - inEndMins : 15
      }
    } else if (attendance_type === 'pulang') {
      if (item.out_next_day) {
        // Overnight shift: checkout on H+1
        const [wY, wM, wD] = workDateStr.split('-').map(Number)
        const expectedCheckoutDate = new Date(Date.UTC(wY, wM - 1, wD + 1))
        const expectedCheckoutStr = expectedCheckoutDate.toISOString().slice(0, 10)

        if (todayStr < expectedCheckoutStr) {
          return {
            error: `Presensi pulang ${shift} belum dibuka. Jendela presensi pulang dimulai besok pagi pukul ${item.out_start} WIB (H+1).`,
            error_code: 'WINDOW_NOT_OPEN',
          }
        }
        if (todayStr === expectedCheckoutStr) {
          if (currentMins < outStartMins) {
            return {
              error: `Presensi pulang ${shift} belum dibuka. Jendela presensi pulang dimulai pukul ${item.out_start} WIB (H+1).`,
              error_code: 'WINDOW_NOT_OPEN',
            }
          }
          if (currentMins > outEndMins) {
            return {
              error: `Jendela presensi pulang ${shift} telah ditutup pada pukul ${item.out_end} WIB (H+1). Presensi pulang di luar jendela waktu tidak dapat dilakukan.`,
              error_code: 'WINDOW_CLOSED',
            }
          }
        }
      } else {
        // Same-day shift
        if (currentMins < outStartMins) {
          return {
            error: `Presensi pulang ${shift} belum dibuka. Jendela presensi pulang dimulai pukul ${item.out_start} WIB.`,
            error_code: 'WINDOW_NOT_OPEN',
          }
        }
        if (currentMins > outEndMins) {
          return {
            error: `Jendela presensi pulang ${shift} telah ditutup pada pukul ${item.out_end} WIB. Presensi pulang di luar jendela waktu tidak dapat dilakukan.`,
            error_code: 'WINDOW_CLOSED',
          }
        }
      }
    }
  } else if (category === 'CS') {
    const cs = getCSScheduleSync()
    if (attendance_type === 'masuk') {
      scheduled_start = cs.masuk.open
      scheduled_end = cs.masuk.ontime_deadline
      const windowStatus = checkAttendanceWindow('CS', 'masuk', null, workDateStr, now)
      if (windowStatus === 'not_yet') {
        return {
          error: `Presensi masuk CS belum dibuka. Jendela check-in dimulai pukul ${cs.masuk.open} WIB.`,
          error_code: 'WINDOW_NOT_OPEN',
        }
      }
      const currentMins = now.getHours() * 60 + now.getMinutes()
      const deadlineMins = parseInt(cs.masuk.ontime_deadline.split(':')[0]) * 60 + parseInt(cs.masuk.ontime_deadline.split(':')[1])
      if (currentMins > deadlineMins) {
        attendance_status = 'terlambat'
        late_minutes = currentMins - deadlineMins
      }
    } else if (attendance_type === 'istirahat') {
      scheduled_start = cs.istirahat.start
      scheduled_end = cs.istirahat.end
    } else if (attendance_type === 'pulang') {
      scheduled_start = cs.pulang.start
      scheduled_end = cs.pulang.end
    }
  }

  // 8. Duplicate Submission Prevention
  const duplicate = existingRecords.find(
    r =>
      r.employee_name === employee_name &&
      r.work_date === workDateStr &&
      r.attendance_type === attendance_type &&
      (category === 'CS' || shiftsCompatible(r.shift, shift))
  )

  if (duplicate) {
    return {
      error: `Presensi ${attendance_type} sudah tercatat sebelumnya untuk tanggal ${workDateStr}.`,
      error_code: 'DUPLICATE_ATTENDANCE',
    }
  }

  // 9. Store photo in mock storage
  const storagePath = `mock_selfies/${workDateStr}/${idempotency_key}.jpg`
  setMockStorageImage(storagePath, selfie_base64)

  // 10. Notes & Working Duration Calculation
  let admin_notes = reason ? `[Alasan: ${reason}]` : null
  if (attendance_type === 'pulang' && matchedMasuk) {
    const checkInTime = new Date(matchedMasuk.recorded_at).getTime()
    const checkOutTime = now.getTime()
    const durationMs = checkOutTime - checkInTime
    const durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 10) / 10
    const durationNote = `[Durasi kerja: ${durationHours} jam]`
    admin_notes = admin_notes ? `${admin_notes} ${durationNote}` : durationNote
  }

  // 11. Create New Record
  const newRecord: AttendanceRecord = {
    id: `mock_rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    employee_name,
    normalized_name: employee_name.toLowerCase().trim(),
    employee_profile_id: payload.category === 'Security' ? MOCK_SECURITY_USER.id : MOCK_CS_USER.id,
    auth_uid: payload.category === 'Security' ? MOCK_SECURITY_USER.auth_uid : MOCK_CS_USER.auth_uid,
    category,
    attendance_type,
    shift: category === 'Security' ? (shift ?? null) : null,
    work_date: workDateStr,
    recorded_at: now.toISOString(),
    scheduled_start,
    scheduled_end,
    attendance_status,
    late_minutes,
    selfie_storage_path: storagePath,
    review_status: isOutsideGeofence || attendance_status === 'terlambat' ? 'perlu_tindak_lanjut' : 'belum_diperiksa',
    admin_notes,
    idempotency_key,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    distance_meters: distanceMeters !== null ? Math.round(distanceMeters) : null,
    check_in_record_id: matchedMasuk ? matchedMasuk.id : (check_in_record_id || undefined),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  }

  existingRecords.unshift(newRecord)
  saveMockRecords(existingRecords)

  // Dispatch event for UI updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sipaten_mock_record_added', { detail: newRecord }))
  }

  return {
    success: true,
    data: newRecord,
  }
}

// ------------------------------------------------------------
// QUERY BUILDER SIMULATOR FOR MOCK DB
// ------------------------------------------------------------

export class MockQueryBuilder {
  private tableName: string
  private filters: Array<(row: any) => boolean> = []
  private sortColumn: string | null = null
  private sortAscending = true
  private limitCount: number | null = null

  constructor(tableName: string) {
    this.tableName = tableName
  }

  select(_columns = '*'): this {
    return this
  }

  eq(column: string, value: any): this {
    this.filters.push(row => row[column] === value)
    return this
  }

  neq(column: string, value: any): this {
    this.filters.push(row => row[column] !== value)
    return this
  }

  in(column: string, values: any[]): this {
    this.filters.push(row => Array.isArray(values) && values.includes(row[column]))
    return this
  }

  gte(column: string, value: any): this {
    this.filters.push(row => row[column] >= value)
    return this
  }

  lte(column: string, value: any): this {
    this.filters.push(row => row[column] <= value)
    return this
  }

  or(filterStr: string): this {
    // Basic parser for or clauses like `auth_uid.eq.x,employee_profile_id.eq.x`
    const parts = filterStr.split(',')
    this.filters.push(row => {
      return parts.some(part => {
        const [col, op, val] = part.split('.')
        if (op === 'eq') return row[col] === val
        return false
      })
    })
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.sortColumn = column
    this.sortAscending = options?.ascending ?? true
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  private getData(): any[] {
    if (this.tableName === 'attendance_records') {
      return [...getMockRecords()]
    }
    if (this.tableName === 'employee_profiles' || this.tableName === 'active_employees_directory') {
      const emps = getMockEmployees()
      return this.tableName === 'active_employees_directory' ? emps.filter(e => e.is_active !== false) : [...emps]
    }
    if (this.tableName === 'admin_profiles') {
      return [MOCK_ADMIN_USER]
    }
    if (this.tableName === 'attendance_settings') {
      const s = getMockSettings()
      return Object.entries(s).map(([key, val]) => ({
        setting_key: key,
        setting_value: val,
        updated_at: new Date().toISOString(),
      }))
    }
    if (this.tableName === 'audit_logs') {
      return []
    }
    return []
  }

  async execute(): Promise<{ data: any; error: any }> {
    try {
      let rows = this.getData()
      for (const filter of this.filters) {
        rows = rows.filter(filter)
      }

      if (this.sortColumn) {
        const col = this.sortColumn
        rows.sort((a, b) => {
          if (a[col] < b[col]) return this.sortAscending ? -1 : 1
          if (a[col] > b[col]) return this.sortAscending ? 1 : -1
          return 0
        })
      }

      if (this.limitCount !== null) {
        rows = rows.slice(0, this.limitCount)
      }

      return { data: rows, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  }

  // Promise resolution support
  then(onfulfilled?: (value: { data: any; error: any }) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected)
  }

  async single(): Promise<{ data: any; error: any }> {
    const res = await this.execute()
    if (res.data && res.data.length > 0) {
      return { data: res.data[0], error: null }
    }
    return { data: null, error: { message: 'Row not found', code: 'PGRST116' } }
  }

  async maybeSingle(): Promise<{ data: any; error: any }> {
    const res = await this.execute()
    if (res.data && res.data.length > 0) {
      return { data: res.data[0], error: null }
    }
    return { data: null, error: null }
  }

  // Write operations (Strictly in-memory / sessionStorage)
  async insert(values: any | any[]): Promise<{ data: any; error: any }> {
    const arr = Array.isArray(values) ? values : [values]
    if (this.tableName === 'attendance_records') {
      const records = getMockRecords()
      records.unshift(...arr)
      saveMockRecords(records)
      return { data: arr, error: null }
    }
    if (this.tableName === 'employee_profiles') {
      const emps = getMockEmployees()
      emps.push(...arr)
      saveMockEmployees(emps)
      return { data: arr, error: null }
    }
    return { data: arr, error: null }
  }

  async update(values: any): Promise<{ data: any; error: any }> {
    if (this.tableName === 'attendance_records') {
      const records = getMockRecords()
      let updatedCount = 0
      const updated = records.map(r => {
        const matches = this.filters.every(fn => fn(r))
        if (matches) {
          updatedCount++
          return { ...r, ...values }
        }
        return r
      })
      saveMockRecords(updated)
      return { data: updated, error: null }
    }
    if (this.tableName === 'attendance_settings') {
      const settings = getMockSettings()
      if (values.setting_key && values.setting_value) {
        settings[values.setting_key] = values.setting_value
      }
      saveMockSettings(settings)
      return { data: values, error: null }
    }
    return { data: values, error: null }
  }

  async upsert(values: any): Promise<{ data: any; error: any }> {
    return this.update(values)
  }

  async delete(): Promise<{ data: any; error: any }> {
    if (this.tableName === 'attendance_records') {
      const records = getMockRecords()
      const remaining = records.filter(r => !this.filters.every(fn => fn(r)))
      saveMockRecords(remaining)
      return { data: null, error: null }
    }
    if (this.tableName === 'employee_profiles') {
      const emps = getMockEmployees()
      const remaining = emps.filter(e => !this.filters.every(fn => fn(e)))
      saveMockEmployees(remaining)
      return { data: null, error: null }
    }
    return { data: null, error: null }
  }
}
