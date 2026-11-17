/**
 * SIPATEN — Unified Review Attendance (CS & Security) Test Suite
 * Run with: node --import ./scripts/test-loader.mjs tests/unified_review_attendance.test.ts
 */

import {
  getReviewAssistanceFlags,
  getEmployeeDisplayCode,
  matchesReviewSearch,
  formatReviewWorkDate,
  formatReviewTime,
  isOvernightSecurityRecord,
} from '../src/lib/reviewAssistance'
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
console.log('🔍 SIPATEN — Unified Review Attendance (CS & Security) Tests')
console.log('============================================================\n')

// ─────────────────────────────────────────────────────────────────────────────
// 1. CS Attendance Review Characteristics
// ─────────────────────────────────────────────────────────────────────────────
console.log('TEST 1: CS Attendance Record — Masuk, Istirahat, Pulang tanpa Shift Security')
{
  const csRecord: AttendanceRecord = {
    id: 'cs-rec-001',
    employee_name: 'Budi Santoso',
    normalized_name: 'budi santoso',
    employee_profile_id: 'emp-cs-01',
    category: 'CS',
    attendance_type: 'masuk',
    shift: null, // CS never uses Security shifts
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T07:05:00+07:00',
    scheduled_start: '07:00',
    scheduled_end: '16:00',
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    selfie_storage_path: 'selfies/cs_01_masuk.jpg',
    review_status: 'belum_diperiksa',
    admin_notes: null,
    idempotency_key: 'idem-cs-01',
    latitude: -6.175392,
    longitude: 106.827153,
    distance_meters: 25,
    created_at: '2026-11-04T07:05:00+07:00',
    updated_at: '2026-11-04T07:05:00+07:00',
  }

  const flags = getReviewAssistanceFlags(csRecord, [csRecord])
  assert('CS Masuk tidak memiliki warning bukti (bukti lengkap)', flags.warningCount === 0)
  assert('CS bukan overnight Security shift', !isOvernightSecurityRecord(csRecord))
  assert('Format tanggal CS adalah tanggal reguler', formatReviewWorkDate(csRecord).includes('2026'))
  assert('Format jam tercatat 07:05 WIB', formatReviewTime(csRecord.recorded_at) === '07:05 WIB')
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Security Attendance Review Characteristics & Overnight Shifts
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 2: Security Attendance Record — Shift Malam Lintas Hari (H+1)')
{
  const secOvernight: AttendanceRecord = {
    id: 'sec-rec-night-checkout',
    employee_name: 'Ahmad Subagyo',
    normalized_name: 'ahmad subagyo',
    employee_profile_id: 'emp-sec-01',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift 3',
    work_date: '2026-11-04', // Tanggal kerja asal (Rabu)
    recorded_at: '2026-11-05T07:02:00+07:00', // Selesai Kamis pagi
    scheduled_start: '20:00',
    scheduled_end: '07:00',
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    selfie_storage_path: 'selfies/sec_night_pulang.jpg',
    review_status: 'belum_diperiksa',
    admin_notes: null,
    idempotency_key: 'idem-sec-01',
    latitude: -6.175390,
    longitude: 106.827150,
    distance_meters: 18,
    created_at: '2026-11-05T07:02:00+07:00',
    updated_at: '2026-11-05T07:02:00+07:00',
  }

  assert('Terdeteksi sebagai overnight Security record', isOvernightSecurityRecord(secOvernight))
  const displayDate = formatReviewWorkDate(secOvernight)
  assert('Tanggal menampilkan referensi H+1 terkait tanggal kerja asal', displayDate.includes('(H+1)'))
  assert('Tanggal kerja tetap 2026-11-04', secOvernight.work_date === '2026-11-04')
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Review Assistance Indicators (Visual Flags)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 3: Review Assistance Indicators — Deteksi Bukti Hilang & Di Luar Geofence')
{
  const problematicRecord: AttendanceRecord = {
    id: 'rec-prob-01',
    employee_name: 'Dewi Lestari',
    normalized_name: 'dewi lestari',
    category: 'CS',
    attendance_type: 'masuk',
    shift: null,
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T07:35:00+07:00',
    scheduled_start: '07:00',
    scheduled_end: '16:00',
    attendance_status: 'terlambat',
    late_minutes: 35,
    selfie_storage_path: '', // FOTO HILANG
    review_status: 'perlu_tindak_lanjut',
    admin_notes: null,
    idempotency_key: 'idem-prob-01',
    latitude: null, // GPS HILANG
    longitude: null,
    distance_meters: 450, // DI LUAR RADIUS
    reason: 'Ban motor bocor di jalan',
    created_at: '2026-11-04T07:35:00+07:00',
    updated_at: '2026-11-04T07:35:00+07:00',
  }

  const flags = getReviewAssistanceFlags(problematicRecord, [problematicRecord], 100)
  assert('Missing photo terdeteksi', flags.missingPhoto)
  assert('Missing GPS terdeteksi', flags.missingGps)
  assert('Outside geofence terdeteksi (450m > 100m)', flags.outsideGeofence)
  assert('Is late terdeteksi (+35m)', flags.isLate)
  assert('Total warning count = 4', flags.warningCount === 4)
  assert('Incomplete evidence flag aktif', flags.missingInfo)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Duplicate Submission Detection
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 4: Duplicate Submission Indicator')
{
  const recA: AttendanceRecord = {
    id: 'dup-01',
    employee_name: 'Rian Pratama',
    normalized_name: 'rian pratama',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift 1',
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T06:55:00+07:00',
    scheduled_start: '07:00',
    scheduled_end: '15:00',
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    selfie_storage_path: 'selfies/dup1.jpg',
    review_status: 'belum_diperiksa',
    admin_notes: null,
    idempotency_key: 'idem-dup-01',
    latitude: -6.175,
    longitude: 106.827,
    distance_meters: 15,
    created_at: '2026-11-04T06:55:00+07:00',
    updated_at: '2026-11-04T06:55:00+07:00',
  }

  const recB: AttendanceRecord = {
    ...recA,
    id: 'dup-02',
    recorded_at: '2026-11-04T07:02:00+07:00',
    idempotency_key: 'idem-dup-02',
  }

  const flagsA = getReviewAssistanceFlags(recA, [recA, recB])
  const flagsB = getReviewAssistanceFlags(recB, [recA, recB])

  assert('Rec A mendeteksi potensi duplikat', flagsA.possibleDuplicate)
  assert('Rec B mendeteksi potensi duplikat', flagsB.possibleDuplicate)
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Employee Code & Search Filter
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTEST 5: Employee Code Resolution & Review Search')
{
  const codeMap = new Map<string, string>([
    ['emp-001', 'SEC001'],
    ['budi santoso', 'CS001'],
  ])

  const recSec: AttendanceRecord = {
    id: 'rec-sec-id-xyz',
    employee_name: 'Slamet Riyadi',
    normalized_name: 'slamet riyadi',
    employee_profile_id: 'emp-001',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift 2',
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T14:50:00+07:00',
    scheduled_start: '15:00',
    scheduled_end: '23:00',
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    selfie_storage_path: 'selfies/sec.jpg',
    review_status: 'belum_diperiksa',
    admin_notes: null,
    idempotency_key: 'idem-sec',
    created_at: '2026-11-04T14:50:00+07:00',
    updated_at: '2026-11-04T14:50:00+07:00',
  }

  const code = getEmployeeDisplayCode(recSec, codeMap)
  assert('Employee code SEC001 berhasil dipetakan', code === 'SEC001')

  assert('Search cocok dengan nama "slamet"', matchesReviewSearch(recSec, 'slamet', codeMap))
  assert('Search cocok dengan kode "SEC001"', matchesReviewSearch(recSec, 'SEC001', codeMap))
  assert('Search cocok dengan ID "rec-sec"', matchesReviewSearch(recSec, 'rec-sec', codeMap))
  assert('Search tidak cocok dengan nama lain "joko"', !matchesReviewSearch(recSec, 'joko', codeMap))
}

console.log('\n============================================================')
if (failed === 0) {
  console.log(`🎉 SEMUA ${passed} TES REVIEW ASSISTANCE BERHASIL DENGAN SEMPURNA!`)
} else {
  console.error(`💥 ${failed} TES GAGAL! (${passed} berhasil)`)
  process.exit(1)
}
console.log('============================================================\n')
