import ExcelJS from 'exceljs'
import type { AttendanceRecord } from '../types/attendance'
import { formatJakartaTime, formatJakartaDate } from './scheduleEngine'

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
function styleDataRows(worksheet: ExcelJS.Worksheet) {
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 20
      row.eachCell((cell) => {
        cell.font = { size: 9 }
        cell.alignment = { vertical: 'middle' }
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
 * Export daily recap to Excel
 */
export async function exportDailyRecapExcel(
  records: AttendanceRecord[],
  selectedDate: string
) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SIPATEN'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet('Rekap Harian', {
    pageSetup: { orientation: 'landscape' },
  })

  // Columns definition
  worksheet.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Nama Pegawai', key: 'name', width: 24 },
    { header: 'Kategori', key: 'category', width: 14 },
    { header: 'Shift', key: 'shift', width: 14 },
    { header: 'Tanggal Kerja', key: 'work_date', width: 14 },
    { header: 'Tipe Absensi', key: 'attendance_type', width: 14 },
    { header: 'Waktu Catat', key: 'recorded_at', width: 14 },
    { header: 'Jadwal Mulai', key: 'scheduled_start', width: 14 },
    { header: 'Status Kehadiran', key: 'status', width: 16 },
    { header: 'Terlambat (Mnt)', key: 'late_minutes', width: 16 },
    { header: 'Status Periksa', key: 'review_status', width: 18 },
    { header: 'Catatan Admin', key: 'admin_notes', width: 28 },
  ]

  styleHeaderRow(worksheet.getRow(1))

  records.forEach((rec, idx) => {
    worksheet.addRow({
      no: idx + 1,
      name: rec.employee_name,
      category: rec.category,
      shift: rec.shift || '-',
      work_date: rec.work_date,
      attendance_type: rec.attendance_type.toUpperCase(),
      recorded_at: formatJakartaTime(rec.recorded_at),
      scheduled_start: rec.scheduled_start || '-',
      status: rec.attendance_status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat',
      late_minutes: rec.late_minutes > 0 ? rec.late_minutes : 0,
      review_status:
        rec.review_status === 'sudah_diperiksa'
          ? 'Sudah Diperiksa'
          : rec.review_status === 'perlu_tindak_lanjut'
            ? 'Perlu Tindak Lanjut'
            : 'Belum Diperiksa',
      admin_notes: rec.admin_notes || '',
    })
  })

  styleDataRows(worksheet)

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

  styleDataRows(worksheet)

  const filename = `SIPATEN_Rekap_Bulanan_${monthLabel.replace(/\s+/g, '_')}.xlsx`
  await downloadWorkbook(workbook, filename)
}

/**
 * Export full attendance records list with filters
 */
export async function exportAttendanceListExcel(
  records: AttendanceRecord[],
  filenamePrefix = 'SIPATEN_Data_Absensi'
) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SIPATEN'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet('Data Absensi', {
    pageSetup: { orientation: 'landscape' },
  })

  worksheet.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Nama Pegawai', key: 'name', width: 24 },
    { header: 'Kategori', key: 'category', width: 12 },
    { header: 'Shift', key: 'shift', width: 12 },
    { header: 'Tipe Absen', key: 'type', width: 14 },
    { header: 'Tanggal Kerja', key: 'work_date', width: 14 },
    { header: 'Waktu Absen', key: 'recorded_at', width: 16 },
    { header: 'Status Kehadiran', key: 'status', width: 16 },
    { header: 'Keterlambatan (Mnt)', key: 'late_minutes', width: 18 },
    { header: 'Status Pemeriksaan', key: 'review_status', width: 18 },
    { header: 'Catatan Admin', key: 'admin_notes', width: 26 },
  ]

  styleHeaderRow(worksheet.getRow(1))

  records.forEach((rec, idx) => {
    worksheet.addRow({
      no: idx + 1,
      name: rec.employee_name,
      category: rec.category,
      shift: rec.shift || '-',
      type: rec.attendance_type.toUpperCase(),
      work_date: rec.work_date,
      recorded_at: `${rec.work_date} ${formatJakartaTime(rec.recorded_at)}`,
      status: rec.attendance_status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat',
      late_minutes: rec.late_minutes,
      review_status:
        rec.review_status === 'sudah_diperiksa'
          ? 'Sudah Diperiksa'
          : rec.review_status === 'perlu_tindak_lanjut'
            ? 'Perlu Tindak Lanjut'
            : 'Belum Diperiksa',
      admin_notes: rec.admin_notes || '',
    })
  })

  styleDataRows(worksheet)

  const filename = `${filenamePrefix}_${formatJakartaDate(new Date()).replace(/\s+/g, '_')}.xlsx`
  await downloadWorkbook(workbook, filename)
}

export const exportRecapToExcel = exportAttendanceListExcel
