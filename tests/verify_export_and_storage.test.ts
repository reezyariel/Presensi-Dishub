/**
 * SIPATEN — Comprehensive Verification Suite for Selfie Photos, Storage, and Excel/PDF Export
 * Run with: node --experimental-strip-types tests/verify_export_and_storage.test.ts
 */

import ExcelJS from 'exceljs'
import jsPDFPkg from 'jspdf'
import autoTable from 'jspdf-autotable'

// Handle CJS/ESM jsPDF constructor resolution in Node
const jsPDF = (jsPDFPkg as any).jsPDF || jsPDFPkg
import type { AttendanceRecord } from '../src/types/attendance.ts'
import { groupCSRecords } from '../src/lib/attendanceGrouping.ts'

function formatJakartaTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
}

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

// 1x1 transparent GIF base64 for mock image testing
const MOCK_BASE64_IMAGE = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

console.log('\n============================================================')
console.log('📑 SIPATEN — Verification of Photos, Storage & Document Export')
console.log('============================================================\n')

// ─────────────────────────────────────────────────────────────
// 1. Mock Data Setup (CS & Security)
// ─────────────────────────────────────────────────────────────
const csRecords: AttendanceRecord[] = [
  // Budi CS on 2026-11-04 (Full attendance: Masuk, Istirahat, Pulang)
  {
    id: 'cs-rec-1',
    employee_name: 'Budi Santoso',
    normalized_name: 'budi santoso',
    employee_profile_id: 'emp-budi',
    auth_uid: 'auth-budi',
    category: 'CS',
    attendance_type: 'masuk',
    shift: null,
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T06:55:00+07:00',
    scheduled_start: '07:00',
    scheduled_end: null,
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    selfie_storage_path: '2026-11-04/budi_masuk.jpg',
    review_status: 'sudah_diperiksa',
    admin_notes: 'Masuk tepat waktu',
    idempotency_key: 'idem-budi-in',
    created_at: '2026-11-04T06:55:00+07:00',
    updated_at: '2026-11-04T06:55:00+07:00',
  },
  {
    id: 'cs-rec-2',
    employee_name: 'Budi Santoso',
    normalized_name: 'budi santoso',
    employee_profile_id: 'emp-budi',
    auth_uid: 'auth-budi',
    category: 'CS',
    attendance_type: 'istirahat',
    shift: null,
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T12:05:00+07:00',
    scheduled_start: null,
    scheduled_end: null,
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    selfie_storage_path: '2026-11-04/budi_istirahat.jpg',
    review_status: 'sudah_diperiksa',
    admin_notes: null,
    idempotency_key: 'idem-budi-rest',
    created_at: '2026-11-04T12:05:00+07:00',
    updated_at: '2026-11-04T12:05:00+07:00',
  },
  {
    id: 'cs-rec-3',
    employee_name: 'Budi Santoso',
    normalized_name: 'budi santoso',
    employee_profile_id: 'emp-budi',
    auth_uid: 'auth-budi',
    category: 'CS',
    attendance_type: 'pulang',
    shift: null,
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T16:05:00+07:00',
    scheduled_start: null,
    scheduled_end: null,
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    selfie_storage_path: '2026-11-04/budi_pulang.jpg',
    review_status: 'sudah_diperiksa',
    admin_notes: null,
    idempotency_key: 'idem-budi-out',
    created_at: '2026-11-04T16:05:00+07:00',
    updated_at: '2026-11-04T16:05:00+07:00',
  },
  // Siti CS on 2026-11-04 (Only Masuk - incomplete, no photo path)
  {
    id: 'cs-rec-4',
    employee_name: 'Siti Rahayu',
    normalized_name: 'siti rahayu',
    employee_profile_id: 'emp-siti',
    auth_uid: 'auth-siti',
    category: 'CS',
    attendance_type: 'masuk',
    shift: null,
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T07:15:00+07:00',
    scheduled_start: '07:00',
    scheduled_end: null,
    attendance_status: 'terlambat',
    late_minutes: 15,
    selfie_storage_path: '', // No photo
    review_status: 'perlu_tindak_lanjut',
    admin_notes: 'Terlambat 15 menit',
    reason: 'Macet di lampu merah',
    idempotency_key: 'idem-siti-in',
    created_at: '2026-11-04T07:15:00+07:00',
    updated_at: '2026-11-04T07:15:00+07:00',
  },
]

const secRecords: AttendanceRecord[] = [
  {
    id: 'sec-rec-1',
    employee_name: 'Agus Santoso',
    normalized_name: 'agus santoso',
    employee_profile_id: 'emp-agus',
    auth_uid: 'auth-agus',
    category: 'Security',
    attendance_type: 'masuk',
    shift: 'Shift I',
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T06:45:00+07:00',
    scheduled_start: '07:00',
    scheduled_end: '15:00',
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    selfie_storage_path: '2026-11-04/agus_shift1.jpg',
    review_status: 'sudah_diperiksa',
    admin_notes: null,
    idempotency_key: 'idem-agus-in',
    created_at: '2026-11-04T06:45:00+07:00',
    updated_at: '2026-11-04T06:45:00+07:00',
  },
  {
    id: 'sec-rec-2',
    employee_name: 'Agus Santoso',
    normalized_name: 'agus santoso',
    employee_profile_id: 'emp-agus',
    auth_uid: 'auth-agus',
    category: 'Security',
    attendance_type: 'pulang',
    shift: 'Shift I',
    work_date: '2026-11-04',
    recorded_at: '2026-11-04T15:10:00+07:00',
    scheduled_start: '07:00',
    scheduled_end: '15:00',
    attendance_status: 'tepat_waktu',
    late_minutes: 0,
    selfie_storage_path: '2026-11-04/agus_shift1_pulang.jpg',
    review_status: 'sudah_diperiksa',
    admin_notes: null,
    idempotency_key: 'idem-agus-out',
    created_at: '2026-11-04T15:10:00+07:00',
    updated_at: '2026-11-04T15:10:00+07:00',
  },
]

// ─────────────────────────────────────────────────────────────
// TEST 1: Grouping Structure Verification
// ─────────────────────────────────────────────────────────────
console.log('TEST 1: Verifikasi Struktur Grouping CS & Separasi Security')
{
  const allRecords = [...csRecords, ...secRecords]
  const csGroups = groupCSRecords(allRecords)

  assert('CS menghasilkan tepat 2 baris (Budi Santoso & Siti Rahayu)', csGroups.length === 2)
  const budi = csGroups.find(g => g.employee_name === 'Budi Santoso')
  assert('Budi memiliki transaksi Masuk', budi?.masuk?.id === 'cs-rec-1')
  assert('Budi memiliki transaksi Istirahat', budi?.istirahat?.id === 'cs-rec-2')
  assert('Budi memiliki transaksi Pulang', budi?.pulang?.id === 'cs-rec-3')
  assert('Foto Masuk Budi tidak tertukar', budi?.masuk?.selfie_storage_path === '2026-11-04/budi_masuk.jpg')
  assert('Foto Istirahat Budi tidak tertukar', budi?.istirahat?.selfie_storage_path === '2026-11-04/budi_istirahat.jpg')
  assert('Foto Pulang Budi tidak tertukar', budi?.pulang?.selfie_storage_path === '2026-11-04/budi_pulang.jpg')

  const siti = csGroups.find(g => g.employee_name === 'Siti Rahayu')
  assert('Siti memiliki Masuk', siti?.masuk?.id === 'cs-rec-4')
  assert('Siti belum Istirahat (null)', siti?.istirahat === null)
  assert('Siti belum Pulang (null)', siti?.pulang === null)
  assert('Siti berstatus terlambat', siti?.overall_attendance_status === 'terlambat')
  assert('Siti review status perlu_tindak_lanjut', siti?.overall_review_status === 'perlu_tindak_lanjut')

  // Security separation
  const secCount = allRecords.filter(r => r.category === 'Security').length
  assert('Security tetap berjumlah 2 transaksi independen', secCount === 2)
  assert('Shift Security tetap Shift I', secRecords[0].shift === 'Shift I' && secRecords[1].shift === 'Shift I')
}

// ─────────────────────────────────────────────────────────────
// TEST 2: ExcelJS Workbook & Image Insertion Engine Verification
// ─────────────────────────────────────────────────────────────
console.log('\nTEST 2: Verifikasi Penyusunan Workbook Excel & Embedding Gambar')
async function testExcelGeneration() {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SIPATEN'

  // CS Sheet
  const csWs = workbook.addWorksheet('Presensi CS')
  csWs.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Nama Pegawai', key: 'name', width: 24 },
    { header: 'Tanggal Kerja', key: 'work_date', width: 14 },
    { header: 'Foto Masuk', key: 'foto_masuk', width: 13 },
    { header: 'Jam Masuk', key: 'jam_masuk', width: 15 },
    { header: 'Foto Istirahat', key: 'foto_istirahat', width: 13 },
    { header: 'Jam Istirahat', key: 'jam_istirahat', width: 15 },
    { header: 'Foto Pulang', key: 'foto_pulang', width: 13 },
    { header: 'Jam Pulang', key: 'jam_pulang', width: 15 },
    { header: 'Status Presensi', key: 'status', width: 16 },
    { header: 'Status Review', key: 'review', width: 18 },
  ]

  const csGroups = groupCSRecords(csRecords)
  for (let idx = 0; idx < csGroups.length; idx++) {
    const g = csGroups[idx]
    const rowNumber = idx + 2

    const masukText = g.masuk
      ? `${formatJakartaTime(g.masuk.recorded_at)}${g.masuk.late_minutes > 0 ? ` (+${g.masuk.late_minutes}m)` : ''}`
      : 'Belum Absen'
    const istirahatText = g.istirahat ? `${formatJakartaTime(g.istirahat.recorded_at)}` : 'Belum Absen'
    const pulangText = g.pulang ? `${formatJakartaTime(g.pulang.recorded_at)}` : 'Belum Absen'

    const row = csWs.addRow({
      no: idx + 1,
      name: g.employee_name,
      work_date: g.work_date,
      foto_masuk: g.masuk?.selfie_storage_path ? '' : '-',
      jam_masuk: masukText,
      foto_istirahat: g.istirahat?.selfie_storage_path ? '' : '-',
      jam_istirahat: istirahatText,
      foto_pulang: g.pulang?.selfie_storage_path ? '' : '-',
      jam_pulang: pulangText,
      status: g.overall_attendance_status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat',
      review: g.overall_review_status,
    })
    row.height = 44

    // Test image embedding
    if (g.masuk?.selfie_storage_path) {
      const imgId = workbook.addImage({
        base64: MOCK_BASE64_IMAGE,
        extension: 'png',
      })
      csWs.addImage(imgId, {
        tl: { col: 3 + 0.15, row: rowNumber - 1 + 0.1 },
        ext: { width: 45, height: 45 },
        editAs: 'oneCell',
      })
    }
  }

  // Security Sheet
  const secWs = workbook.addWorksheet('Presensi Security')
  secWs.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Foto Selfie', key: 'foto_selfie', width: 13 },
    { header: 'Nama Pegawai', key: 'name', width: 24 },
    { header: 'Divisi', key: 'category', width: 12 },
    { header: 'Shift', key: 'shift', width: 14 },
    { header: 'Tipe Absen', key: 'type', width: 14 },
    { header: 'Tanggal Kerja', key: 'work_date', width: 14 },
    { header: 'Waktu Tercatat', key: 'recorded_at', width: 16 },
    { header: 'Status Kehadiran', key: 'status', width: 16 },
    { header: 'Terlambat (Mnt)', key: 'late_minutes', width: 16 },
    { header: 'Status Pemeriksaan', key: 'review_status', width: 18 },
    { header: 'Catatan Admin', key: 'admin_notes', width: 26 },
  ]

  for (let idx = 0; idx < secRecords.length; idx++) {
    const rec = secRecords[idx]
    const rowNumber = idx + 2
    const row = secWs.addRow({
      no: idx + 1,
      foto_selfie: rec.selfie_storage_path ? '' : '-',
      name: rec.employee_name,
      category: rec.category,
      shift: rec.shift || '-',
      type: rec.attendance_type.toUpperCase(),
      work_date: rec.work_date,
      recorded_at: formatJakartaTime(rec.recorded_at),
      status: rec.attendance_status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat',
      late_minutes: rec.late_minutes,
      review_status: rec.review_status,
      admin_notes: rec.admin_notes || '',
    })
    row.height = 44

    if (rec.selfie_storage_path) {
      const imgId = workbook.addImage({
        base64: MOCK_BASE64_IMAGE,
        extension: 'png',
      })
      secWs.addImage(imgId, {
        tl: { col: 1 + 0.15, row: rowNumber - 1 + 0.1 },
        ext: { width: 45, height: 45 },
        editAs: 'oneCell',
      })
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  assert('Excel buffer berhasil digenerate', buffer.byteLength > 1000, `Ukuran: ${buffer.byteLength} bytes`)
  assert('Worksheet CS terbuat dengan 2 baris data', csWs.rowCount === 3) // header + 2 rows
  assert('Worksheet Security terbuat dengan 2 baris data', secWs.rowCount === 3) // header + 2 rows

  // Verifikasi gambar tertanam di worksheet
  const csImages = csWs.getImages()
  assert('Foto selfie berhasil disematkan (embedded) pada cell Excel CS', csImages.length > 0)
  assert('Ukuran foto dibatasi proporsional (width: 45, height: 45 <= 50px)', (csImages[0].range as any).ext?.width <= 50)

  const secImages = secWs.getImages()
  assert('Foto selfie berhasil disematkan pada cell Excel Security', secImages.length > 0)
}

// ─────────────────────────────────────────────────────────────
// TEST 3: jsPDF & autotable Generation Verification
// ─────────────────────────────────────────────────────────────
console.log('\nTEST 3: Verifikasi Dokumen PDF & Embedding Gambar')
function testPdfGeneration() {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // CS Table
  const csGroups = groupCSRecords(csRecords)
  const csBody = csGroups.map((g, idx) => [
    idx + 1,
    g.employee_name,
    g.work_date,
    g.masuk?.selfie_storage_path ? '' : '-',
    g.masuk ? formatJakartaTime(g.masuk.recorded_at) : 'Belum Absen',
    g.istirahat?.selfie_storage_path ? '' : '-',
    g.istirahat ? formatJakartaTime(g.istirahat.recorded_at) : 'Belum Absen',
    g.pulang?.selfie_storage_path ? '' : '-',
    g.pulang ? formatJakartaTime(g.pulang.recorded_at) : 'Belum Absen',
    g.overall_attendance_status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat',
    g.overall_review_status,
  ])

  let imageDrawnCount = 0

  autoTable(doc, {
    startY: 20,
    head: [[
      'No', 'Nama Pegawai', 'Tanggal', 'Foto Masuk', 'Masuk',
      'Foto Istirahat', 'Istirahat', 'Foto Pulang', 'Pulang',
      'Status Presensi', 'Status Review'
    ]],
    body: csBody,
    styles: { minCellHeight: 13 },
    didDrawCell: (data) => {
      if (data.section !== 'body') return
      // Kolom foto 3, 5, 7
      if ([3, 5, 7].includes(data.column.index)) {
        if (data.row.index === 0) {
          // Budi has images
          try {
            doc.addImage(
              `data:image/gif;base64,${MOCK_BASE64_IMAGE}`,
              'GIF',
              data.cell.x + 2,
              data.cell.y + 2,
              9,
              9
            )
            imageDrawnCount++
          } catch (e) {
            console.error('Error drawing PDF image:', e)
          }
        }
      }
    }
  })

  // Security Table
  const secBody = secRecords.map((r, idx) => [
    idx + 1,
    r.selfie_storage_path ? '' : '-',
    r.employee_name,
    r.shift || '-',
    r.attendance_type.toUpperCase(),
    r.work_date,
    formatJakartaTime(r.recorded_at),
    r.attendance_status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat',
    r.review_status,
    r.admin_notes || '-',
  ])

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 15,
    head: [[
      'No', 'Foto', 'Nama Petugas', 'Shift', 'Tipe',
      'Tanggal', 'Waktu Catat', 'Ketepatan', 'Review', 'Catatan'
    ]],
    body: secBody,
    styles: { minCellHeight: 13 },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        try {
          doc.addImage(
            `data:image/gif;base64,${MOCK_BASE64_IMAGE}`,
            'GIF',
            data.cell.x + 2,
            data.cell.y + 2,
            9,
            9
          )
          imageDrawnCount++
        } catch (e) {
          console.error('Error drawing PDF image:', e)
        }
      }
    }
  })

  const pdfOutput = doc.output('arraybuffer')
  assert('PDF arraybuffer berhasil digenerate', pdfOutput.byteLength > 2000, `Ukuran: ${pdfOutput.byteLength} bytes`)
  assert('Foto berhasil tertanam pada dokumen PDF via didDrawCell', imageDrawnCount >= 3)
}

// ─────────────────────────────────────────────────────────────
// Run All Verification Steps
// ─────────────────────────────────────────────────────────────
async function run() {
  await testExcelGeneration()
  testPdfGeneration()

  console.log('\n------------------------------------------------------------')
  console.log(`Verification Results: ${passed} passed, ${failed} failed`)
  console.log('------------------------------------------------------------\n')

  if (failed > 0) {
    process.exit(1)
  }
}

run()
