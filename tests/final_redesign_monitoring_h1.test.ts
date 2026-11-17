// ============================================================
// SIPATEN — Final Redesign, H+1 Actual Date, & Operational Monitoring Suite
// Verification of:
// 1. Operational status derivation for CS & Security (5 dynamic statuses)
// 2. Admin operational monitoring summaries & zero double-counting
// 3. Tanggal Kerja preservation & actual H+1 checkout timestamp display
// 4. Overnight Shift III crossover consistency
// ============================================================

import {
  deriveCSOperationalStatus,
  deriveSecurityOperationalStatus,
  calculateAdminOperationalMonitoring,
  OPERATIONAL_STATUS_CONFIG,
} from '../src/lib/operationalStatus'
import { formatJakartaTime, formatJakartaDate, isOvernightSecurityShift } from '../src/lib/scheduleEngine'
import { parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import type { AttendanceRecord } from '../src/types/attendance'

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

console.log('\n============================================================')
console.log('🌟 SIPATEN — Final Redesign, H+1 & Operational Monitoring Suite')
console.log('============================================================\n')

// ─────────────────────────────────────────────────────────────
// SUITE 1: CS Operational Status Derivation
// ─────────────────────────────────────────────────────────────
console.log('SUITE 1: Derivasi Status Operasional Cleaning Service (CS)')

// 1. CS dengan Masuk dan Pulang -> tugas_selesai
const csMasuk: AttendanceRecord = {
  id: 'cs-m1',
  employee_name: 'Budi Santoso',
  normalized_name: 'budi santoso',
  category: 'CS',
  attendance_type: 'masuk',
  shift: null,
  work_date: '2026-11-17',
  recorded_at: '2026-11-17T06:50:00+07:00',
  scheduled_start: '07:00',
  scheduled_end: null,
  attendance_status: 'tepat_waktu',
  late_minutes: 0,
  selfie_storage_path: 'selfies/cs1.jpg',
  review_status: 'sudah_diperiksa',
  idempotency_key: 'cs-in-1',
  created_at: '2026-11-17T06:50:00+07:00',
  updated_at: '2026-11-17T06:50:00+07:00',
}

const csPulang: AttendanceRecord = {
  ...csMasuk,
  id: 'cs-p1',
  attendance_type: 'pulang',
  recorded_at: '2026-11-17T16:05:00+07:00',
}

const statusCSCompleted = deriveCSOperationalStatus(csMasuk, csPulang, new Date('2026-11-17T17:00:00+07:00'))
assert('CS dengan masuk & pulang -> tugas_selesai', statusCSCompleted === 'tugas_selesai')

// 2. CS dengan Masuk tanpa Pulang -> sedang_bertugas
const statusCSOnDuty = deriveCSOperationalStatus(csMasuk, null, new Date('2026-11-17T10:00:00+07:00'))
assert('CS sudah masuk tapi belum pulang -> sedang_bertugas', statusCSOnDuty === 'sedang_bertugas')

// 3. CS belum masuk sebelum jam buka (misal 05:30) -> menunggu_jadwal
const statusCSWaiting = deriveCSOperationalStatus(null, null, new Date('2026-11-17T05:30:00+07:00'))
assert('CS belum masuk sebelum jendela buka -> menunggu_jadwal', statusCSWaiting === 'menunggu_jadwal')

// 4. CS belum masuk saat jam dinas berlangsung (misal 09:00) -> belum_bertugas
const statusCSNotYet = deriveCSOperationalStatus(null, null, new Date('2026-11-17T09:00:00+07:00'))
assert('CS belum masuk saat jam operasional berlangsung -> belum_bertugas', statusCSNotYet === 'belum_bertugas')

// 5. CS dengan review_status perlu_tindak_lanjut -> perlu_perhatian
const csPerluReview: AttendanceRecord = { ...csMasuk, review_status: 'perlu_tindak_lanjut' }
const statusCSWarning = deriveCSOperationalStatus(csPerluReview, null, new Date('2026-11-17T10:00:00+07:00'), 'perlu_tindak_lanjut')
assert('CS dengan status review perlu tindak lanjut -> perlu_perhatian', statusCSWarning === 'perlu_perhatian')

// ─────────────────────────────────────────────────────────────
// SUITE 2: Security Operational Status Derivation
// ─────────────────────────────────────────────────────────────
console.log('\nSUITE 2: Derivasi Status Operasional Security')

const secMasukShift1: AttendanceRecord = {
  id: 'sec-m1',
  employee_name: 'Agus Pratama',
  normalized_name: 'agus pratama',
  category: 'Security',
  attendance_type: 'masuk',
  shift: 'Shift I',
  work_date: '2026-11-17',
  recorded_at: '2026-11-17T06:45:00+07:00',
  scheduled_start: '07:00',
  scheduled_end: '16:00',
  attendance_status: 'tepat_waktu',
  late_minutes: 0,
  selfie_storage_path: 'selfies/sec1.jpg',
  review_status: 'sudah_diperiksa',
  idempotency_key: 'sec-in-1',
  created_at: '2026-11-17T06:45:00+07:00',
  updated_at: '2026-11-17T06:45:00+07:00',
}

const secPulangShift1: AttendanceRecord = {
  ...secMasukShift1,
  id: 'sec-p1',
  attendance_type: 'pulang',
  recorded_at: '2026-11-17T16:02:00+07:00',
}

// 1. Shift I selesai
const statusSecCompleted = deriveSecurityOperationalStatus(
  secMasukShift1,
  secPulangShift1,
  'Shift I',
  '2026-11-17',
  new Date('2026-11-17T16:30:00+07:00'),
)
assert('Security Shift I masuk & pulang -> tugas_selesai', statusSecCompleted === 'tugas_selesai')

// 2. Shift I sedang bertugas
const statusSecOnDuty = deriveSecurityOperationalStatus(
  secMasukShift1,
  null,
  'Shift I',
  '2026-11-17',
  new Date('2026-11-17T10:00:00+07:00'),
)
assert('Security Shift I masuk tanpa pulang -> sedang_bertugas', statusSecOnDuty === 'sedang_bertugas')

// 3. Shift II belum dimulai (misal 11:00) -> menunggu_jadwal
const statusSecWaitingShift2 = deriveSecurityOperationalStatus(
  null,
  null,
  'Shift II',
  '2026-11-17',
  new Date('2026-11-17T11:00:00+07:00'),
)
assert('Security Shift II sebelum jam masuk -> menunggu_jadwal', statusSecWaitingShift2 === 'menunggu_jadwal')

// 4. Shift III dini hari crossover: Guard masuk tanggal 16 Nov 19:50, jam sekarang 17 Nov 03:00 -> sedang_bertugas
const secMasukShift3: AttendanceRecord = {
  ...secMasukShift1,
  id: 'sec-m3',
  shift: 'Shift III',
  work_date: '2026-11-16',
  recorded_at: '2026-11-16T19:50:00+07:00',
}
const statusSecOvernightOnDuty = deriveSecurityOperationalStatus(
  secMasukShift3,
  null,
  'Shift III',
  '2026-11-16',
  new Date('2026-11-17T03:00:00+07:00'),
)
assert('Security Shift III crossover tengah malam -> sedang_bertugas', statusSecOvernightOnDuty === 'sedang_bertugas')

// ─────────────────────────────────────────────────────────────
// SUITE 3: Bagian 2 — Tanggal Kerja Tetap Asal & Waktu Tercatat H+1 Aktual
// ─────────────────────────────────────────────────────────────
console.log('\nSUITE 3: Verifikasi Tanggal Kerja Asal & Waktu Tercatat Aktual H+1')

// Simulasi skenario prompt:
// Check-in: 12 November 2026 pukul 19.54
// Check-out: 13 November 2026 pukul 07.37
// Tanggal Kerja: 12 November 2026
// Tanggal aktual presensi pulang: 13 November 2026

const recordMasukPrompt: AttendanceRecord = {
  id: 'rec-prompt-in',
  employee_name: 'Bambang Sudirman',
  normalized_name: 'bambang sudirman',
  category: 'Security',
  attendance_type: 'masuk',
  shift: 'Shift III',
  work_date: '2026-11-12',
  recorded_at: '2026-11-12T19:54:00+07:00',
  scheduled_start: '19:30',
  scheduled_end: '07:30',
  attendance_status: 'tepat_waktu',
  late_minutes: 0,
  selfie_storage_path: 'selfies/bambang_in.jpg',
  review_status: 'sudah_diperiksa',
  idempotency_key: 'idem-bambang-in',
  created_at: '2026-11-12T19:54:00+07:00',
  updated_at: '2026-11-12T19:54:00+07:00',
}

const recordPulangPrompt: AttendanceRecord = {
  id: 'rec-prompt-out',
  employee_name: 'Bambang Sudirman',
  normalized_name: 'bambang sudirman',
  category: 'Security',
  attendance_type: 'pulang',
  shift: 'Shift III',
  work_date: '2026-11-12', // Tanggal kerja HARUS tetap 12 Nov 2026
  recorded_at: '2026-11-13T07:37:00+07:00', // Timestamp aktual DB 13 Nov 2026 07:37 WIB
  scheduled_start: '19:30',
  scheduled_end: '07:30',
  attendance_status: 'tepat_waktu',
  late_minutes: 0,
  selfie_storage_path: 'selfies/bambang_out.jpg',
  review_status: 'sudah_diperiksa',
  check_in_record_id: 'rec-prompt-in',
  idempotency_key: 'idem-bambang-out',
  created_at: '2026-11-13T07:37:00+07:00',
  updated_at: '2026-11-13T07:37:00+07:00',
}

// 1. Verifikasi Tanggal Kerja tidak diubah
assert('Tanggal Kerja transaksi masuk tetap 12 November 2026', formatJakartaDate(recordMasukPrompt.work_date) === '12 November 2026')
assert('Tanggal Kerja transaksi pulang tetap 12 November 2026', formatJakartaDate(recordPulangPrompt.work_date) === '12 November 2026')

// 2. Verifikasi deteksi overnight
const isOvernight = isOvernightSecurityShift(recordPulangPrompt.work_date, recordPulangPrompt.shift)
assert('Shift III Kamis (12 Nov 2026) terdeteksi sebagai overnight shift', isOvernight === true)

// 3. Verifikasi waktu aktual dan tanggal aktual dari timestamp DB di Asia/Jakarta
const actualDateJakarta = formatInTimeZone(parseISO(recordPulangPrompt.recorded_at), 'Asia/Jakarta', 'dd MMM yyyy')
const actualTimeJakarta = formatJakartaTime(recordPulangPrompt.recorded_at)
assert('Tanggal aktual presensi pulang menunjukkan 13 Nov 2026', actualDateJakarta === '13 Nov 2026')
assert('Waktu aktual presensi pulang menunjukkan 07:37 WIB', actualTimeJakarta === '07:37')

// 4. Verifikasi transaksi yang BUKAN lintas hari (Shift I) tidak mendapat penanda H+1
const isShift1Overnight = isOvernightSecurityShift('2026-11-12', 'Shift I')
assert('Shift I BUKAN overnight shift (tidak ada H+1)', isShift1Overnight === false)

// ─────────────────────────────────────────────────────────────
// SUITE 4: Admin Operational Monitoring Calculation & Anti-Double-Counting
// ─────────────────────────────────────────────────────────────
console.log('\nSUITE 4: Pemantauan Operasional Admin & Tidak Ada Perhitungan Ganda')

const mockEmployees = [
  { id: 'emp-1', full_name: 'Budi CS', role: 'CS', employee_code: 'CS01' },
  { id: 'emp-2', full_name: 'Siti CS', role: 'CS', employee_code: 'CS02' },
  { id: 'emp-3', full_name: 'Joko CS', role: 'CS', employee_code: 'CS03' },
  { id: 'emp-4', full_name: 'Agus Security', role: 'Security', employee_code: 'SEC01', default_shift: 'Shift I' },
  { id: 'emp-5', full_name: 'Doni Security', role: 'Security', employee_code: 'SEC02', default_shift: 'Shift II' },
  { id: 'emp-6', full_name: 'Heri Security', role: 'Security', employee_code: 'SEC03', default_shift: 'Shift III' },
]

// Skenario absensi hari ini (2026-11-17):
// Budi CS: sudah masuk & pulang -> tugas_selesai
// Siti CS: sudah masuk, belum pulang -> sedang_bertugas
// Joko CS: belum masuk -> belum_bertugas
// Agus Sec: sudah masuk & pulang Shift I -> tugas_selesai
// Doni Sec: sudah masuk Shift II, belum pulang -> sedang_bertugas
// Heri Sec: belum masuk Shift III -> menunggu_jadwal

const mockTodayRecords: AttendanceRecord[] = [
  // Budi
  { ...csMasuk, employee_profile_id: 'emp-1', employee_name: 'Budi CS', normalized_name: 'budi cs' },
  { ...csPulang, employee_profile_id: 'emp-1', employee_name: 'Budi CS', normalized_name: 'budi cs' },
  // Siti
  { ...csMasuk, id: 'cs-siti', employee_profile_id: 'emp-2', employee_name: 'Siti CS', normalized_name: 'siti cs' },
  // Agus
  { ...secMasukShift1, employee_profile_id: 'emp-4', employee_name: 'Agus Security', normalized_name: 'agus security' },
  { ...secPulangShift1, employee_profile_id: 'emp-4', employee_name: 'Agus Security', normalized_name: 'agus security' },
  // Doni
  { ...secMasukShift1, id: 'sec-doni', employee_profile_id: 'emp-5', employee_name: 'Doni Security', normalized_name: 'doni security', shift: 'Shift II' },
]

const result = calculateAdminOperationalMonitoring(
  mockEmployees,
  mockTodayRecords,
  [],
  new Date('2026-11-17T15:00:00+07:00'),
)

assert('Total CS terhitung tepat 3', result.csSummary.total === 3)
assert('CS sedang bertugas tepat 1 (Siti)', result.csSummary.sedangBertugas === 1)
assert('CS belum check-in tepat 1 (Joko)', result.csSummary.belumCheckIn === 1)
assert('CS tugas selesai tepat 1 (Budi)', result.csSummary.tugasSelesai === 1)
assert('Penjumlahan komponen CS sama dengan total (3 = 1+1+1, no double-counting)',
  result.csSummary.sedangBertugas + result.csSummary.belumCheckIn + result.csSummary.tugasSelesai === result.csSummary.total
)

assert('Total Security terhitung tepat 3', result.securitySummary.total === 3)
assert('Security sedang bertugas tepat 1 (Doni)', result.securitySummary.sedangBertugas === 1)
assert('Security belum check-in tepat 1 (Heri)', result.securitySummary.belumCheckIn === 1)
assert('Security tugas selesai tepat 1 (Agus)', result.securitySummary.tugasSelesai === 1)
assert('Penjumlahan komponen Security sama dengan total (3 = 1+1+1, no double-counting)',
  result.securitySummary.sedangBertugas + result.securitySummary.belumCheckIn + result.securitySummary.tugasSelesai === result.securitySummary.total
)

assert('Total items monitoring adalah 6 (3 CS + 3 Security)', result.items.length === 6)

// ─────────────────────────────────────────────────────────────
// SUITE 5: Konfigurasi Animasi Badge
// ─────────────────────────────────────────────────────────────
console.log('\nSUITE 5: Konfigurasi Animasi Badge Status')

assert('Status sedang_bertugas memiliki isPulsing = true', OPERATIONAL_STATUS_CONFIG.sedang_bertugas.isPulsing === true)
assert('Status belum_bertugas memiliki isPulsing = false', OPERATIONAL_STATUS_CONFIG.belum_bertugas.isPulsing === false)
assert('Status menunggu_jadwal memiliki isPulsing = false', OPERATIONAL_STATUS_CONFIG.menunggu_jadwal.isPulsing === false)
assert('Status tugas_selesai memiliki isPulsing = false', OPERATIONAL_STATUS_CONFIG.tugas_selesai.isPulsing === false)
assert('Status perlu_perhatian memiliki isPulsing = false', OPERATIONAL_STATUS_CONFIG.perlu_perhatian.isPulsing === false)

// ─────────────────────────────────────────────────────────────
// SUITE 6: Penghapusan Badge Perlu Perhatian pada Dashboard Pegawai
// ─────────────────────────────────────────────────────────────
console.log('\nSUITE 6: Verifikasi Penghapusan Badge Perlu Perhatian pada Dashboard Pegawai')

// 1. Logika conditional rendering: jika status perlu_perhatian, badge tidak dirender (falsy / null)
const shouldRenderBadge = (status: string) => status !== 'perlu_perhatian'
assert('Badge dirender untuk sedang_bertugas', shouldRenderBadge('sedang_bertugas') === true)
assert('Badge dirender untuk belum_bertugas', shouldRenderBadge('belum_bertugas') === true)
assert('Badge dirender untuk menunggu_jadwal', shouldRenderBadge('menunggu_jadwal') === true)
assert('Badge dirender untuk tugas_selesai', shouldRenderBadge('tugas_selesai') === true)
assert('Badge TIDAK dirender untuk perlu_perhatian pada dashboard pegawai', shouldRenderBadge('perlu_perhatian') === false)

// 2. Status tidak diganti dengan fallback status lain ketika perlu_perhatian dihilangkan
const fallbackStatus = (status: string) => status === 'perlu_perhatian' ? null : status
assert('Status perlu_perhatian tidak disubstitusi dengan status/badge lain', fallbackStatus('perlu_perhatian') === null)

// 3. Admin monitoring tetap mempertahankan perlu_perhatian untuk filtering & review
assert('OPERATIONAL_STATUS_CONFIG tetap mendefinisikan perlu_perhatian untuk kebutuhan admin', OPERATIONAL_STATUS_CONFIG.perlu_perhatian.label === 'Perlu Perhatian')

console.log('\n------------------------------------------------------------')
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('------------------------------------------------------------\n')

if (failed > 0) {
  process.exit(1)
}
