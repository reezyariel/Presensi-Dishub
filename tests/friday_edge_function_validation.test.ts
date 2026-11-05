// ============================================================
// SIPATEN — Pengujian Validasi Edge Function submit-attendance
// Khusus 3 Varian Shift Hari Jumat Security & DevClock Compatibility
// ============================================================

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

console.log('============================================================')
console.log('🧪 PENGUJIAN VALIDASI BACKEND EDGE FUNCTION (SUBMIT-ATTENDANCE)')
console.log('============================================================')

// ------------------------------------------------------------
// Ekstraksi Logika Validasi Persis dari supabase/functions/submit-attendance/index.ts
// ------------------------------------------------------------

function canonicalize(shiftName: string | null | undefined): string {
  if (!shiftName) return ''
  const s = shiftName.trim()
  if (s === 'Shift 1' || s === 'Shift I' || s === 'Sesi Pagi') return 'Shift I'
  if (s === 'Shift 2' || s === 'Shift II' || s === 'Sesi Malam') return 'Shift II'
  if (s === 'Shift 3' || s === 'Shift III') return 'Shift III'
  return s
}

function shiftsCompatible(s1: string | null | undefined, s2: string | null | undefined): boolean {
  if (!s1 || !s2) return false
  if (s1 === s2) return true
  const c1 = canonicalize(s1)
  const c2 = canonicalize(s2)
  if (c1 === c2) return true
  // Friday backward compatibility mappings:
  if ((c1 === 'Shift I' && c2 === 'shift_1_panjang') || (c2 === 'Shift I' && c1 === 'shift_1_panjang')) return true
  if ((c1 === 'Shift II' && c2 === 'shift_2_malam') || (c2 === 'Shift II' && c1 === 'shift_2_malam')) return true
  return false
}

function isOvernightByDayAndShift(dayOfWeek: number, shiftName: string | null | undefined): boolean {
  if (!shiftName) return false
  const canon = canonicalize(shiftName)
  // Senin–Kamis (1–4): Shift III overnight
  if (dayOfWeek >= 1 && dayOfWeek <= 4) return canon === 'Shift III'
  // Jumat (5): shift_2_malam or Shift II overnight
  if (dayOfWeek === 5) return canon === 'Shift II' || shiftName === 'shift_2_malam'
  // Sabtu–Minggu (6,0): Shift II / Sesi Malam overnight
  if (dayOfWeek === 0 || dayOfWeek === 6) return canon === 'Shift II'
  return false
}

const VALID_SECURITY_SHIFTS = [
  'Shift 1', 'Shift 2', 'Shift 3',
  'Shift I', 'Shift II', 'Shift III',
  'Sesi Pagi', 'Sesi Malam',
  'shift_1_reguler', 'shift_1_panjang', 'shift_2_malam',
]

interface SubmitPayload {
  category: 'CS' | 'Security'
  attendance_type: 'masuk' | 'istirahat' | 'pulang'
  shift?: string | null
  workDateStr: string
}

interface ValidationResult {
  valid: boolean
  error?: string
  errorCode?: string
  status?: number
}

function validateBackendPayload(payload: SubmitPayload): ValidationResult {
  const { category, attendance_type, shift, workDateStr } = payload

  // 1. Validasi Tipe Presensi & Shift Global
  if (category === 'Security') {
    if (attendance_type === 'istirahat') {
      return {
        valid: false,
        error: 'Kategori Security tidak memiliki tipe absensi istirahat.',
        status: 400,
      }
    }
    if (!shift || !VALID_SECURITY_SHIFTS.includes(shift)) {
      return {
        valid: false,
        error: 'Pilih shift yang valid untuk Security (Shift I, Shift II, Shift III, shift_1_reguler, shift_1_panjang, shift_2_malam).',
        status: 400,
      }
    }
  } else {
    // Cleaning Service
    // CS tidak memerlukan parameter shift
  }

  // 2. Validasi Hari & Shift Spesifik
  if (category === 'Security') {
    const shiftStr = String(shift || '')
    const canonicalShift = canonicalize(shiftStr)
    const dayOfWeek = new Date(workDateStr + 'T12:00:00+07:00').getDay()
    const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6
    const isFridayDay = dayOfWeek === 5

    const configuredShifts: string[] = isFridayDay
      ? ['shift_1_reguler', 'shift_1_panjang', 'shift_2_malam']
      : isWeekendDay ? ['Shift I', 'Shift II'] : ['Shift I', 'Shift II', 'Shift III']

    const isAllowedShift = configuredShifts.includes(canonicalShift) ||
      configuredShifts.includes(shiftStr) ||
      (isFridayDay && (canonicalShift === 'Shift I' || canonicalShift === 'Shift II'))

    if (!isAllowedShift) {
      const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
      return {
        valid: false,
        error: `Pilihan shift ${shift} tidak sesuai dengan jadwal hari ${dayNames[dayOfWeek]}. Shift yang tersedia: ${configuredShifts.join(', ')}.`,
        errorCode: 'INVALID_SHIFT_FOR_DAY',
        status: 400,
      }
    }
  }

  return { valid: true }
}

// ============================================================
// SUITE 1: Whitelist Shift Security (Step 1 Validation)
// ============================================================
console.log('\nSUITE 1: Whitelist Shift Security Global')
{
  assert('shift_1_reguler ada di whitelist', VALID_SECURITY_SHIFTS.includes('shift_1_reguler'))
  assert('shift_1_panjang ada di whitelist', VALID_SECURITY_SHIFTS.includes('shift_1_panjang'))
  assert('shift_2_malam ada di whitelist', VALID_SECURITY_SHIFTS.includes('shift_2_malam'))
  assert('Shift I ada di whitelist', VALID_SECURITY_SHIFTS.includes('Shift I'))
  assert('Shift II ada di whitelist', VALID_SECURITY_SHIFTS.includes('Shift II'))
  assert('Shift III ada di whitelist', VALID_SECURITY_SHIFTS.includes('Shift III'))
  assert('Sesi Pagi ada di whitelist', VALID_SECURITY_SHIFTS.includes('Sesi Pagi'))
  assert('Sesi Malam ada di whitelist', VALID_SECURITY_SHIFTS.includes('Sesi Malam'))

  const resEmpty = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: null, workDateStr: '2026-11-06' })
  assert('Shift null ditolak', !resEmpty.valid && resEmpty.error?.includes('Pilih shift yang valid'))

  const resInvalid = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'Shift 4', workDateStr: '2026-11-06' })
  assert('Shift tidak dikenal (Shift 4) ditolak', !resInvalid.valid && resInvalid.error?.includes('Pilih shift yang valid'))

  const resArbitrary = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'malam_bebas', workDateStr: '2026-11-06' })
  assert('Shift sembarangan (malam_bebas) ditolak', !resArbitrary.valid)
}

// ============================================================
// SUITE 2: Validasi Shift Hari Jumat (workDayOfWeek = 5)
// ============================================================
console.log('\nSUITE 2: Validasi Shift Hari Jumat (2026-11-06)')
const FRI = '2026-11-06'
{
  const r1 = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'shift_1_reguler', workDateStr: FRI })
  assert('Jumat: shift_1_reguler diterima', r1.valid)

  const r2 = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'shift_1_panjang', workDateStr: FRI })
  assert('Jumat: shift_1_panjang diterima', r2.valid)

  const r3 = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'shift_2_malam', workDateStr: FRI })
  assert('Jumat: shift_2_malam diterima', r3.valid)

  const rLegacy1 = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'Shift I', workDateStr: FRI })
  assert('Jumat: Shift I historis diterima', rLegacy1.valid)

  const rLegacy2 = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'Shift II', workDateStr: FRI })
  assert('Jumat: Shift II historis diterima', rLegacy2.valid)

  const rFriShift3 = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'Shift III', workDateStr: FRI })
  assert('Jumat: Shift III ditolak', !rFriShift3.valid && rFriShift3.errorCode === 'INVALID_SHIFT_FOR_DAY')
  assert('Jumat: Pesan error menyebut hari Jumat', rFriShift3.error?.includes('hari Jumat'))
}

// ============================================================
// SUITE 3: Validasi Shift Hari Lain (Senin-Kamis & Akhir Pekan)
// ============================================================
console.log('\nSUITE 3: Validasi Shift Hari Selain Jumat')
const MON = '2026-11-02'
const SAT = '2026-11-07'
{
  // Senin: shift_1_reguler harus ditolak karena khusus Jumat
  const rMonReg = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'shift_1_reguler', workDateStr: MON })
  assert('Senin: shift_1_reguler ditolak', !rMonReg.valid && rMonReg.errorCode === 'INVALID_SHIFT_FOR_DAY')

  // Senin: shift_1_panjang ditolak
  const rMonPan = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'shift_1_panjang', workDateStr: MON })
  assert('Senin: shift_1_panjang ditolak', !rMonPan.valid && rMonPan.errorCode === 'INVALID_SHIFT_FOR_DAY')

  // Senin: shift_2_malam ditolak
  const rMonMal = validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'shift_2_malam', workDateStr: MON })
  assert('Senin: shift_2_malam ditolak', !rMonMal.valid && rMonMal.errorCode === 'INVALID_SHIFT_FOR_DAY')

  // Senin: Shift I/II/III harus diterima
  assert('Senin: Shift I diterima', validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'Shift I', workDateStr: MON }).valid)
  assert('Senin: Shift II diterima', validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'Shift II', workDateStr: MON }).valid)
  assert('Senin: Shift III diterima', validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'Shift III', workDateStr: MON }).valid)

  // Sabtu: shift Jumat ditolak
  assert('Sabtu: shift_1_reguler ditolak', !validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'shift_1_reguler', workDateStr: SAT }).valid)
  assert('Sabtu: Shift III ditolak', !validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'Shift III', workDateStr: SAT }).valid)
  assert('Sabtu: Shift I diterima', validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'Shift I', workDateStr: SAT }).valid)
  assert('Sabtu: Shift II diterima', validateBackendPayload({ category: 'Security', attendance_type: 'masuk', shift: 'Shift II', workDateStr: SAT }).valid)
}

// ============================================================
// SUITE 4: Role Cleaning Service (CS) Tetap Utuh & Terpisah
// ============================================================
console.log('\nSUITE 4: Integritas Role Cleaning Service (CS)')
{
  const rCSMasuk = validateBackendPayload({ category: 'CS', attendance_type: 'masuk', shift: null, workDateStr: FRI })
  assert('CS: Masuk tanpa shift diterima', rCSMasuk.valid)

  const rCSIstirahat = validateBackendPayload({ category: 'CS', attendance_type: 'istirahat', shift: null, workDateStr: FRI })
  assert('CS: Istirahat diterima', rCSIstirahat.valid)

  const rCSPulang = validateBackendPayload({ category: 'CS', attendance_type: 'pulang', shift: null, workDateStr: FRI })
  assert('CS: Pulang diterima', rCSPulang.valid)

  const rSecIstirahat = validateBackendPayload({ category: 'Security', attendance_type: 'istirahat', shift: 'shift_1_reguler', workDateStr: FRI })
  assert('Security: Istirahat ditolak dengan 400', !rSecIstirahat.valid && rSecIstirahat.status === 400)
}

// ============================================================
// SUITE 5: Deteksi Overnight & Kompatibilitas Checkout
// ============================================================
console.log('\nSUITE 5: Deteksi Overnight & Kompatibilitas Checkout')
{
  // Friday is day 5
  assert('Jumat shift_2_malam terdeteksi overnight', isOvernightByDayAndShift(5, 'shift_2_malam'))
  assert('Jumat shift_1_reguler BUKAN overnight', !isOvernightByDayAndShift(5, 'shift_1_reguler'))
  assert('Jumat shift_1_panjang BUKAN overnight', !isOvernightByDayAndShift(5, 'shift_1_panjang'))
  assert('Jumat Shift II lama terdeteksi overnight', isOvernightByDayAndShift(5, 'Shift II'))
  assert('Jumat Shift I lama BUKAN overnight', !isOvernightByDayAndShift(5, 'Shift I'))

  // Senin is day 1: Shift III overnight, Shift I & II not
  assert('Senin Shift III terdeteksi overnight', isOvernightByDayAndShift(1, 'Shift III'))
  assert('Senin Shift I BUKAN overnight', !isOvernightByDayAndShift(1, 'Shift I'))
  assert('Senin Shift II BUKAN overnight', !isOvernightByDayAndShift(1, 'Shift II'))

  // Kompatibilitas check-in vs check-out:
  assert('shift_1_reguler kompatibel dengan shift_1_reguler', shiftsCompatible('shift_1_reguler', 'shift_1_reguler'))
  assert('shift_1_panjang kompatibel dengan shift_1_panjang', shiftsCompatible('shift_1_panjang', 'shift_1_panjang'))
  assert('shift_2_malam kompatibel dengan shift_2_malam', shiftsCompatible('shift_2_malam', 'shift_2_malam'))
  assert('shift_1_panjang kompatibel dengan Shift I historis', shiftsCompatible('shift_1_panjang', 'Shift I'))
  assert('shift_2_malam kompatibel dengan Shift II historis', shiftsCompatible('shift_2_malam', 'Shift II'))
  assert('shift_1_reguler TIDAK kompatibel dengan shift_1_panjang', !shiftsCompatible('shift_1_reguler', 'shift_1_panjang'))
  assert('shift_1_reguler TIDAK kompatibel dengan shift_2_malam', !shiftsCompatible('shift_1_reguler', 'shift_2_malam'))
}

// ============================================================
// HASIL AKHIR
// ============================================================
console.log('============================================================')
if (failCount === 0) {
  console.log(`🎉 SEMUA ${passCount} PENGUJIAN VALIDASI BACKEND BERHASIL LULUS!`)
} else {
  console.error(`❌ TERDAPAT ${failCount} PENGUJIAN GAGAL DARI ${passCount + failCount} PENGUJIAN.`)
  process.exit(1)
}
