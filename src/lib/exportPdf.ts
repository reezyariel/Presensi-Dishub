import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { AttendanceRecord } from '../types/attendance'
import type { MonthlyEmployeeSummary } from './exportExcel'
import { formatJakartaTime, formatJakartaDate } from './scheduleEngine'
import { formatSecurityDisplayDate } from './securityDateDisplay'
import { groupCSRecords } from './attendanceGrouping'
import { fetchResizedSelfieBase64, type ResizedSelfieResult } from './selfieStorage'

/**
 * Generate Header with SIPATEN branding
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
  doc.text('SIPATEN — Sistem Rekapitulasi Presensi', 14, 14)

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 31)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(subtitle, 14, 37)
  doc.text(
    `Dicetak pada: ${formatJakartaDate(new Date())} pukul ${formatJakartaTime(new Date())}`,
    doc.internal.pageSize.getWidth() - 14,
    37,
    { align: 'right' }
  )

  // Separator line
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.5)
  doc.line(14, 41, doc.internal.pageSize.getWidth() - 14, 41)
}

/**
 * Pre-fetch and resize all selfie images for records.
 */
async function preloadRecordImages(records: AttendanceRecord[]): Promise<Map<string, ResizedSelfieResult>> {
  const map = new Map<string, ResizedSelfieResult>()
  const paths = Array.from(new Set(records.map(r => r.selfie_storage_path).filter(Boolean)))

  await Promise.all(
    paths.map(async (path) => {
      try {
        const res = await fetchResizedSelfieBase64(path, 46)
        if (res) map.set(path, res)
      } catch (e) {
        console.warn(`Failed preloading image for PDF: ${path}`, e)
      }
    })
  )

  return map
}

/**
 * Export daily recap to PDF
 */
export async function exportDailyRecapPdf(
  records: AttendanceRecord[],
  selectedDate: string
) {
  await exportAttendanceListPdf(
    records,
    `Laporan Rekapitulasi Presensi Harian — ${selectedDate}`,
    `SIPATEN_Rekap_Harian_${selectedDate}.pdf`
  )
}

/**
 * Export full attendance records list with filters (CS 1-row, Security per-transaksi, embedded photos)
 */
export async function exportAttendanceListPdf(
  records: AttendanceRecord[],
  customTitle = 'Laporan Data Presensi Pegawai',
  customFilename?: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const imageMap = await preloadRecordImages(records)

  const csGroups = groupCSRecords(records)
  const secRecords = records.filter(r => r.category === 'Security')

  addPdfHeader(
    doc,
    customTitle,
    `Total Baris CS: ${csGroups.length} | Total Transaksi Security: ${secRecords.length}`
  )

  let currentY = 46

  // ─────────────────────────────────────────────────────────
  // 1. CLEANING SERVICE (CS) TABLE: 1 ROW PER EMPLOYEE PER DATE
  // ─────────────────────────────────────────────────────────
  if (csGroups.length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(21, 128, 61)
    doc.text('A. Divisi Cleaning Service (CS) — 1 Baris Per Pegawai Per Tanggal', 14, currentY - 1)

    const csBody = csGroups.map((g, idx) => {
      return [
        idx + 1,
        g.employee_name,
        g.work_date,
        g.masuk?.selfie_storage_path ? '' : '-',
        g.masuk ? `${formatJakartaTime(g.masuk.recorded_at)}${g.masuk.late_minutes > 0 ? ` (+${g.masuk.late_minutes}m)` : ''}` : 'Belum Absen',
        g.istirahat?.selfie_storage_path ? '' : '-',
        g.istirahat ? `${formatJakartaTime(g.istirahat.recorded_at)}` : 'Belum Absen',
        g.pulang?.selfie_storage_path ? '' : '-',
        g.pulang ? `${formatJakartaTime(g.pulang.recorded_at)}` : 'Belum Absen',
        g.overall_attendance_status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat',
        g.overall_review_status === 'sudah_diperiksa' ? 'Sudah Diperiksa' : g.overall_review_status === 'perlu_tindak_lanjut' ? 'Perlu Tindak Lanjut' : 'Belum Diperiksa',
      ]
    })

    autoTable(doc, {
      startY: currentY + 1,
      head: [[
        'No',
        'Nama Pegawai',
        'Tanggal',
        'Foto Masuk',
        'Masuk',
        'Foto Istirahat',
        'Istirahat',
        'Foto Pulang',
        'Pulang',
        'Status Presensi',
        'Status Review',
      ]],
      body: csBody,
      theme: 'grid',
      headStyles: {
        fillColor: [21, 128, 61],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        valign: 'middle',
        minCellHeight: 13,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 34 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'center', cellWidth: 14 }, // Foto Masuk
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'center', cellWidth: 14 }, // Foto Istirahat
        6: { halign: 'center', cellWidth: 20 },
        7: { halign: 'center', cellWidth: 14 }, // Foto Pulang
        8: { halign: 'center', cellWidth: 20 },
        9: { halign: 'center', cellWidth: 22 },
        10: { halign: 'center', cellWidth: 26 },
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return
        const rowIndex = data.row.index
        const group = csGroups[rowIndex]
        if (!group) return

        let storagePath: string | null = null
        if (data.column.index === 3) storagePath = group.masuk?.selfie_storage_path ?? null
        else if (data.column.index === 5) storagePath = group.istirahat?.selfie_storage_path ?? null
        else if (data.column.index === 7) storagePath = group.pulang?.selfie_storage_path ?? null

        if (storagePath && imageMap.has(storagePath)) {
          const img = imageMap.get(storagePath)!
          const imgWMm = Math.min(10, (img.width * 25.4) / 96)
          const imgHMm = Math.min(10, (img.height * 25.4) / 96)
          const posX = data.cell.x + (data.cell.width - imgWMm) / 2
          const posY = data.cell.y + (data.cell.height - imgHMm) / 2
          try {
            doc.addImage(img.dataUrl, 'JPEG', posX, posY, imgWMm, imgHMm)
          } catch (e) {
            console.warn('Error adding image to PDF cell:', e)
          }
        }
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

    // Update currentY for next table if present
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentY = (doc as any).lastAutoTable.finalY + 12
  }

  // ─────────────────────────────────────────────────────────
  // 2. SECURITY TABLE: PER-TRANSACTION FORMAT (FORMAT LAMA)
  // ─────────────────────────────────────────────────────────
  if (secRecords.length > 0) {
    // If not enough vertical space, add new page
    if (currentY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      currentY = 20
    }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('B. Divisi Security — Format Transaksi Individual', 14, currentY - 1)

    const secBody = secRecords.map((r, idx) => {
      return [
        idx + 1,
        r.selfie_storage_path ? '' : '-',
        r.employee_name,
        r.shift || '-',
        r.attendance_type.toUpperCase(),
        formatSecurityDisplayDate(r.work_date, r.shift, r.attendance_type, r.category),
        formatJakartaTime(r.recorded_at),
        r.attendance_status === 'tepat_waktu' ? 'Tepat Waktu' : `Terlambat (+${r.late_minutes}m)`,
        r.review_status === 'sudah_diperiksa' ? 'Sudah Diperiksa' : r.review_status === 'perlu_tindak_lanjut' ? 'Perlu Tindak Lanjut' : 'Belum Diperiksa',
        r.admin_notes || r.reason || '-',
      ]
    })

    autoTable(doc, {
      startY: currentY + 1,
      head: [[
        'No',
        'Foto',
        'Nama Petugas',
        'Shift',
        'Tipe',
        'Tanggal',
        'Waktu Catat',
        'Ketepatan',
        'Review',
        'Catatan / Alasan',
      ]],
      body: secBody,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42], // Slate-900
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        valign: 'middle',
        minCellHeight: 13,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'center', cellWidth: 14 }, // Foto
        2: { cellWidth: 38 },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'center', cellWidth: 22 },
        6: { halign: 'center', cellWidth: 20 },
        7: { halign: 'center', cellWidth: 26 },
        8: { halign: 'center', cellWidth: 28 },
        9: { cellWidth: 'auto' },
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return
        const rowIndex = data.row.index
        const rec = secRecords[rowIndex]
        if (!rec?.selfie_storage_path) return

        if (imageMap.has(rec.selfie_storage_path)) {
          const img = imageMap.get(rec.selfie_storage_path)!
          const imgWMm = Math.min(10, (img.width * 25.4) / 96)
          const imgHMm = Math.min(10, (img.height * 25.4) / 96)
          const posX = data.cell.x + (data.cell.width - imgWMm) / 2
          const posY = data.cell.y + (data.cell.height - imgHMm) / 2
          try {
            doc.addImage(img.dataUrl, 'JPEG', posX, posY, imgWMm, imgHMm)
          } catch (e) {
            console.warn('Error adding security image to PDF cell:', e)
          }
        }
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
  }

  // Fallback if completely empty
  if (csGroups.length === 0 && secRecords.length === 0) {
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    doc.text('Tidak ada data absensi untuk filter yang dipilih.', 14, currentY + 10)
  }

  const filename = customFilename || `SIPATEN_Data_Absensi_${formatJakartaDate(new Date()).replace(/\s+/g, '_')}.pdf`
  doc.save(filename)
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

  doc.save(`SIPATEN_Rekap_Bulanan_${monthLabel.replace(/\s+/g, '_')}.pdf`)
}
