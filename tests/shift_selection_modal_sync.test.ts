/**
 * SIPATEN — Pengujian Sinkronisasi Modal Pilih Shift & Dashboard Security
 * Memverifikasi:
 * 1. Senin, 9 November 2026: Shift I, Shift II, Shift III (tidak ada Shift II - Malam)
 * 2. Kamis: Shift I, Shift II, Shift III
 * 3. Jumat: Shift I Reguler, Shift I Panjang, Shift II Malam
 * 4. Sabtu: Shift I Pagi, Shift II Malam
 * 5. Minggu: Shift I Pagi, Shift II Malam
 * 6. Keselarasan jadwal antara Dashboard dan Modal (sumber konfigurasi identik)
 * 7. Tidak ada pilihan shift ganda atau salah label
 * 8. Reaktivitas DevClock tanpa reload
 * 9. CS tidak terpengaruh sama sekali
 */

import {
  getSecurityAvailableOptions,
  getSecurityShiftItem,
  getSecurityShiftCheckInStatus,
  getSecurityShiftDisplayLabel,
  getAutoSelectSecurityShift,
  DEFAULT_DAY_GROUPS,
  getCSScheduleSync,
  type SecurityShiftOption,
} from '../src/lib/scheduleEngine'
import {
  setMockClock,
  clearMockClock,
  getEffectiveNow,
  subscribeToMockClock,
} from '../src/lib/mockClock'
import { simulateMockSubmitAttendance } from '../src/lib/mockSandbox'

// Polyfill sessionStorage in Node.js test environment
const memoryStore = new Map<string, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).sessionStorage = {
  getItem: (key: string) => memoryStore.get(key) || null,
  setItem: (key: string, val: string) => memoryStore.set(key, val),
  removeItem: (key: string) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
}

let passed = 0
let failed = 0

function assert(desc: string, condition: boolean, extra?: unknown) {
  if (condition) {
    passed++
    console.log(`  ✅ ${desc}`)
  } else {
    failed++
    console.error(`  ❌ FAILED: ${desc}`)
    if (extra !== undefined) {
      console.error('     Details:', extra)
    }
  }
}

console.log('============================================================')
console.log('🛡️  PENGUJIAN MODAL PILIH SHIFT & SINKRONISASI JADWAL SECURITY')
console.log('============================================================\n')

// ─────────────────────────────────────────────────────────────
// SKENARIO 1: Senin, 9 November 2026 (Pagi, Siang, Sore, Malam)
// ─────────────────────────────────────────────────────────────
console.log('SKENARIO 1: Senin, 9 November 2026')
{
  const MON = '2026-11-09'
  const options = getSecurityAvailableOptions(MON)

  assert('1a. Pilihan shift hari Senin tepat berjumlah 3', options.length === 3)
  assert('1b. Opsi pertama adalah ID shift_1', options[0] === 'shift_1')
  assert('1c. Opsi kedua adalah ID shift_2', options[1] === 'shift_2')
  assert('1d. Opsi ketiga adalah ID shift_3', options[2] === 'shift_3')

  // Uji pada Pagi Hari (08:30 WIB) — Waktu saat bug sebelumnya terjadi
  setMockClock(`${MON}T08:30:00+07:00`)
  const now0830 = getEffectiveNow()

  const st1_0830 = getSecurityShiftCheckInStatus('shift_1', MON, now0830)
  const st2_0830 = getSecurityShiftCheckInStatus('shift_2', MON, now0830)
  const st3_0830 = getSecurityShiftCheckInStatus('shift_3', MON, now0830)

  // Verifikasi Label Tampilan Pengguna
  assert('1e. shift_1 berlabel "Shift I"', st1_0830.label === 'Shift I')
  assert('1f. shift_2 berlabel "Shift II" (BUKAN Shift II — Malam)', st2_0830.label === 'Shift II')
  assert('1g. shift_3 berlabel "Shift III" (BUKAN Shift II — Malam)', st3_0830.label === 'Shift III')

  // Verifikasi Jendela Masuk
  assert('1h. Shift I jendela masuk 07.00 – 07.30', st1_0830.scheduledStart === '07:00' && st1_0830.scheduledEnd === '07:30')
  assert('1i. Shift II jendela masuk 15.00 – 15.30 (BUKAN 20.00)', st2_0830.scheduledStart === '15:00' && st2_0830.scheduledEnd === '15:30')
  assert('1j. Shift III jendela masuk 19.30 – 20.00 (BUKAN 07.30)', st3_0830.scheduledStart === '19:30' && st3_0830.scheduledEnd === '20:00')

  // Verifikasi Durasi & Jam Kerja
  assert('1k. Shift I jam kerja 07.00 – 16.00 WIB', st1_0830.workHoursDisplay.includes('07.00 – 16.00'))
  assert('1l. Shift II jam kerja 15.00 – 19.30 WIB', st2_0830.workHoursDisplay.includes('15.00 – 19.30'))
  assert('1m. Shift III jam kerja 19.30 – 07.30 (H+1) WIB', st3_0830.workHoursDisplay.includes('19.30 – 07.30') && st3_0830.workHoursDisplay.includes('(H+1)'))

  // Verifikasi Status Jendela pada 08:30 WIB
  assert('1n. Pada 08:30 WIB: Shift I jendela_selesai (terlambat)', st1_0830.windowStatus === 'jendela_selesai')
  assert('1o. Pada 08:30 WIB: Shift II belum_dibuka', st2_0830.windowStatus === 'belum_dibuka')
  assert('1p. Pada 08:30 WIB: Shift III belum_dibuka', st3_0830.windowStatus === 'belum_dibuka')

  // Uji Auto-select saat Jendela Masuk Shift I aktif (07:15 WIB)
  setMockClock(`${MON}T07:15:00+07:00`)
  const auto0715 = getAutoSelectSecurityShift(MON, getEffectiveNow())
  assert('1q. Pada 07:15 WIB: Auto-select memilih ID shift_1', auto0715 === 'shift_1')

  // Uji Auto-select saat Jendela Masuk Shift II aktif (15:15 WIB)
  setMockClock(`${MON}T15:15:00+07:00`)
  const auto1515 = getAutoSelectSecurityShift(MON, getEffectiveNow())
  assert('1r. Pada 15:15 WIB: Auto-select memilih ID shift_2', auto1515 === 'shift_2')

  // Uji Auto-select saat Jendela Masuk Shift III aktif (19:45 WIB)
  setMockClock(`${MON}T19:45:00+07:00`)
  const auto1945 = getAutoSelectSecurityShift(MON, getEffectiveNow())
  assert('1s. Pada 19:45 WIB: Auto-select memilih ID shift_3', auto1945 === 'shift_3')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 2: Kamis (Senin–Kamis Schedule Integrity)
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 2: Kamis (12 November 2026)')
{
  const THU = '2026-11-12'
  const options = getSecurityAvailableOptions(THU)
  assert('2a. Pilihan shift hari Kamis berjumlah 3', options.length === 3)
  assert('2b. Opsi adalah ID shift_1, shift_2, shift_3',
    options[0] === 'shift_1' && options[1] === 'shift_2' && options[2] === 'shift_3'
  )

  setMockClock(`${THU}T07:15:00+07:00`)
  const st1 = getSecurityShiftCheckInStatus('Shift I', THU, getEffectiveNow())
  const st2 = getSecurityShiftCheckInStatus('Shift II', THU, getEffectiveNow())
  const st3 = getSecurityShiftCheckInStatus('Shift III', THU, getEffectiveNow())

  assert('2c. Shift I label "Shift I", jam masuk 07.00–07.30', st1.label === 'Shift I' && st1.scheduledStart === '07:00' && st1.scheduledEnd === '07:30')
  assert('2d. Shift II label "Shift II", jam masuk 15.00–15.30', st2.label === 'Shift II' && st2.scheduledStart === '15:00' && st2.scheduledEnd === '15:30')
  assert('2e. Shift III label "Shift III", jam masuk 19.30–20.00', st3.label === 'Shift III' && st3.scheduledStart === '19:30' && st3.scheduledEnd === '20:00')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 3: Jumat (13 November 2026) — 3 Varian Shift Resmi
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 3: Jumat (13 November 2026)')
{
  const FRI = '2026-11-13'
  const options = getSecurityAvailableOptions(FRI)
  assert('3a. Pilihan shift hari Jumat tepat berjumlah 3', options.length === 3)
  assert('3b. Pilihan Jumat adalah shift_1_reguler, shift_1_panjang, shift_2_malam',
    options.includes('shift_1_reguler') &&
    options.includes('shift_1_panjang') &&
    options.includes('shift_2_malam')
  )

  setMockClock(`${FRI}T07:15:00+07:00`)
  const nowFri = getEffectiveNow()
  const stReg = getSecurityShiftCheckInStatus('shift_1_reguler', FRI, nowFri)
  const stPjg = getSecurityShiftCheckInStatus('shift_1_panjang', FRI, nowFri)
  const stMlm = getSecurityShiftCheckInStatus('shift_2_malam', FRI, nowFri)

  // Verifikasi Identitas & Label yang Berbeda
  assert('3c. Label Shift I Reguler tepat', stReg.label === 'Shift I — Reguler')
  assert('3d. Label Shift I Panjang tepat', stPjg.label === 'Shift I — Panjang (12 Jam)')
  assert('3e. Label Shift II Malam tepat', stMlm.label === 'Shift II — Malam')
  assert('3f. Reguler dan Panjang memiliki identitas label yang berbeda', stReg.label !== stPjg.label)

  // Verifikasi Jendela Masuk
  assert('3g. Shift I Reguler masuk 07.00–07.30', stReg.scheduledStart === '07:00' && stReg.scheduledEnd === '07:30')
  assert('3h. Shift I Panjang masuk 07.00–07.30', stPjg.scheduledStart === '07:00' && stPjg.scheduledEnd === '07:30')
  assert('3i. Shift II Malam masuk 19.00–19.30', stMlm.scheduledStart === '19:00' && stMlm.scheduledEnd === '19:30')

  // Verifikasi Durasi & Jam Kerja
  assert('3j. Shift I Reguler durasi 07.00–16.00 WIB', stReg.workHoursDisplay.includes('07.00 – 16.00'))
  assert('3k. Shift I Panjang durasi 07.00–19.00 WIB', stPjg.workHoursDisplay.includes('07.00 – 19.00'))
  assert('3l. Shift II Malam durasi 19.00–07.00 (H+1) WIB', stMlm.workHoursDisplay.includes('19.00 – 07.00') && stMlm.workHoursDisplay.includes('(H+1)'))
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 4: Sabtu (14 November 2026) — 2 Sesi Akhir Pekan
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 4: Sabtu (14 November 2026)')
{
  const SAT = '2026-11-14'
  const options = getSecurityAvailableOptions(SAT)
  assert('4a. Pilihan shift Sabtu tepat berjumlah 2', options.length === 2)
  assert('4b. Opsi adalah ID shift_1 dan shift_2', options[0] === 'shift_1' && options[1] === 'shift_2')

  setMockClock(`${SAT}T07:45:00+07:00`)
  const nowSat = getEffectiveNow()
  const st1 = getSecurityShiftCheckInStatus('shift_1', SAT, nowSat)
  const st2 = getSecurityShiftCheckInStatus('shift_2', SAT, nowSat)

  assert('4c. Shift I Sabtu berlabel "Shift I — Pagi"', st1.label === 'Shift I — Pagi')
  assert('4d. Shift II Sabtu berlabel "Shift II — Malam"', st2.label === 'Shift II — Malam')
  assert('4e. Shift I Sabtu masuk 07.30–08.00', st1.scheduledStart === '07:30' && st1.scheduledEnd === '08:00')
  assert('4f. Shift II Sabtu masuk 20.00–20.30', st2.scheduledStart === '20:00' && st2.scheduledEnd === '20:30')
  assert('4g. Pada 07:45 WIB: Shift I status tepat_waktu', st1.windowStatus === 'tepat_waktu')
  assert('4h. Pada 07:45 WIB: Shift II status belum_dibuka', st2.windowStatus === 'belum_dibuka')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 5: Minggu (15 November 2026) — 2 Sesi Akhir Pekan
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 5: Minggu (15 November 2026)')
{
  const SUN = '2026-11-15'
  const options = getSecurityAvailableOptions(SUN)
  assert('5a. Pilihan shift Minggu tepat berjumlah 2', options.length === 2)

  setMockClock(`${SUN}T20:15:00+07:00`)
  const nowSun = getEffectiveNow()
  const st1 = getSecurityShiftCheckInStatus('shift_1', SUN, nowSun)
  const st2 = getSecurityShiftCheckInStatus('shift_2', SUN, nowSun)

  assert('5b. Shift I Minggu berlabel "Shift I — Pagi"', st1.label === 'Shift I — Pagi')
  assert('5c. Shift II Minggu berlabel "Shift II — Malam"', st2.label === 'Shift II — Malam')
  assert('5d. Pada 20:15 WIB: Shift II status tepat_waktu', st2.windowStatus === 'tepat_waktu')
  assert('5e. Pada 20:15 WIB: Shift I status jendela_selesai', st1.windowStatus === 'jendela_selesai')
  assert('5f. Auto-select pada 20:15 WIB memilih ID shift_2', getAutoSelectSecurityShift(SUN, nowSun) === 'shift_2')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 6: Keselarasan Jadwal Dashboard vs Modal
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 6: Keselarasan Jadwal Dashboard vs Modal')
{
  // Dashboard menggunakan getSecurityShiftItem(workDateStr, opt)
  // Modal menggunakan getSecurityShiftCheckInStatus(opt, workDateStr, now)
  const testDays = ['2026-11-09', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']

  for (const day of testDays) {
    const opts = getSecurityAvailableOptions(day)
    for (const opt of opts) {
      const dashboardItem = getSecurityShiftItem(day, opt)
      const modalStatus = getSecurityShiftCheckInStatus(opt, day, new Date(`${day}T12:00:00+07:00`))

      assert(
        `6. [${day}] [${opt}] Jam masuk dashboard (${dashboardItem.in_start}–${dashboardItem.in_end}) sama persis dengan modal (${modalStatus.scheduledStart}–${modalStatus.scheduledEnd})`,
        dashboardItem.in_start === modalStatus.scheduledStart && dashboardItem.in_end === modalStatus.scheduledEnd
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 7: Reaktivitas DevClock Tanpa Reload
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 7: Reaktivitas DevClock Tanpa Reload')
{
  let listenerCalled = false
  const unsub = subscribeToMockClock(() => {
    listenerCalled = true
  })

  setMockClock('2026-11-09T07:15:00+07:00')
  assert('7a. Perubahan DevClock memicu event listener', listenerCalled)

  const now1 = getEffectiveNow()
  const stMonPagi = getSecurityShiftCheckInStatus('Shift I', '2026-11-09', now1)
  assert('7b. Pada 07:15 Shift I aktif (tepat_waktu)', stMonPagi.windowStatus === 'tepat_waktu')

  // Ganti DevClock ke 15:15 WIB
  setMockClock('2026-11-09T15:15:00+07:00')
  const now2 = getEffectiveNow()
  const stMonSore = getSecurityShiftCheckInStatus('Shift II', '2026-11-09', now2)
  assert('7c. Pada 15:15 Shift II aktif (tepat_waktu) langsung terpantau', stMonSore.windowStatus === 'tepat_waktu')

  unsub()
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 8: Integritas Jadwal CS (Cleaning Service) Tidak Terpengaruh
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 8: Integritas Jadwal CS')
{
  const cs = getCSScheduleSync()
  assert('8a. CS masuk open tetap 07:30', cs.masuk.open === '07:30')
  assert('8b. CS masuk ontime_deadline tetap 08:00', cs.masuk.ontime_deadline === '08:00')
  assert('8c. CS istirahat start tetap 12:00', cs.istirahat.start === '12:00')
  assert('8d. CS pulang start tetap 16:00', cs.pulang.start === '16:00')
}

// ─────────────────────────────────────────────────────────────
// SKENARIO 9: Audit Payload Presensi Masuk & Keluar (Langsung ke Sandbox)
// ─────────────────────────────────────────────────────────────
console.log('\nSKENARIO 9: Audit Payload Presensi Masuk & Keluar')
{
  const officeCoords = { latitude: -6.175392, longitude: 106.827153 }

  // 9a. Senin, 9 November 2026 — Check-in Shift II pukul 15.15 WIB menggunakan ID 'shift_2'
  setMockClock('2026-11-09T15:15:00+07:00')
  const resMonShift2 = simulateMockSubmitAttendance({
    employee_name: 'Budi Santoso',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_2',
    selfie_base64: 'data:image/jpeg;base64,sample',
    idempotency_key: 'test-mon-shift-2',
    work_date: '2026-11-09',
    ...officeCoords,
  })
  assert('9a. Senin Shift II check-in dengan ID shift_2 berhasil', Boolean(resMonShift2.success) && !resMonShift2.error)
  assert('9b. Shift tersimpan sebagai shift_2', resMonShift2.data?.shift === 'shift_2')

  // 9c. Senin — Check-in Shift I pukul 07.15 WIB dengan ID 'shift_1'
  setMockClock('2026-11-09T07:15:00+07:00')
  const resMonShift1 = simulateMockSubmitAttendance({
    employee_name: 'Andi Pratama',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_1',
    selfie_base64: 'data:image/jpeg;base64,sample',
    idempotency_key: 'test-mon-shift-1',
    work_date: '2026-11-09',
    ...officeCoords,
  })
  assert('9c. Senin Shift I check-in dengan ID shift_1 berhasil', Boolean(resMonShift1.success) && !resMonShift1.error)

  // 9d. Senin — Check-in Shift III pukul 19.45 WIB dengan ID 'shift_3'
  setMockClock('2026-11-09T19:45:00+07:00')
  const resMonShift3 = simulateMockSubmitAttendance({
    employee_name: 'Citra Dewi',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_3',
    selfie_base64: 'data:image/jpeg;base64,sample',
    idempotency_key: 'test-mon-shift-3',
    work_date: '2026-11-09',
    ...officeCoords,
  })
  assert('9d. Senin Shift III check-in dengan ID shift_3 berhasil', Boolean(resMonShift3.success) && !resMonShift3.error)

  // 9e. Jumat — Uji ketiga varian shift
  setMockClock('2026-11-13T07:15:00+07:00')
  const resFriReg = simulateMockSubmitAttendance({
    employee_name: 'Doni Kurnia',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_1_reguler',
    selfie_base64: 'data:image/jpeg;base64,sample',
    idempotency_key: 'test-fri-reg',
    work_date: '2026-11-13',
    ...officeCoords,
  })
  assert('9e. Jumat Shift I Reguler check-in berhasil', Boolean(resFriReg.success) && !resFriReg.error)

  const resFriPjg = simulateMockSubmitAttendance({
    employee_name: 'Eko Saputra',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_1_panjang',
    selfie_base64: 'data:image/jpeg;base64,sample',
    idempotency_key: 'test-fri-pjg',
    work_date: '2026-11-13',
    ...officeCoords,
  })
  assert('9f. Jumat Shift I Panjang check-in berhasil', Boolean(resFriPjg.success) && !resFriPjg.error)

  setMockClock('2026-11-13T19:15:00+07:00')
  const resFriMlm = simulateMockSubmitAttendance({
    employee_name: 'Fajar Nugraha',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_2_malam',
    selfie_base64: 'data:image/jpeg;base64,sample',
    idempotency_key: 'test-fri-mlm',
    work_date: '2026-11-13',
    ...officeCoords,
  })
  assert('9g. Jumat Shift II Malam check-in berhasil', Boolean(resFriMlm.success) && !resFriMlm.error)

  // 9h. Sabtu dan Minggu — Uji shift akhir pekan
  setMockClock('2026-11-14T07:45:00+07:00')
  const resSatPagi = simulateMockSubmitAttendance({
    employee_name: 'Gilang Ramadhan',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_1',
    selfie_base64: 'data:image/jpeg;base64,sample',
    idempotency_key: 'test-sat-pagi',
    work_date: '2026-11-14',
    ...officeCoords,
  })
  assert('9h. Sabtu Shift I check-in dengan ID shift_1 berhasil', Boolean(resSatPagi.success) && !resSatPagi.error)

  setMockClock('2026-11-14T20:15:00+07:00')
  const resSatMlm = simulateMockSubmitAttendance({
    employee_name: 'Hadi Wijaya',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'shift_2',
    selfie_base64: 'data:image/jpeg;base64,sample',
    idempotency_key: 'test-sat-mlm',
    work_date: '2026-11-14',
    ...officeCoords,
  })
  assert('9i. Sabtu Shift II check-in dengan ID shift_2 berhasil', Boolean(resSatMlm.success) && !resSatMlm.error)

  // 9j. Backward compatibility: Payload dengan label lama 'Shift II' tetap diterima secara konsisten
  setMockClock('2026-11-09T15:20:00+07:00')
  const resLegacyLabel = simulateMockSubmitAttendance({
    employee_name: 'Indra Gunawan',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift II',
    selfie_base64: 'data:image/jpeg;base64,sample',
    idempotency_key: 'test-mon-legacy-shift-2',
    work_date: '2026-11-09',
    ...officeCoords,
  })
  assert('9j. Payload dengan label legacy "Shift II" tetap diterima (backward compatibility)', Boolean(resLegacyLabel.success) && !resLegacyLabel.error)

  // 9k. Check-out menggunakan ID shift dari record check-in asli
  setMockClock('2026-11-09T19:35:00+07:00')
  const resCheckout = simulateMockSubmitAttendance({
    employee_name: 'Budi Santoso',
    category: 'Security',
    attendance_type: 'pulang',
    shift: resMonShift2.data?.shift,
    check_in_record_id: resMonShift2.data?.id,
    selfie_base64: 'data:image/jpeg;base64,sample',
    idempotency_key: 'test-mon-shift-2-pulang',
    work_date: '2026-11-09',
    ...officeCoords,
  })
  assert('9k. Check-out menggunakan ID shift yang sama dengan record masuk berhasil', Boolean(resCheckout.success) && !resCheckout.error)
  assert('9l. Check-out terhubung ke check_in_record_id asli', resCheckout.data?.check_in_record_id === resMonShift2.data?.id)
}

// Selesai pengujian: bersihkan mock clock
clearMockClock()

console.log('\n============================================================')
if (failed === 0) {
  console.log(`🎉 SELURUH ${passed} PENGUJIAN SINKRONISASI MODAL SHIFT LULUS 100%!`)
} else {
  console.error(`❌ TERDAPAT ${failed} PENGUJIAN GAGAL DARI ${passed + failed} PENGUJIAN.`)
  process.exit(1)
}
