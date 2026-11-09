/**
 * SIPATEN — Pengujian Menyeluruh Modul Presensi Security SIPATEN
 * 14 Skenario Wajib: Shift & Cross-Day Session, Deteksi Active Record, Anti-Flicker & Keamanan
 *
 * Jalankan dengan: node --import ./scripts/test-loader.mjs tests/security_crossday_active_session.test.ts
 */

import {
  simulateMockSubmitAttendance,
  getMockRecords,
  saveMockRecords,
} from '../src/lib/mockSandbox'
import {
  setMockClock,
  clearMockClock,
} from '../src/lib/mockClock'
import {
  shiftsCompatible,
  canonicalShiftName,
  getAttendanceButtonState,
  isOvernightSecurityShift,
  type SecurityShiftOption,
} from '../src/lib/scheduleEngine'
import type { AttendanceRecord } from '../src/types/attendance'

// Mock sessionStorage in Node.js test environment
const memoryStore = new Map<string, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).sessionStorage = {
  getItem: (key: string) => memoryStore.get(key) || null,
  setItem: (key: string, val: string) => memoryStore.set(key, val),
  removeItem: (key: string) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
}

function clearMockRecords(): void {
  saveMockRecords([])
}

function resetMockSandbox(): void {
  saveMockRecords([])
}

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.error(`  ❌ FAILED: ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

console.log('\n============================================================')
console.log('🛡️  PENGUJIAN MENYELURUH MODUL PRESENSI SECURITY SIPATEN')
console.log('    14 Skenario Wajib Shift & Cross-Day Session')
console.log('============================================================\n')

// ─────────────────────────────────────────────────────────────
// SKENARIO 1: Kamis Shift III → Jumat Check-Out
// Masuk: 19:30–20:00 (Kamis), Pulang: 07:30–08:00 H+1 (Jumat)
// ─────────────────────────────────────────────────────────────
console.log('SKENARIO 1: Kamis Shift III → Jumat Check-Out')
{
  resetMockSandbox()
  const guard = 'Bambang Sudirman'

  // 1a. Check-in Kamis 19:45 WIB
  setMockClock('2026-11-05T19:45:00+07:00') // Kamis malam
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift III',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_thu_in',
    idempotency_key: 'idemp_thu_shift3_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('1a. Kamis 19:45 Shift III check-in berhasil', Boolean(inRes.success))
  assert('1b. Work date Kamis adalah 2026-11-05', inRes.data?.work_date === '2026-11-05')
  assert('1c. Shift tersimpan sebagai Shift III', inRes.data?.shift === 'Shift III')
  const masukId = inRes.data!.id

  // 1b. Cek state di Jumat pagi 07:15 WIB (belum buka window pulang: 07:30)
  setMockClock('2026-11-06T07:15:00+07:00') // Jumat pagi sebelum 07:30
  const btnBefore = getAttendanceButtonState(
    'Security',
    { masuk: inRes.data!, istirahat: null, pulang: null },
    'Shift III',
    '2026-11-05',
    new Date('2026-11-06T07:15:00+07:00')
  )
  assert('1d. Jumat 07:15 tombol pulang waiting_pulang (buka 07:30)', btnBefore.status === 'waiting_pulang')

  // 1c. Check-out di Jumat pagi 07:45 WIB (window pulang: 07:30–08:00 H+1)
  setMockClock('2026-11-06T07:45:00+07:00')
  const btnOpen = getAttendanceButtonState(
    'Security',
    { masuk: inRes.data!, istirahat: null, pulang: null },
    'Shift III',
    '2026-11-05',
    new Date('2026-11-06T07:45:00+07:00')
  )
  assert('1e. Jumat 07:45 tombol pulang can_pulang', btnOpen.status === 'can_pulang')

  const outRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    check_in_record_id: masukId,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_thu_out',
    idempotency_key: 'idemp_thu_shift3_out',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('1f. Jumat 07:45 check-out Shift III berhasil', Boolean(outRes.success))
  assert('1g. Pulang mencatat work_date asli Kamis (2026-11-05)', outRes.data?.work_date === '2026-11-05')
  assert('1h. check_in_record_id terhubung ke record masuk', outRes.data?.check_in_record_id === masukId)
  assert('1i. Status pulang tepat waktu', outRes.data?.attendance_status === 'tepat_waktu')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 2: Jumat Shift I Reguler → Check-Out
// Masuk: 07:00–07:30, Pulang: 16:00–16:30 (hari yang sama)
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 2: Jumat Shift I Reguler → Check-Out')
{
  resetMockSandbox()
  const guard = 'Hendra Security'

  // Check-in Jumat 07:15 WIB
  setMockClock('2026-11-06T07:15:00+07:00')
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_1_reguler',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_reg_in',
    idempotency_key: 'idemp_fri_reg_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('2a. Jumat Shift I Reguler check-in berhasil', Boolean(inRes.success))
  assert('2b. Shift identity adalah shift_1_reguler', inRes.data?.shift === 'shift_1_reguler')
  const masukId = inRes.data!.id

  // Check-out Jumat 16:15 WIB
  setMockClock('2026-11-06T16:15:00+07:00')
  const outRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'shift_1_reguler',
    check_in_record_id: masukId,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_reg_out',
    idempotency_key: 'idemp_fri_reg_out',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('2c. Jumat Shift I Reguler check-out berhasil pukul 16:15', Boolean(outRes.success))
  assert('2d. Pulang record terhubung dengan check_in_record_id', outRes.data?.check_in_record_id === masukId)
  assert('2e. Bukan lintas hari (same day 2026-11-06)', outRes.data?.work_date === '2026-11-06')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 3: Jumat Shift I Panjang (12 Jam) → Check-Out
// Masuk: 07:00–07:30, Pulang: 19:00–19:30 (hari yang sama)
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 3: Jumat Shift I Panjang (12 Jam) → Check-Out')
{
  resetMockSandbox()
  const guard = 'Rudi Santoso'

  // Check-in Jumat 07:15 WIB
  setMockClock('2026-11-06T07:15:00+07:00')
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_1_panjang',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_panjang_in',
    idempotency_key: 'idemp_fri_panjang_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('3a. Jumat Shift I Panjang check-in berhasil', Boolean(inRes.success))
  assert('3b. Shift identity adalah shift_1_panjang', inRes.data?.shift === 'shift_1_panjang')
  const masukId = inRes.data!.id

  // Coba pulang pukul 16:15 WIB (seharusnya DITOLAK karena jendela pulang panjang adalah 19:00–19:30)
  setMockClock('2026-11-06T16:15:00+07:00')
  const outEarly = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'shift_1_panjang',
    check_in_record_id: masukId,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_panjang_early',
    idempotency_key: 'idemp_fri_panjang_early',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('3c. Pulang pukul 16:15 ditolak WINDOW_NOT_OPEN untuk Shift Panjang', !outEarly.success && outEarly.error_code === 'WINDOW_NOT_OPEN')

  // Check-out pukul 19:15 WIB (jendela resmi buka: 19:00–19:30)
  setMockClock('2026-11-06T19:15:00+07:00')
  const outRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'shift_1_panjang',
    check_in_record_id: masukId,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_panjang_out',
    idempotency_key: 'idemp_fri_panjang_out',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('3d. Jumat Shift I Panjang check-out berhasil pukul 19:15', Boolean(outRes.success))
  assert('3e. check_in_record_id terhubung dengan benar', outRes.data?.check_in_record_id === masukId)

  // Verifikasi Shift I Reguler dan Shift I Panjang TIDAK saling tertukar
  assert('3f. shiftsCompatible(reguler, panjang) = false', !shiftsCompatible('shift_1_reguler', 'shift_1_panjang'))
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 4: Jumat Shift II Malam → Sabtu Check-Out
// Masuk: 19:00–19:30 (Jumat), Pulang: 07:00–07:30 H+1 (Sabtu)
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 4: Jumat Shift II Malam → Sabtu Check-Out')
{
  resetMockSandbox()
  const guard = 'Agus Wijaya'

  // Check-in Jumat 19:15 WIB
  setMockClock('2026-11-06T19:15:00+07:00')
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_2_malam',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_fri_malam_in',
    idempotency_key: 'idemp_fri_malam_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('4a. Jumat Shift II Malam check-in berhasil', Boolean(inRes.success))
  const masukId = inRes.data!.id

  // Check-out Sabtu 07:15 WIB (window: 07:00–07:30 H+1)
  setMockClock('2026-11-07T07:15:00+07:00') // Sabtu pagi
  const outRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'shift_2_malam',
    check_in_record_id: masukId,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_fri_malam_out',
    idempotency_key: 'idemp_fri_malam_out',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('4b. Sabtu 07:15 check-out Jumat Shift II Malam berhasil', Boolean(outRes.success))
  assert('4c. work_date tetap Jumat (2026-11-06)', outRes.data?.work_date === '2026-11-06')
  assert('4d. check_in_record_id cocok', outRes.data?.check_in_record_id === masukId)
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 5: Sabtu Shift I Pagi → Check-Out
// Masuk: 07:30–08:00, Pulang: 20:00–20:30 (Sabtu)
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 5: Sabtu Shift I Pagi → Check-Out')
{
  resetMockSandbox()
  const guard = 'Dedi Iskandar'

  setMockClock('2026-11-07T07:45:00+07:00') // Sabtu pagi
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift I',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_sat_pagi_in',
    idempotency_key: 'idemp_sat_pagi_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('5a. Sabtu Shift I Pagi check-in berhasil', Boolean(inRes.success))
  const masukId = inRes.data!.id

  // Check-out Sabtu malam 20:15 WIB
  setMockClock('2026-11-07T20:15:00+07:00')
  const outRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift I',
    check_in_record_id: masukId,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_sat_pagi_out',
    idempotency_key: 'idemp_sat_pagi_out',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('5b. Sabtu Shift I Pagi check-out berhasil pukul 20:15', Boolean(outRes.success))
  assert('5c. work_date Sabtu 2026-11-07', outRes.data?.work_date === '2026-11-07')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 6: Sabtu Shift II Malam → Minggu Check-Out
// Masuk: 20:00–20:30 (Sabtu), Pulang: 07:30–08:00 H+1 (Minggu)
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 6: Sabtu Shift II Malam → Minggu Check-Out')
{
  resetMockSandbox()
  const guard = 'Surya Permana'

  setMockClock('2026-11-07T20:15:00+07:00') // Sabtu malam
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift II',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_sat_malam_in',
    idempotency_key: 'idemp_sat_malam_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('6a. Sabtu Shift II Malam check-in berhasil', Boolean(inRes.success))
  const masukId = inRes.data!.id

  // Check-out Minggu 07:45 WIB (window: 07:30–08:00 H+1)
  setMockClock('2026-11-08T07:45:00+07:00') // Minggu pagi
  const outRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    check_in_record_id: masukId,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_sat_malam_out',
    idempotency_key: 'idemp_sat_malam_out',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('6b. Minggu 07:45 check-out Sabtu Shift II berhasil', Boolean(outRes.success))
  assert('6c. work_date tetap Sabtu 2026-11-07', outRes.data?.work_date === '2026-11-07')
  assert('6d. check_in_record_id terpasang', outRes.data?.check_in_record_id === masukId)
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 7: Minggu Shift I Pagi → Check-Out
// Masuk: 07:30–08:00, Pulang: 20:00–20:30 (Minggu)
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 7: Minggu Shift I Pagi → Check-Out')
{
  resetMockSandbox()
  const guard = 'Tri Haryanto'

  setMockClock('2026-11-08T07:45:00+07:00') // Minggu pagi
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift I',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_sun_pagi_in',
    idempotency_key: 'idemp_sun_pagi_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('7a. Minggu Shift I Pagi check-in berhasil', Boolean(inRes.success))
  const masukId = inRes.data!.id

  // Check-out Minggu malam 20:15 WIB
  setMockClock('2026-11-08T20:15:00+07:00')
  const outRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift I',
    check_in_record_id: masukId,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_sun_pagi_out',
    idempotency_key: 'idemp_sun_pagi_out',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('7b. Minggu Shift I Pagi check-out berhasil pukul 20:15', Boolean(outRes.success))
  assert('7c. work_date Minggu 2026-11-08', outRes.data?.work_date === '2026-11-08')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 8: Minggu Shift II Malam → Senin Check-Out
// Masuk: 20:00–20:30 (Minggu), Pulang: 07:30–08:00 H+1 (Senin)
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 8: Minggu Shift II Malam → Senin Check-Out')
{
  resetMockSandbox()
  const guard = 'Wawan Setiawan'

  setMockClock('2026-11-08T20:15:00+07:00') // Minggu malam
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift II',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_sun_malam_in',
    idempotency_key: 'idemp_sun_malam_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('8a. Minggu Shift II Malam check-in berhasil', Boolean(inRes.success))
  const masukId = inRes.data!.id

  // Check-out Senin 07:45 WIB (window: 07:30–08:00 H+1)
  setMockClock('2026-11-09T07:45:00+07:00') // Senin pagi
  const outRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift II',
    check_in_record_id: masukId,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_sun_malam_out',
    idempotency_key: 'idemp_sun_malam_out',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('8b. Senin 07:45 check-out Minggu Shift II berhasil', Boolean(outRes.success))
  assert('8c. work_date tetap Minggu 2026-11-08', outRes.data?.work_date === '2026-11-08')
  assert('8d. check_in_record_id terpasang dengan benar', outRes.data?.check_in_record_id === masukId)
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 9: Refresh Dashboard Saat Sesi Lintas Hari Aktif
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 9: Refresh Dashboard Saat Sesi Lintas Hari Aktif')
{
  resetMockSandbox()
  const guard = 'Budi Security'

  // Sesi Kamis Shift III dimulai
  setMockClock('2026-11-05T19:45:00+07:00')
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift III',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_refresh',
    idempotency_key: 'idemp_refresh_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('9a. Check-in Kamis Shift III tersimpan', Boolean(inRes.success))
  const masukId = inRes.data!.id

  // Simulasi refresh dashboard pada Jumat pagi 07:15 WIB
  setMockClock('2026-11-06T07:15:00+07:00')
  const allRecords = getMockRecords()
  const today = '2026-11-06'
  const yesterdayStr = '2026-11-05'

  // Logika deteksi Active Record frontend yang telah diperbaiki:
  const secMasukList = allRecords.filter(r => r.employee_name === guard && r.category === 'Security' && r.attendance_type === 'masuk')
  const secPulangList = allRecords.filter(r => r.employee_name === guard && r.category === 'Security' && r.attendance_type === 'pulang')

  const isClosed = (m: AttendanceRecord) => {
    return secPulangList.some(p =>
      (p.check_in_record_id && p.check_in_record_id === m.id) ||
      (!p.check_in_record_id && p.work_date === m.work_date && shiftsCompatible(p.shift, m.shift))
    )
  }

  const unclosedToday = secMasukList.find(r => r.work_date === today && !isClosed(r)) || null
  const unclosedYesterdayOvernight = secMasukList.find(r =>
    r.work_date === yesterdayStr &&
    isOvernightSecurityShift(yesterdayStr, r.shift) &&
    !isClosed(r)
  ) || null

  const activeRecord = unclosedToday || unclosedYesterdayOvernight
  assert('9b. Active record berhasil dideteksi dari hari Kamis', Boolean(activeRecord))
  assert('9c. ID active record cocok dengan check-in Kamis', activeRecord?.id === masukId)
  assert('9d. Shift active record adalah Shift III', activeRecord?.shift === 'Shift III')
  assert('9e. work_date active record adalah 2026-11-05 (Kamis)', activeRecord?.work_date === '2026-11-05')

  // Verifikasi perilaku tombol UI pada Jumat 07:15 WIB (sebelum jendela pulang 07:30 buka)
  const btn0715 = getAttendanceButtonState(
    'Security',
    { masuk: activeRecord!, istirahat: null, pulang: null },
    activeRecord!.shift,
    activeRecord!.work_date,
    new Date('2026-11-06T07:15:00+07:00')
  )
  assert('9f. Tombol presensi pada 07:15 WIB berstatus waiting_pulang (belum buka)', btn0715.status === 'waiting_pulang')
  assert('9g. Pesan tombol menginformasikan jadwal pulang 07.30 WIB', btn0715.title.includes('07.30') || Boolean('message' in btn0715 && btn0715.message?.includes('07.30')))

  // Verifikasi perilaku tombol UI pada Jumat 07:45 WIB (jendela pulang buka)
  const btn0745 = getAttendanceButtonState(
    'Security',
    { masuk: activeRecord!, istirahat: null, pulang: null },
    activeRecord!.shift,
    activeRecord!.work_date,
    new Date('2026-11-06T07:45:00+07:00')
  )
  assert('9h. Tombol presensi pada 07:45 WIB berstatus can_pulang (jendela buka)', btn0745.status === 'can_pulang')
  assert('9i. Judul tombol adalah Ambil Foto & Absen Pulang', btn0745.title === 'Ambil Foto & Absen Pulang')

  // Verifikasi backend memblokir check-in shift Jumat baru saat sesi Kamis masih aktif
  const tryNewShift = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_1_reguler',
    selfie_base64: 'data:image/jpeg;base64,try_new_fri',
    idempotency_key: 'idemp_try_new_fri',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('9j. Check-in shift Jumat baru DITOLAK saat sesi Kamis masih aktif', !tryNewShift.success)
  assert('9k. Error code penolakan adalah ACTIVE_OVERNIGHT_SHIFT_IN_PROGRESS', tryNewShift.error_code === 'ACTIVE_OVERNIGHT_SHIFT_IN_PROGRESS')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 10: Logout dan Login Kembali Saat Sesi Masih Aktif
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 10: Logout dan Login Kembali Saat Sesi Masih Aktif')
{
  resetMockSandbox()
  const guard = 'Joko Security'

  // Check in Jumat malam Shift II Malam pukul 19:15 WIB
  setMockClock('2026-11-06T19:15:00+07:00')
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_2_malam',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_relogin',
    idempotency_key: 'idemp_relogin_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('10a. Check-in awal Jumat Shift II Malam tersimpan', Boolean(inRes.success))
  const checkInId = inRes.data!.id

  // Simulasi login kembali pada Sabtu pagi 07:15 WIB setelah logout sebelumnya
  setMockClock('2026-11-07T07:15:00+07:00')
  const allRecords = getMockRecords()
  const today = '2026-11-07'
  const yesterdayStr = '2026-11-06'

  // Pemulihan sesi aktif dari storage rekaman presensi
  const secMasukList = allRecords.filter(r => r.employee_name === guard && r.category === 'Security' && r.attendance_type === 'masuk')
  const secPulangList = allRecords.filter(r => r.employee_name === guard && r.category === 'Security' && r.attendance_type === 'pulang')
  const isClosed = (m: AttendanceRecord) => secPulangList.some(p => p.check_in_record_id === m.id || (!p.check_in_record_id && p.work_date === m.work_date && shiftsCompatible(p.shift, m.shift)))

  const activeRecord = secMasukList.find(r => r.work_date === today && !isClosed(r)) ||
                       secMasukList.find(r => r.work_date === yesterdayStr && isOvernightSecurityShift(yesterdayStr, r.shift) && !isClosed(r))

  assert('10b. Setelah login kembali, active record Jumat malam ditemukan di storage', Boolean(activeRecord))
  assert('10c. Shift otomatis terkunci ke shift_2_malam', activeRecord?.shift === 'shift_2_malam')
  assert('10d. ID check in tersambung ke record asli', activeRecord?.id === checkInId)

  // Verifikasi tombol UI pada Sabtu 07:15 WIB (jendela 07:00–07:30 H+1 terbuka)
  const btnSat = getAttendanceButtonState(
    'Security',
    { masuk: activeRecord!, istirahat: null, pulang: null },
    activeRecord!.shift,
    activeRecord!.work_date,
    new Date('2026-11-07T07:15:00+07:00')
  )
  assert('10e. Tombol pulang berstatus can_pulang pada Sabtu 07:15 WIB', btnSat.status === 'can_pulang')

  // Eksekusi checkout pasca re-login
  const outRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: activeRecord!.shift,
    check_in_record_id: activeRecord!.id,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_relogin_out',
    idempotency_key: 'idemp_relogin_out',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('10f. Check-out pasca re-login berhasil diproses', Boolean(outRes.success))
  assert('10g. Check-out terhubung ke check_in_record_id asli', outRes.data?.check_in_record_id === checkInId)
  assert('10h. Work date check-out tetap Jumat (2026-11-06)', outRes.data?.work_date === '2026-11-06')

  // Status tombol pasca check-out menjadi completed
  const btnCompleted = getAttendanceButtonState(
    'Security',
    { masuk: activeRecord!, istirahat: null, pulang: outRes.data! },
    activeRecord!.shift,
    activeRecord!.work_date,
    new Date('2026-11-07T07:20:00+07:00')
  )
  assert('10i. Status tombol setelah check-out selesai adalah completed', btnCompleted.status === 'completed')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 11: Mengganti Shift Saat Sesi Aktif
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 11: Mengganti Shift Saat Sesi Aktif')
{
  resetMockSandbox()
  const guard = 'Danang Prabowo'

  // Check-in Senin Shift I 07:15 WIB
  setMockClock('2026-11-02T07:15:00+07:00')
  const inRes = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift I',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_danang_in',
    idempotency_key: 'idemp_danang_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('11a. Check in awal Shift I berhasil', Boolean(inRes.success))

  // Coba check in lagi ke Shift II tanpa check-out dari Shift I
  setMockClock('2026-11-02T15:15:00+07:00')
  const tryChangeShift = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift II',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_danang_shift2',
    idempotency_key: 'idemp_danang_shift2',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('11b. Ganti shift saat sesi aktif DITOLAK oleh backend', !tryChangeShift.success)
  assert('11c. Error code adalah ACTIVE_SESSION_EXISTS', tryChangeShift.error_code === 'ACTIVE_SESSION_EXISTS')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 12: Check-In Ganda dan Check-Out Ganda
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 12: Check-In Ganda dan Check-Out Ganda')
{
  resetMockSandbox()
  const guard = 'Eko Prasetyo'

  setMockClock('2026-11-02T07:15:00+07:00')
  const in1 = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift I',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_eko_in1',
    idempotency_key: 'idemp_eko_in1',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('12a. Check-in pertama berhasil', Boolean(in1.success))

  // Check in ganda pada shift yang sama
  const inDup = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift I',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_eko_in2',
    idempotency_key: 'idemp_eko_in2',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('12b. Check-in ganda DITOLAK DUPLICATE_ATTENDANCE', !inDup.success && inDup.error_code === 'DUPLICATE_ATTENDANCE')

  // Check out pertama
  setMockClock('2026-11-02T16:15:00+07:00')
  const out1 = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift I',
    check_in_record_id: in1.data!.id,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_eko_out1',
    idempotency_key: 'idemp_eko_out1',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('12c. Check-out pertama berhasil', Boolean(out1.success))

  // Check out ganda
  const outDup = simulateMockSubmitAttendance({
    employee_name: guard,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift I',
    check_in_record_id: in1.data!.id,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_eko_out2',
    idempotency_key: 'idemp_eko_out2',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('12d. Check-out ganda DITOLAK DUPLICATE_CHECKOUT', !outDup.success && outDup.error_code === 'DUPLICATE_CHECKOUT')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 13: Data Shift Legacy
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 13: Data Shift Legacy')
{
  assert('13a. canonicalShiftName(Shift 1) = Shift I', canonicalShiftName('Shift 1') === 'Shift I')
  assert('13b. canonicalShiftName(Shift 2) = Shift II', canonicalShiftName('Shift 2') === 'Shift II')
  assert('13c. canonicalShiftName(Shift 3) = Shift III', canonicalShiftName('Shift 3') === 'Shift III')
  assert('13d. canonicalShiftName(Sesi Pagi) = Shift I', canonicalShiftName('Sesi Pagi') === 'Shift I')
  assert('13e. canonicalShiftName(Sesi Malam) = Shift II', canonicalShiftName('Sesi Malam') === 'Shift II')

  // Jumat Legacy
  assert('13f. Legacy Friday Shift I kompatibel dengan shift_1_panjang', shiftsCompatible('Shift I', 'shift_1_panjang'))
  assert('13g. Legacy Friday Shift II kompatibel dengan shift_2_malam', shiftsCompatible('Shift II', 'shift_2_malam'))

  // Isolasi Shift I Reguler
  assert('13h. shift_1_reguler TIDAK kompatibel dengan Shift I lama', !shiftsCompatible('shift_1_reguler', 'Shift I'))
  assert('13i. shift_1_reguler TIDAK kompatibel dengan shift_1_panjang', !shiftsCompatible('shift_1_reguler', 'shift_1_panjang'))
  assert('13j. Label shift_1_reguler terbaca Shift I — Reguler', canonicalShiftName('Shift I — Reguler') === 'shift_1_reguler')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 14: Percobaan Menggunakan ID Check-In Milik Pegawai Lain
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 14: Percobaan Menggunakan ID Check-In Milik Pegawai Lain')
{
  resetMockSandbox()

  // Pegawai A (Ahmad) melakukan check in
  setMockClock('2026-11-02T07:15:00+07:00')
  const ahmadIn = simulateMockSubmitAttendance({
    employee_name: 'Ahmad Dani',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift I',
    selfie_base64: 'data:image/jpeg;base64,mockselfie_ahmad_in',
    idempotency_key: 'idemp_ahmad_in',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  const ahmadRecordId = ahmadIn.data!.id

  // Pegawai B (Budi) mencoba check out dengan check_in_record_id milik Ahmad
  setMockClock('2026-11-02T16:15:00+07:00')
  const budiExploit = simulateMockSubmitAttendance({
    employee_name: 'Budi Santoso',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift I',
    check_in_record_id: ahmadRecordId,
    selfie_base64: 'data:image/jpeg;base64,mockselfie_budi_exploit',
    idempotency_key: 'idemp_budi_exploit',
    latitude: -6.175392,
    longitude: 106.827153,
  })

  assert('14a. Eksploitasi check_in_record_id pegawai lain DITOLAK', !budiExploit.success)
  assert('14b. Error code adalah UNAUTHORIZED_CHECKIN_RECORD', budiExploit.error_code === 'UNAUTHORIZED_CHECKIN_RECORD')

  // Verifikasi record Ahmad tetap aman dan belum check-out
  const currentRecords = getMockRecords()
  const ahmadCheckout = currentRecords.find(r => r.employee_name === 'Ahmad Dani' && r.attendance_type === 'pulang')
  assert('14c. Record Ahmad tetap utuh dan belum check-out', !ahmadCheckout)
}

// ─────────────────────────────────────────────────────────────
// Ringkasan Pengujian
// ─────────────────────────────────────────────────────────────
console.log('\n============================================================')
console.log(`HASIL PENGUJIAN: ${passed} LULUS, ${failed} GAGAL`)
console.log('============================================================\n')

clearMockClock()
if (failed > 0) {
  process.exit(1)
}
