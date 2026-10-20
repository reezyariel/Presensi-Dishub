import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { AttendanceRecord } from '../types/attendance'
import type { MonthlyEmployeeSummary } from './exportExcel'
import { formatJakartaTime, formatJakartaDate } from './scheduleEngine'

/**
 * Generate Header with ShiftTrack branding
 */
function addPdfHeader(
  doc: jsPDF,
  title: string,
  subtitle: string
) {
  // Brand header bar
  doc.setFillColor(21, 128, 61) // #15803d
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('ShiftTrack — Sistem Rekapitulasi Presensi', 14, 14)

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 32)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(subtitle, 14, 38)
  doc.text(
    `Dicetak pada: ${formatJakartaDate(new Date())} pukul ${formatJakartaTime(new Date())}`,
    doc.internal.pageSize.getWidth() - 14,
    38,
    { align: 'right' }
  )

  // Separator line
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.5)
  doc.line(14, 42, doc.internal.pageSize.getWidth() - 14, 42)
}

/**
 * Export daily recap to PDF
 */
export function exportDailyRecapPdf(
  records: AttendanceRecord[],
  selectedDate: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  addPdfHeader(
    doc,
    `Laporan Rekapitulasi Absensi Harian`,
    `Tanggal: ${selectedDate} | Total Rekaman: ${records.length}`
  )

  const bodyData = records.map((rec, index) => [
    index + 1,
    rec.employee_name,
    rec.category,
    rec.shift || '-',
    rec.attendance_type.toUpperCase(),
    formatJakartaTime(rec.recorded_at),
    rec.scheduled_start || '-',
    rec.attendance_status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat',
    rec.late_minutes > 0 ? `${rec.late_minutes} mnt` : '-',
    rec.review_status === 'sudah_diperiksa'
      ? 'Sudah Diperiksa'
      : rec.review_status === 'perlu_tindak_lanjut'
      ? 'Perlu Tindak Lanjut'
      : 'Belum Diperiksa',
    rec.admin_notes || '-',
  ])

  autoTable(doc, {
    startY: 46,
    head: [[
      'No',
      'Nama',
      'Kategori',
      'Shift',
      'Tipe',
      'Jam Absen',
      'Jadwal',
      'Status',
      'Terlambat',
      'Pemeriksaan',
      'Catatan',
    ]],
    body: bodyData,
    theme: 'grid',
    headStyles: {
      fillColor: [21, 128, 61],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      valign: 'middle',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 38 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'center', cellWidth: 18 },
      5: { halign: 'center', cellWidth: 20 },
      6: { halign: 'center', cellWidth: 18 },
      7: { halign: 'center', cellWidth: 24 },
      8: { halign: 'center', cellWidth: 20 },
      9: { halign: 'center', cellWidth: 30 },
      10: { cellWidth: 'auto' },
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const pageStr = `Halaman ${data.pageNumber}`
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text(
        pageStr,
        doc.internal.pageSize.getWidth() - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' }
      )
    },
  })

  doc.save(`ShiftTrack_Rekap_Harian_${selectedDate}.pdf`)
}

/**
 * Export monthly recap summary to PDF
 */
export function exportMonthlyRecapPdf(
  summaries: MonthlyEmployeeSummary[],
  monthLabel: string
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  addPdfHeader(
    doc,
    `Laporan Rekapitulasi Absensi Bulanan`,
    `Periode: ${monthLabel} | Total Pegawai: ${summaries.length}`
  )

  const bodyData = summaries.map((sum, index) => [
    index + 1,
    sum.employee_name,
    sum.category,
    sum.total_days,
    sum.total_tepat_waktu,
    sum.total_terlambat,
    sum.total_late_minutes > 0 ? `${sum.total_late_minutes} mnt` : '0 mnt',
    sum.records_count,
  ])

  autoTable(doc, {
    startY: 46,
    head: [[
      'No',
      'Nama Pegawai',
      'Kategori',
      'Hari Kerja',
      'Tepat Waktu',
      'Terlambat',
      'Total Menit Telat',
      'Total Absensi',
    ]],
    body: bodyData,
    theme: 'grid',
    headStyles: {
      fillColor: [21, 128, 61],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      valign: 'middle',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 46 },
      2: { halign: 'center', cellWidth: 24 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 20 },
      6: { halign: 'center', cellWidth: 28 },
      7: { halign: 'center', cellWidth: 20 },
    },
    didDrawPage: (data) => {
      const pageStr = `Halaman ${data.pageNumber}`
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text(
        pageStr,
        doc.internal.pageSize.getWidth() - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' }
      )
    },
  })

  doc.save(`ShiftTrack_Rekap_Bulanan_${monthLabel.replace(/\s+/g, '_')}.pdf`)
}
