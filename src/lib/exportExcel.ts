import ExcelJS from 'exceljs'
import type { AttendanceRecord } from '../types/attendance'
import { formatJakartaTime, formatJakartaDate } from './scheduleEngine'
import { formatSecurityDisplayDate } from './securityDateDisplay'
import { groupCSRecords } from './attendanceGrouping'
import { fetchResizedSelfieBase64 } from './selfieStorage'

export interface DailyRecapRow {
  employee_name: string
  category: string
  shift: string
  work_date: string
  jam_masuk: string
  status_masuk: string
  late_minutes: number
  jam_istirahat: string
  jam_pulang: string
  review_status: string
  admin_notes: string
}

export interface MonthlyEmployeeSummary {
  employee_name: string
  category: string
  total_days: number
  total_tepat_waktu: number
  total_terlambat: number
  total_late_minutes: number
  records_count: number
}

/**
 * Trigger browser download for an Excel buffer
 */
async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Apply styling to header row
 */
function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF15803D' }, // Brand green #15803d
    }
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 10,
    }
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    }
  })
  row.height = 28
}

/**
 * Apply borders and padding to data rows
 */
function styleDataRows(worksheet: ExcelJS.Worksheet, defaultHeight = 22) {
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      if (!row.height || row.height < defaultHeight) {
        row.height = defaultHeight
      }
      row.eachCell((cell) => {
        cell.font = { size: 9 }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        }
      })
    }
  })
}

/**
 * Build CS worksheet with 1 row per employee per work_date and embedded selfie photos.
 */
async function buildCSWorksheet(
  workbook: ExcelJS.Workbook,
  records: AttendanceRecord[],
  sheetName = 'Presensi CS'
) {
  const csGroups = groupCSRecords(records)
  if (csGroups.length === 0) return

  const worksheet = workbook.addWorksheet(sheetName, {
    pageSetup: { orientation: 'landscape' },
  })

  worksheet.columns = [
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

  styleHeaderRow(worksheet.getRow(1))

  for (let idx = 0; idx < csGroups.length; idx++) {
    const g = csGroups[idx]
    const rowNumber = idx + 2 // 1-based, row 1 is header

    const masukText = g.masuk
      ? `${formatJakartaTime(g.masuk.recorded_at)}${g.masuk.late_minutes > 0 ? ` (+${g.masuk.late_minutes}m)` : ''}`
      : 'Belum Absen'

    const istirahatText = g.istirahat
      ? `${formatJakartaTime(g.istirahat.recorded_at)}`
      : 'Belum Absen'

    const pulangText = g.pulang
      ? `${formatJakartaTime(g.pulang.recorded_at)}`
      : 'Belum Absen'

    const row = worksheet.addRow({
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
      review:
        g.overall_review_status === 'sudah_diperiksa'
          ? 'Sudah Diperiksa'
          : g.overall_review_status === 'perlu_tindak_lanjut'
          ? 'Perlu Tindak Lanjut'
          : 'Belum Diperiksa',
    })

    row.height = 44

    // Embed photos asynchronously
    if (g.masuk?.selfie_storage_path) {
      try {
        const img = await fetchResizedSelfieBase64(g.masuk.selfie_storage_path, 46)
        if (img) {
          const imageId = workbook.addImage({
            base64: img.base64,
            extension: img.extension,
          })
          worksheet.addImage(imageId, {
            tl: { col: 3 + 0.15, row: rowNumber - 1 + 0.1 },
            ext: { width: img.width, height: img.height },
            editAs: 'oneCell',
          })
        }
      } catch (e) {
        console.warn('Failed embedding masuk selfie in excel:', e)
      }
    }

    if (g.istirahat?.selfie_storage_path) {
      try {
        const img = await fetchResizedSelfieBase64(g.istirahat.selfie_storage_path, 46)
        if (img) {
          const imageId = workbook.addImage({
            base64: img.base64,
            extension: img.extension,
          })
          worksheet.addImage(imageId, {
            tl: { col: 5 + 0.15, row: rowNumber - 1 + 0.1 },
            ext: { width: img.width, height: img.height },
            editAs: 'oneCell',
          })
        }
      } catch (e) {
        console.warn('Failed embedding istirahat selfie in excel:', e)
      }
    }

    if (g.pulang?.selfie_storage_path) {
      try {
        const img = await fetchResizedSelfieBase64(g.pulang.selfie_storage_path, 46)
        if (img) {
          const imageId = workbook.addImage({
            base64: img.base64,
            extension: img.extension,
          })
          worksheet.addImage(imageId, {
            tl: { col: 7 + 0.15, row: rowNumber - 1 + 0.1 },
            ext: { width: img.width, height: img.height },
            editAs: 'oneCell',
          })
        }
      } catch (e) {
        console.warn('Failed embedding pulang selfie in excel:', e)
      }
    }
  }

  styleDataRows(worksheet, 44)
}

/**
 * Build Security worksheet with per-transaction format and embedded selfie photos.
 */
async function buildSecurityWorksheet(
  workbook: ExcelJS.Workbook,
  records: AttendanceRecord[],
  sheetName = 'Presensi Security'
) {
  const secRecords = records.filter(r => r.category === 'Security')
  if (secRecords.length === 0) return

  const worksheet = workbook.addWorksheet(sheetName, {
    pageSetup: { orientation: 'landscape' },
  })

  worksheet.columns = [
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

  styleHeaderRow(worksheet.getRow(1))

  for (let idx = 0; idx < secRecords.length; idx++) {
    const rec = secRecords[idx]
    const rowNumber = idx + 2

    const row = worksheet.addRow({
      no: idx + 1,
      foto_selfie: rec.selfie_storage_path ? '' : '-',
      name: rec.employee_name,
      category: rec.category,
      shift: rec.shift || '-',
      type: rec.attendance_type.toUpperCase(),
      work_date: formatSecurityDisplayDate(rec.work_date, rec.shift, rec.attendance_type, rec.category),
      recorded_at: formatJakartaTime(rec.recorded_at),
      status: rec.attendance_status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat',
      late_minutes: rec.late_minutes > 0 ? rec.late_minutes : 0,
      review_status:
        rec.review_status === 'sudah_diperiksa'
          ? 'Sudah Diperiksa'
          : rec.review_status === 'perlu_tindak_lanjut'
          ? 'Perlu Tindak Lanjut'
          : 'Belum Diperiksa',
      admin_notes: rec.admin_notes || rec.reason || '',
    })

    row.height = 44

    // Embed selfie photo
    if (rec.selfie_storage_path) {
      try {
        const img = await fetchResizedSelfieBase64(rec.selfie_storage_path, 46)
        if (img) {
          const imageId = workbook.addImage({
            base64: img.base64,
            extension: img.extension,
          })
          worksheet.addImage(imageId, {
            tl: { col: 1 + 0.15, row: rowNumber - 1 + 0.1 },
            ext: { width: img.width, height: img.height },
            editAs: 'oneCell',
          })
        }
      } catch (e) {
        console.warn('Failed embedding security selfie in excel:', e)
      }
    }
  }

  styleDataRows(worksheet, 44)
}

/**
 * Export daily recap to Excel
 */
export async function exportDailyRecapExcel(
  records: AttendanceRecord[],
  selectedDate: string
) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SIPATEN'
  workbook.created = new Date()

  const hasCS = records.some(r => r.category === 'CS')
  const hasSec = records.some(r => r.category === 'Security')

  if (hasCS) {
    await buildCSWorksheet(workbook, records, 'Rekap Harian CS')
  }
  if (hasSec) {
    await buildSecurityWorksheet(workbook, records, 'Rekap Harian Security')
  }

  // Fallback if no records
  if (!hasCS && !hasSec) {
    const ws = workbook.addWorksheet('Rekap Harian')
    ws.addRow(['Tidak ada data presensi untuk tanggal terpilih'])
  }

  const filename = `SIPATEN_Rekap_Harian_${selectedDate}.xlsx`
  await downloadWorkbook(workbook, filename)
}

/**
 * Export monthly recap summary to Excel
 */
export async function exportMonthlyRecapExcel(
  summaries: MonthlyEmployeeSummary[],
  monthLabel: string
) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SIPATEN'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet('Rekap Bulanan', {
    pageSetup: { orientation: 'portrait' },
  })

  worksheet.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Nama Pegawai', key: 'name', width: 26 },
    { header: 'Kategori', key: 'category', width: 14 },
    { header: 'Jumlah Hari Kerja', key: 'total_days', width: 18 },
    { header: 'Total Tepat Waktu', key: 'total_tepat_waktu', width: 18 },
    { header: 'Total Terlambat', key: 'total_terlambat', width: 16 },
    { header: 'Total Menit Terlambat', key: 'total_late_minutes', width: 22 },
    { header: 'Total Rekaman Absen', key: 'records_count', width: 20 },
  ]

  styleHeaderRow(worksheet.getRow(1))

  summaries.forEach((sum, idx) => {
    worksheet.addRow({
      no: idx + 1,
      name: sum.employee_name,
      category: sum.category,
      total_days: sum.total_days,
      total_tepat_waktu: sum.total_tepat_waktu,
      total_terlambat: sum.total_terlambat,
      total_late_minutes: sum.total_late_minutes,
      records_count: sum.records_count,
    })
  })

  styleDataRows(worksheet, 22)

  const filename = `SIPATEN_Rekap_Bulanan_${monthLabel.replace(/\s+/g, '_')}.xlsx`
  await downloadWorkbook(workbook, filename)
}

/**
 * Export full attendance records list with filters (CS 1-row, Security per-transaksi, embedded photos)
 */
export async function exportAttendanceListExcel(
  records: AttendanceRecord[],
  filenamePrefix = 'SIPATEN_Data_Absensi'
) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SIPATEN'
  workbook.created = new Date()

  const hasCS = records.some(r => r.category === 'CS')
  const hasSec = records.some(r => r.category === 'Security')

  if (hasCS) {
    await buildCSWorksheet(workbook, records, 'Presensi CS')
  }
  if (hasSec) {
    await buildSecurityWorksheet(workbook, records, 'Presensi Security')
  }

  // Fallback if empty
  if (!hasCS && !hasSec) {
    const ws = workbook.addWorksheet('Data Absensi')
    ws.addRow(['Tidak ada data absensi untuk filter yang dipilih'])
  }

  const filename = `${filenamePrefix}_${formatJakartaDate(new Date()).replace(/\s+/g, '_')}.xlsx`
  await downloadWorkbook(workbook, filename)
}

export const exportRecapToExcel = exportAttendanceListExcel
