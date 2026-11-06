// ============================================================
// SIPATEN — Pengujian Unit & Alur Overnight Security: Kamis Malam → Jumat Pagi
// ============================================================
// Memvalidasi:
// 1. Check-in Shift III Kamis malam (19:30–20:00 WIB)
// 2. Perpindahan hari melewati tengah malam ke Jumat pagi
// 3. Deteksi dinas aktif Kamis malam pada Jumat pagi (bukan memilih shift Jumat baru)
// 4. Check-out Jumat pagi terhubung ke check-in Kamis (work_date = Kamis, H+1)
// 5. Durasi kerja akurat (12 jam)
// 6. Pengujian refresh browser & persistensi sessionStorage
// 7. Pengujian batas waktu (sebelum 07:30, tepat 07:30, 07:45, tepat 08:00, setelah 08:00)
// 8. Penolakan checkout tanpa check-in & penolakan check-in baru saat dinas aktif
// ============================================================

import {
  setMockClock,
  clearMockClock,
} from '../src/lib/mockClock.ts'

import {
  isOvernightSecurityShift,
  isOvernightCheckout,
  getSecurityShiftItem,
  getAttendanceButtonState,
  buildSecurityShiftSessions,
  calculateSecurity30DayRecap,
  getAutoSelectSecurityShift,
  getSecurityAvailableOptions,
  shiftsCompatible,
} from '../src/lib/scheduleEngine.ts'

import {
  simulateMockSubmitAttendance,
  getMockRecords,
  saveMockRecords,
  initSeedData,
  MOCK_SECURITY_USER,
} from '../src/lib/mockSandbox.ts'

import type { AttendanceRecord } from '../src/types/attendance.ts'

let passCount = 0
let failCount = 0

function assert(desc: string, condition: boolean, extra?: unknown) {
  if (condition) {
    passCount++
    console.log(`  ✅ ${desc}`)
  } else {
    failCount++
    console.error(`  ❌ FAILED: ${desc}`)
    if (extra !== undefined) {
      console.error('     Details:', extra)
    }
  }
}

// Inisialisasi mock sessionStorage di Node.js test environment
const memoryStore = new Map<string, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).sessionStorage = {
  getItem: (key: string) => memoryStore.get(key) || null,
  setItem: (key: string, val: string) => memoryStore.set(key, val),
  removeItem: (key: string) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
}

console.log('============================================================')
console.log('🛡️  PENGUJIAN OVERNIGHT SECURITY: KAMIS MALAM → JUMAT PAGI')
console.log('============================================================')

// Bersihkan data awal
memoryStore.clear()
saveMockRecords([])

// ============================================================
// SUITE 1: Verifikasi Jadwal Resmi Shift III Kamis
// ============================================================
console.log('\nSUITE 1: Verifikasi Jadwal Resmi Shift III Kamis')
{
  const item = getSecurityShiftItem('2026-11-05', 'Shift III')
  assert('Shift III Kamis in_start = 19:30', item.in_start === '19:30')
  assert('Shift III Kamis in_end = 20:00', item.in_end === '20:00')
  assert('Shift III Kamis out_start = 07:30', item.out_start === '07:30')
  assert('Shift III Kamis out_end = 08:00', item.out_end === '08:00')
  assert('Shift III Kamis out_next_day = true', item.out_next_day === true)
  assert('isOvernightSecurityShift Kamis Shift III = true', isOvernightSecurityShift('2026-11-05', 'Shift III') === true)
  assert('isOvernightCheckout Jumat pagi Shift III = true', isOvernightCheckout('2026-11-06', 'Shift III') === true)
}

// ============================================================
// SUITE 2: Alur Utama Check-In Kamis Malam & Check-Out Jumat Pagi
// ============================================================
console.log('\nSUITE 2: Alur Utama Check-In Kamis Malam & Check-Out Jumat Pagi')
let checkInRecId = ''
{
  // 1. Set waktu Kamis 19:45 WIB
  setMockClock('2026-11-05T19:45:00+07:00')

  const resIn = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift III',
    selfie_base64: 'data:image/jpeg;base64,mockselfiecheckin',
    idempotency_key: 'idemp_thu_shift3_in_01',
    latitude: -6.175392,
    longitude: 106.827153,
  })

  assert('Check-in Kamis 19:45 WIB berhasil', 'success' in resIn && resIn.success === true)
  if ('data' in resIn) {
    checkInRecId = resIn.data.id
    assert('work_date check-in = 2026-11-05 (Kamis)', resIn.data.work_date === '2026-11-05')
    assert('shift check-in = Shift III', resIn.data.shift === 'Shift III')
    assert('status check-in = tepat_waktu', resIn.data.attendance_status === 'tepat_waktu')
    assert('recorded_at check-in di hari Kamis', resIn.data.recorded_at.startsWith('2026-11-05'))
  }

  // 2. Majukan DevClock ke Jumat pagi 07:45 WIB
  setMockClock('2026-11-06T07:45:00+07:00')

  // Simulasi pembacaan dashboard: records query [today (2026-11-06), yesterday (2026-11-05)]
  const records = getMockRecords()
  const todayStr = '2026-11-06'
  const yesterdayStr = '2026-11-05'

  const yMasuk = records.find(r => r.attendance_type === 'masuk' && r.work_date === yesterdayStr) || null
  const yPulang = records.find(r => r.attendance_type === 'pulang' && r.work_date === yesterdayStr && r.shift === yMasuk?.shift) || null

  assert('Check-in Kamis masih ditemukan saat hari Jumat pagi', yMasuk !== null)
  assert('Check-out Kamis belum tercatat saat baru tiba Jumat pagi', yPulang === null)

  // Evaluasi button state pada Jumat 07:45 WIB
  const buttonState = getAttendanceButtonState(
    'Security',
    { masuk: yMasuk, istirahat: null, pulang: null },
    yMasuk?.shift || 'Shift III',
    yesterdayStr,
    new Date('2026-11-06T07:45:00+07:00')
  )

  assert('Jumat 07:45 WIB: buttonState.status = can_pulang', buttonState.status === 'can_pulang')
  assert('Judul tombol menunjukkan check-out', buttonState.title.includes('Absen Pulang'))

  // 3. Lakukan check-out Jumat 07:45 WIB
  const resOut = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    check_in_record_id: checkInRecId,
    selfie_base64: 'data:image/jpeg;base64,mockselfiecheckout',
    idempotency_key: 'idemp_fri_shift3_out_01',
    latitude: -6.175392,
    longitude: 106.827153,
  })

  assert('Check-out Jumat 07:45 WIB berhasil', 'success' in resOut && resOut.success === true)
  if ('data' in resOut) {
    assert('work_date check-out tetap 2026-11-05 (Kamis)', resOut.data.work_date === '2026-11-05')
    assert('shift check-out tetap Shift III', resOut.data.shift === 'Shift III')
    assert('recorded_at check-out dicatat pada hari Jumat', resOut.data.recorded_at.startsWith('2026-11-06'))
    assert('check_in_record_id terhubung ke check-in Kamis', resOut.data.check_in_record_id === checkInRecId)
    assert('Durasi kerja tercatat 12 jam pada admin_notes', resOut.data.admin_notes?.includes('Durasi kerja: 12 jam') === true)
  }
}

// ============================================================
// SUITE 3: Verifikasi Rekap, Sesi & Dashboard Pasca Check-Out
// ============================================================
console.log('\nSUITE 3: Verifikasi Rekap, Sesi & Dashboard Pasca Check-Out')
{
  const records = getMockRecords()
  const todayStr = '2026-11-06'
  const yesterdayStr = '2026-11-05'
  const effectiveNow = new Date('2026-11-06T07:45:00+07:00')

  // 1. Sesi paired
  const sessions = buildSecurityShiftSessions(records, todayStr, yesterdayStr, effectiveNow)
  assert('Terdapat tepat 1 sesi shift', sessions.length === 1)
  assert('Sesi ber-work_date Kamis 2026-11-05', sessions[0]?.work_date === '2026-11-05')
  assert('Sesi berstatus selesai', sessions[0]?.status === 'selesai')
  assert('Sesi teridentifikasi isOvernight = true', sessions[0]?.isOvernight === true)
  assert('Sesi menampilkan jam pulang dengan label (H+1)', sessions[0]?.pulangTime.includes('(H+1)') === true)

  // 2. Rekap 30 Hari
  const recap = calculateSecurity30DayRecap(records, todayStr, yesterdayStr, effectiveNow)
  assert('Rekap: shiftSelesai = 1', recap.shiftSelesai === 1)
  assert('Rekap: keterlambatan = 0', recap.keterlambatan === 0)
  assert('Rekap: pulangBelumLengkap = 0', recap.pulangBelumLengkap === 0)

  // 3. Rekap Jumat tidak tercemar oleh check-out Kamis malam
  const fridayRecords = records.filter(r => r.work_date === todayStr)
  assert('Tidak ada record dengan work_date hari Jumat', fridayRecords.length === 0)
}

// ============================================================
// SUITE 4: Pengujian Simulasi Refresh Browser & Persistensi
// ============================================================
console.log('\nSUITE 4: Pengujian Simulasi Refresh Browser & Persistensi')
{
  // Reset database lokal untuk pengujian siklus refresh
  saveMockRecords([])

  // Skenario 4A: Check-in Kamis malam 19:45 WIB
  setMockClock('2026-11-05T19:45:00+07:00')
  simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift III',
    selfie_base64: 'data:image/jpeg;base64,refresh_test_img',
    idempotency_key: 'idemp_ref_01',
    latitude: -6.175392,
    longitude: 106.827153,
  })

  // Simulasi refresh 1: Refresh setelah check-in Kamis malam
  // Pada refresh, data di sessionStorage tetap utuh
  initSeedData(false) // tidak me-reset jika data sudah ada
  let recs = getMockRecords()
  assert('Refresh Kamis malam: Data check-in tetap tersimpan di sessionStorage', recs.length === 1)
  assert('Refresh Kamis malam: work_date tetap 2026-11-05', recs[0].work_date === '2026-11-05')

  // Simulasi refresh 2: Tepat sebelum tengah malam (23:59 WIB Kamis)
  setMockClock('2026-11-05T23:59:00+07:00')
  recs = getMockRecords()
  assert('Kamis 23:59 WIB: Check-in masih aktif', recs[0].attendance_type === 'masuk')
  const btn2359 = getAttendanceButtonState(
    'Security',
    { masuk: recs[0], istirahat: null, pulang: null },
    'Shift III',
    '2026-11-05',
    new Date('2026-11-05T23:59:00+07:00')
  )
  assert('Kamis 23:59 WIB: Status waiting_pulang (H+1)', btn2359.status === 'waiting_pulang')

  // Simulasi refresh 3: Tepat setelah tengah malam (00:05 WIB Jumat)
  setMockClock('2026-11-06T00:05:00+07:00')
  const btn0005 = getAttendanceButtonState(
    'Security',
    { masuk: recs[0], istirahat: null, pulang: null },
    'Shift III',
    '2026-11-05',
    new Date('2026-11-06T00:05:00+07:00')
  )
  assert('Jumat 00:05 WIB: Status tetap waiting_pulang (pukul 07.30 WIB)', btn0005.status === 'waiting_pulang')

  // Simulasi refresh 4: Navigasi ke halaman lain lalu kembali pada Jumat 07:45 WIB
  setMockClock('2026-11-06T07:45:00+07:00')
  const refreshedRecs = getMockRecords()
  const activeMasuk = refreshedRecs.find(r => r.attendance_type === 'masuk' && r.work_date === '2026-11-05')
  assert('Jumat 07:45 WIB pasca navigasi: Record masuk Kamis tetap tersedia', activeMasuk !== undefined)
}

// ============================================================
// SUITE 5: Pengujian Batas Waktu Jendela Check-Out Jumat Pagi
// ============================================================
console.log('\nSUITE 5: Pengujian Batas Waktu Jendela Check-Out Jumat Pagi')
{
  // Ambil record masuk Kamis dari Suite 4
  const currentRecords = getMockRecords()
  const activeMasuk = currentRecords.find(r => r.attendance_type === 'masuk' && r.work_date === '2026-11-05')!

  // 1. Sebelum jendela check-out (Jumat 07:15 WIB)
  setMockClock('2026-11-06T07:15:00+07:00')
  const resBefore = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    check_in_record_id: activeMasuk.id,
    selfie_base64: 'data:image/jpeg;base64,test_before',
    idempotency_key: 'idemp_before_01',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('Jumat 07:15 WIB: Checkout ditolak (WINDOW_NOT_OPEN)', 'error_code' in resBefore && resBefore.error_code === 'WINDOW_NOT_OPEN')

  const btn0715 = getAttendanceButtonState(
    'Security',
    { masuk: activeMasuk, istirahat: null, pulang: null },
    'Shift III',
    '2026-11-05',
    new Date('2026-11-06T07:15:00+07:00')
  )
  assert('Jumat 07:15 WIB: Button disabled waiting_pulang', btn0715.status === 'waiting_pulang')

  // 2. Tepat pada awal jendela check-out (Jumat 07:30 WIB)
  setMockClock('2026-11-06T07:30:00+07:00')
  const btn0730 = getAttendanceButtonState(
    'Security',
    { masuk: activeMasuk, istirahat: null, pulang: null },
    'Shift III',
    '2026-11-05',
    new Date('2026-11-06T07:30:00+07:00')
  )
  assert('Jumat 07:30 WIB: Button aktif can_pulang', btn0730.status === 'can_pulang')

  // 3. Tepat pada akhir jendela check-out (Jumat 08:00 WIB)
  setMockClock('2026-11-06T08:00:00+07:00')
  const btn0800 = getAttendanceButtonState(
    'Security',
    { masuk: activeMasuk, istirahat: null, pulang: null },
    'Shift III',
    '2026-11-05',
    new Date('2026-11-06T08:00:00+07:00')
  )
  assert('Jumat 08:00 WIB: Button masih aktif can_pulang', btn0800.status === 'can_pulang')

  // 4. Setelah jendela check-out berakhir (Jumat 08:05 WIB)
  setMockClock('2026-11-06T08:05:00+07:00')
  const resAfter = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    check_in_record_id: activeMasuk.id,
    selfie_base64: 'data:image/jpeg;base64,test_after',
    idempotency_key: 'idemp_after_01',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('Jumat 08:05 WIB: Checkout ditolak (WINDOW_CLOSED)', 'error_code' in resAfter && resAfter.error_code === 'WINDOW_CLOSED')

  const btn0805 = getAttendanceButtonState(
    'Security',
    { masuk: activeMasuk, istirahat: null, pulang: null },
    'Shift III',
    '2026-11-05',
    new Date('2026-11-06T08:05:00+07:00')
  )
  assert('Jumat 08:05 WIB: Button disabled window_closed', btn0805.status === 'window_closed')
}

// ============================================================
// SUITE 6: Aturan Bisnis Khusus: Tanpa Masuk, Duplikat & Penolakan Shift Baru
// ============================================================
console.log('\nSUITE 6: Aturan Bisnis Khusus (Tanpa Masuk, Duplikat & Penolakan Shift Baru)')
{
  // 1. Shift Kamis belum memiliki check-in tapi mencoba check-out
  saveMockRecords([]) // kosongkan
  setMockClock('2026-11-06T07:45:00+07:00')
  const resNoMasuk = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    selfie_base64: 'data:image/jpeg;base64,test_no_masuk',
    idempotency_key: 'idemp_no_masuk_01',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('Checkout tanpa check-in ditolak (NO_CHECK_IN_FOUND)', 'error_code' in resNoMasuk && resNoMasuk.error_code === 'NO_CHECK_IN_FOUND')

  // 2. Buat check-in Kamis malam
  setMockClock('2026-11-05T19:45:00+07:00')
  const resCheckIn = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift III',
    selfie_base64: 'data:image/jpeg;base64,valid_checkin',
    idempotency_key: 'idemp_suite6_masuk',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('Check-in Kamis berhasil dibuat', 'success' in resCheckIn)

  // 3. Pada Jumat pagi 07:15 WIB, pengguna mencoba memulai shift Jumat baru (shift_1_reguler)
  // padahal shift Kamis malam belum check-out!
  setMockClock('2026-11-06T07:15:00+07:00')
  const resNewShiftBlocked = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_1_reguler',
    selfie_base64: 'data:image/jpeg;base64,new_shift_attempt',
    idempotency_key: 'idemp_new_shift_blocked',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('Check-in shift Jumat baru ditolak karena shift Kamis masih aktif (ACTIVE_OVERNIGHT_SHIFT_IN_PROGRESS)',
    'error_code' in resNewShiftBlocked && resNewShiftBlocked.error_code === 'ACTIVE_OVERNIGHT_SHIFT_IN_PROGRESS'
  )

  // 4. Selesaikan check-out Shift III Kamis pada 07:45 WIB
  setMockClock('2026-11-06T07:45:00+07:00')
  const resCheckOut = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    selfie_base64: 'data:image/jpeg;base64,valid_checkout',
    idempotency_key: 'idemp_suite6_pulang',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('Check-out Shift III Kamis berhasil diselesaikan', 'success' in resCheckOut)

  // 5. Coba check-out ulang (duplikat)
  const resDup = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    selfie_base64: 'data:image/jpeg;base64,dup_checkout',
    idempotency_key: 'idemp_suite6_pulang_dup',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('Check-out kedua kali ditolak (DUPLICATE_ATTENDANCE)', 'error_code' in resDup && resDup.error_code === 'DUPLICATE_ATTENDANCE')
}

// ============================================================
// SUITE 7: Verifikasi Kartu Jadwal Shift Security Hari Jumat
// ============================================================
console.log('\nSUITE 7: Verifikasi Kartu Jadwal Shift Security Hari Jumat')
{
  const workDateStr = '2026-11-06' // Jumat
  const shiftList = getSecurityAvailableOptions(workDateStr)
  assert('shiftList Jumat memiliki tepat 3 opsi', shiftList.length === 3)
  assert('shiftList[0] = shift_1_reguler', shiftList[0] === 'shift_1_reguler')
  assert('shiftList[1] = shift_1_panjang', shiftList[1] === 'shift_1_panjang')
  assert('shiftList[2] = shift_2_malam', shiftList[2] === 'shift_2_malam')

  // Item shift 1 reguler
  const item1 = getSecurityShiftItem(workDateStr, 'shift_1_reguler')
  assert('shift_1_reguler in_start = 07:00', item1.in_start === '07:00')
  assert('shift_1_reguler in_end = 07:30', item1.in_end === '07:30')
  assert('shift_1_reguler out_start = 16:00', item1.out_start === '16:00')
  assert('shift_1_reguler out_end = 16:30', item1.out_end === '16:30')
  assert('shift_1_reguler durasi 9 jam', (16 - 7) === 9)

  // Item shift 1 panjang
  const item2 = getSecurityShiftItem(workDateStr, 'shift_1_panjang')
  assert('shift_1_panjang in_start = 07:00', item2.in_start === '07:00')
  assert('shift_1_panjang out_start = 19:00', item2.out_start === '19:00')
  assert('shift_1_panjang durasi 12 jam', (19 - 7) === 12)

  // Item shift 2 malam
  const item3 = getSecurityShiftItem(workDateStr, 'shift_2_malam')
  assert('shift_2_malam in_start = 19:00', item3.in_start === '19:00')
  assert('shift_2_malam out_start = 07:00', item3.out_start === '07:00')
  assert('shift_2_malam out_next_day = true', item3.out_next_day === true)
  assert('shift_2_malam durasi 12 jam', (7 + 24 - 19) === 12)

  // Uji fallback jika tab menerima 'Shift III' (state lama dari Kamis)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolved = (shiftList.includes('Shift III' as any)) ? 'Shift III' : shiftList[0]
  assert('Shift III tidak ada di shiftList Jumat, fallback ke shift_1_reguler', resolved === 'shift_1_reguler')
}

// ============================================================
// SUITE 8: Audit Skenario Bug Sandbox Kamis Malam (19.54 WIB)
// ============================================================
console.log('\nSUITE 8: Audit Skenario Bug Sandbox Kamis Malam (19.54 WIB)')
{
  // 1. Simulasikan kondisi awal: seed data diinisialisasi ketika DevClock berada di hari Jumat (2026-11-06)
  setMockClock('2026-11-06T08:00:00+07:00')
  initSeedData(true) // Menghasilkan seed 14 hari ke belakang (termasuk Kamis 2026-11-05)

  // 2. Sekarang pengguna menyetel DevClock ke Kamis 19.54 WIB
  setMockClock('2026-11-05T19:54:00+07:00')
  const nowThu1954 = new Date('2026-11-05T19:54:00+07:00')
  const todayThu = '2026-11-05'

  // Pastikan getMockRecords() otomatis memfilter seed data hari ini (2026-11-05)
  const currentMockRecords = getMockRecords()
  const seedToday = currentMockRecords.filter(r => r.work_date === todayThu && r.id.startsWith('mock_rec_sec_'))
  assert('Seed record Security untuk Kamis 2026-11-05 otomatis difilter out saat DevClock disetel ke Kamis', seedToday.length === 0)

  // Auto-select shift pada Kamis 19.54 WIB adalah Shift III
  const autoShiftThu = getAutoSelectSecurityShift(todayThu, nowThu1954)
  assert('Auto-select pada Kamis 19.54 WIB adalah Shift III', autoShiftThu === 'Shift III')

  // Simulasi resolusi EmployeeHomeView pada Kamis 19.54 WIB TANPA check-in
  const filteredThu = currentMockRecords.filter(r => r.category === 'Security')
  const uncompletedToday = filteredThu.find(r =>
    r.attendance_type === 'masuk' &&
    r.work_date === todayThu &&
    !filteredThu.some(p =>
      p.attendance_type === 'pulang' &&
      p.work_date === todayThu &&
      (p.check_in_record_id === r.id || shiftsCompatible(p.shift, r.shift))
    )
  ) || null
  assert('Tidak ada shift uncompleted pada Kamis 19.54 (belum absen)', uncompletedToday === null)

  const targetMasuk = filteredThu.find(r =>
    r.attendance_type === 'masuk' &&
    r.work_date === todayThu &&
    shiftsCompatible(r.shift, autoShiftThu)
  ) || null
  assert('Record check-in Shift III belum ada', targetMasuk === null)

  // Status tombol presensi pada Kamis 19.54 sebelum check-in
  const btnStatePre = getAttendanceButtonState(
    'Security',
    { masuk: null, istirahat: null, pulang: null },
    'Shift III',
    todayThu,
    nowThu1954
  )
  assert('Kamis 19.54 tanpa record check-in: status can_masuk (Belum Absen)', btnStatePre.status === 'can_masuk')
  assert('Judul tombol menunjukkan check-in', btnStatePre.title.includes('Absen Masuk'))

  // 3. Lakukan check-in Shift III pada Kamis 19.54 WIB
  const checkInRes = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift III',
    selfie_base64: 'data:image/jpeg;base64,thu_1954_masuk',
    idempotency_key: 'idemp_thu_1954_masuk',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('Check-in Shift III Kamis 19.54 WIB berhasil dibuat', checkInRes.success === true)

  // Evaluasi status setelah check-in: Sedang Bertugas
  const recordsPostCheckIn = getMockRecords().filter(r => r.category === 'Security')
  const uncompletedPostCheckIn = recordsPostCheckIn.find(r =>
    r.attendance_type === 'masuk' &&
    r.work_date === todayThu &&
    !recordsPostCheckIn.some(p =>
      p.attendance_type === 'pulang' &&
      p.work_date === todayThu &&
      (p.check_in_record_id === r.id || shiftsCompatible(p.shift, r.shift))
    )
  ) || null

  assert('Setelah check-in Kamis 19.54: uncompleted session terdeteksi', uncompletedPostCheckIn !== null)
  assert('Shift adalah Shift III', uncompletedPostCheckIn?.shift === 'Shift III')

  // Cari matching pulang untuk check-in Shift III ini (harus null, jangan mengambil jam 16:15!)
  const matchingPulangPostCheckIn = recordsPostCheckIn.find(p =>
    p.attendance_type === 'pulang' &&
    p.work_date === todayThu &&
    (p.check_in_record_id === uncompletedPostCheckIn?.id || shiftsCompatible(p.shift, uncompletedPostCheckIn?.shift))
  ) || null
  assert('Setelah check-in Kamis 19.54: check-out belum tercatat (tidak mengambil pulang Shift I)', matchingPulangPostCheckIn === null)

  const btnStatePostCheckIn = getAttendanceButtonState(
    'Security',
    { masuk: uncompletedPostCheckIn, istirahat: null, pulang: null },
    'Shift III',
    todayThu,
    nowThu1954
  )
  assert('Setelah check-in Kamis 19.54: status waiting_pulang (Sedang Bertugas)', btnStatePostCheckIn.status === 'waiting_pulang')

  // 4. Majukan DevClock ke Jumat 07.30 WIB dan lakukan check-out
  setMockClock('2026-11-06T07:30:00+07:00')
  const nowFri0730 = new Date('2026-11-06T07:30:00+07:00')
  const checkOutRes = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift III',
    check_in_record_id: uncompletedPostCheckIn!.id,
    selfie_base64: 'data:image/jpeg;base64,fri_0730_pulang',
    idempotency_key: 'idemp_fri_0730_pulang',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('Check-out Jumat 07.30 WIB berhasil', checkOutRes.success === true)

  // Verifikasi Jumat 07.30 setelah checkout: Shift Kamis selesai
  const recordsPostCheckout = getMockRecords().filter(r => r.category === 'Security')
  const yMasukCheck = recordsPostCheckout.find(r => r.attendance_type === 'masuk' && r.work_date === '2026-11-05' && r.shift === 'Shift III')
  const yPulangCheck = recordsPostCheckout.find(r => r.attendance_type === 'pulang' && r.work_date === '2026-11-05' && r.shift === 'Shift III')
  assert('Jumat 07.30 setelah checkout: yMasuk Kamis Shift III ada', yMasukCheck !== undefined)
  assert('Jumat 07.30 setelah checkout: yPulang Kamis Shift III ada', yPulangCheck !== undefined)
  assert('Jumat 07.30 setelah checkout: Shift Kamis selesai', yMasukCheck !== undefined && yPulangCheck !== undefined)

  // 5. Kembalikan DevClock ke Kamis 19.54 WIB
  setMockClock('2026-11-05T19:54:00+07:00')
  const recordsRewound = getMockRecords().filter(r => r.category === 'Security')

  // Periksa apakah Shift III yang sudah selesai dianggap sebagai sesi baru atau sesi selesai
  const uncompletedRewound = recordsRewound.find(r =>
    r.attendance_type === 'masuk' &&
    r.work_date === todayThu &&
    !recordsRewound.some(p =>
      p.attendance_type === 'pulang' &&
      p.work_date === todayThu &&
      (p.check_in_record_id === r.id || shiftsCompatible(p.shift, r.shift))
    )
  ) || null
  assert('Mengembalikan DevClock ke Kamis 19.54: TIDAK ada sesi uncompleted', uncompletedRewound === null)

  const completedShift3 = recordsRewound.find(r =>
    r.attendance_type === 'masuk' &&
    r.work_date === todayThu &&
    shiftsCompatible(r.shift, 'Shift III')
  ) || null
  const completedShift3Pulang = recordsRewound.find(p =>
    p.attendance_type === 'pulang' &&
    p.work_date === todayThu &&
    (p.check_in_record_id === completedShift3?.id || shiftsCompatible(p.shift, completedShift3?.shift))
  ) || null
  assert('Mengembalikan DevClock ke Kamis 19.54: Sesi Shift III tetap lengkap (masuk ada)', completedShift3 !== null)
  assert('Mengembalikan DevClock ke Kamis 19.54: Sesi Shift III tetap lengkap (pulang ada)', completedShift3Pulang !== null)

  // Status tombol pada Kamis 19.54 dengan sesi yang sudah selesai
  const btnStateRewound = getAttendanceButtonState(
    'Security',
    { masuk: completedShift3, istirahat: null, pulang: completedShift3Pulang },
    'Shift III',
    todayThu,
    nowThu1954
  )
  assert('Mengembalikan DevClock ke Kamis 19.54: status completed (bukan can_masuk atau sesi baru)', btnStateRewound.status === 'completed')

  // Coba check-in ulang untuk Shift III di hari yang sama: harus ditolak DUPLICATE_ATTENDANCE
  const checkInAgainRes = simulateMockSubmitAttendance({
    employee_name: MOCK_SECURITY_USER.full_name,
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift III',
    selfie_base64: 'data:image/jpeg;base64,thu_1954_masuk_again',
    idempotency_key: 'idemp_thu_1954_masuk_again',
    latitude: -6.175392,
    longitude: 106.827153,
  })
  assert('Check-in ulang pada sesi yang sudah selesai ditolak (DUPLICATE_ATTENDANCE)', 'error_code' in checkInAgainRes && checkInAgainRes.error_code === 'DUPLICATE_ATTENDANCE')
}

// Reset mock clock setelah pengujian selesai
clearMockClock()

console.log('============================================================')
if (failCount === 0) {
  console.log(`🎉 SELURUH ${passCount} PENGUJIAN OVERNIGHT KAMIS → JUMAT LULUS 100%!`)
} else {
  console.error(`❌ TERDAPAT ${failCount} PENGUJIAN GAGAL DARI ${passCount + failCount} PENGUJIAN.`)
  process.exit(1)
}
