// ============================================================
// SIPATEN — ReviewActionModal Component
// Enterprise Verification Modal with Sequential Review Navigation
// Previous/Next, Position Indicator, Deep Evidence & Audit Trail
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import {
  X, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle,
  Camera, MapPin, ExternalLink, RefreshCw, ZoomIn,
  Clock, Shield, User, FileText, History, AlertCircle
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatJakartaTime, getSecurityShiftDisplayLabel } from '../../lib/scheduleEngine'
import { formatDistance } from '../../lib/officeLocation'
import { getSignedSelfieUrl } from '../../lib/selfieStorage'
import {
  getReviewAssistanceFlags,
  getEmployeeDisplayCode,
  formatReviewWorkDate,
  formatReviewTime,
  isOvernightSecurityRecord,
} from '../../lib/reviewAssistance'
import { AttendanceStatusBadge, CategoryBadge, AttendanceTypeBadge } from './StatusBadges'
import type { AttendanceRecord, ReviewStatus, AttendanceAuditLog } from '../../types/attendance'

interface Props {
  isOpen: boolean
  onClose: () => void
  currentRecord: AttendanceRecord | null
  allRecords: AttendanceRecord[]
  currentIndex: number
  totalInView: number
  pendingReviewCount: number
  onNavigatePrevious: () => void
  onNavigateNext: () => void
  onRecordUpdated: (updatedRecord: AttendanceRecord) => void
  employeeCodeMap?: Map<string, string>
  onOpenPhotoPreview: (record: AttendanceRecord) => void
  currentAdminId?: string
}

export default function ReviewActionModal({
  isOpen,
  onClose,
  currentRecord,
  allRecords,
  currentIndex,
  totalInView,
  pendingReviewCount,
  onNavigatePrevious,
  onNavigateNext,
  onRecordUpdated,
  employeeCodeMap,
  onOpenPhotoPreview,
  currentAdminId,
}: Props) {
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [isLoadingPhoto, setIsLoadingPhoto] = useState(false)
  const [actionNotes, setActionNotes] = useState('')
  const [newStatus, setNewStatus] = useState<ReviewStatus>('sudah_diperiksa')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null)
  const [auditLogs, setAuditLogs] = useState<AttendanceAuditLog[]>([])

  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex < totalInView - 1

  // Load selfie and initial states when currentRecord changes
  useEffect(() => {
    if (!isOpen || !currentRecord) return

    setSaveError(null)
    setSaveSuccessNotice(null)
    setActionNotes(currentRecord.admin_notes || '')
    // Default to 'sudah_diperiksa' if pending or perlu tindak lanjut, or keep current
    setNewStatus(
      currentRecord.review_status === 'perlu_tindak_lanjut' || currentRecord.review_status === 'belum_diperiksa'
        ? 'sudah_diperiksa'
        : currentRecord.review_status
    )

    // Load signed selfie URL
    if (currentRecord.selfie_storage_path) {
      setIsLoadingPhoto(true)
      getSignedSelfieUrl(currentRecord.selfie_storage_path, 3600)
        .then((url) => {
          setSelfieUrl(url)
        })
        .catch(() => {
          setSelfieUrl(null)
        })
        .finally(() => setIsLoadingPhoto(false))
    } else {
      setSelfieUrl(null)
      setIsLoadingPhoto(false)
    }

    // Load previous audit logs for this record
    const targetRecordId = currentRecord.id
    async function loadRecordAuditLogs() {
      try {
        const { data } = await supabase
          .from('attendance_audit_logs')
          .select('*, admin_profiles(full_name)')
          .eq('attendance_record_id', targetRecordId)
          .order('created_at', { ascending: false })

        setAuditLogs((data ?? []) as AttendanceAuditLog[])
      } catch {
        setAuditLogs([])
      }
    }
    loadRecordAuditLogs()
  }, [isOpen, currentRecord])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in textarea or input
      if (['TEXTAREA', 'INPUT'].includes((e.target as HTMLElement)?.tagName)) {
        if (e.key === 'Escape') onClose()
        return
      }

      if (e.key === 'ArrowLeft' && hasPrevious && !isSubmitting) {
        e.preventDefault()
        onNavigatePrevious()
      } else if (e.key === 'ArrowRight' && hasNext && !isSubmitting) {
        e.preventDefault()
        onNavigateNext()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, hasPrevious, hasNext, isSubmitting, onNavigatePrevious, onNavigateNext, onClose])

  const handleSaveDecision = useCallback(async (autoAdvance: boolean) => {
    if (!currentRecord || !currentAdminId) {
      setSaveError('Identitas admin tidak terverifikasi. Silakan muat ulang halaman.')
      return
    }

    const trimmedNotes = actionNotes.trim()
    if (!trimmedNotes) {
      setSaveError('Catatan & Justifikasi Admin wajib diisi.')
      return
    }

    setIsSubmitting(true)
    setSaveError(null)

    try {
      const oldValues = {
        review_status: currentRecord.review_status,
        admin_notes: currentRecord.admin_notes,
      }
      const newValues = {
        review_status: newStatus,
        admin_notes: trimmedNotes,
      }

      // Step 1: Update attendance_records
      const { error: updateErr } = await supabase
        .from('attendance_records')
        .update({
          review_status: newStatus,
          admin_notes: trimmedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentRecord.id)

      if (updateErr) {
        throw new Error(`Gagal menyimpan ke database: ${updateErr.message}`)
      }

      // Step 2: Insert into attendance_audit_logs
      const { error: auditErr } = await supabase.from('attendance_audit_logs').insert({
        attendance_record_id: currentRecord.id,
        admin_id: currentAdminId,
        action: 'review_status_change',
        old_values: oldValues,
        new_values: newValues,
        reason: trimmedNotes,
      })

      if (auditErr) {
        console.warn('[ReviewActionModal] Audit log warning:', auditErr.message)
      }

      // Backend confirmed success!
      const updatedRecord: AttendanceRecord = {
        ...currentRecord,
        review_status: newStatus,
        admin_notes: trimmedNotes,
        updated_at: new Date().toISOString(),
      }

      onRecordUpdated(updatedRecord)

      setSaveSuccessNotice(
        `Keputusan ${newStatus === 'sudah_diperiksa' ? 'Persetujuan' : 'Tindak Lanjut'} untuk ${updatedRecord.employee_name} berhasil disimpan.`
      )

      if (autoAdvance && hasNext) {
        setTimeout(() => {
          onNavigateNext()
        }, 400)
      } else {
        setTimeout(() => {
          setSaveSuccessNotice(null)
        }, 3000)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kegagalan saat menyimpan keputusan.'
      console.error('[ReviewActionModal] Save error:', msg)
      // DO NOT advance on error! Show explicit message.
      setSaveError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }, [currentRecord, currentAdminId, actionNotes, newStatus, onRecordUpdated, hasNext, onNavigateNext])

  if (!isOpen || !currentRecord) return null

  const flags = getReviewAssistanceFlags(currentRecord, allRecords)
  const employeeCode = getEmployeeDisplayCode(currentRecord, employeeCodeMap)
  const isOvernight = isOvernightSecurityRecord(currentRecord)

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs animate-fade-in overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose()
      }}
    >
      <div className="bg-white rounded-3xl border border-neutral-200 max-w-4xl w-full p-6 shadow-2xl space-y-5 my-auto max-h-[92vh] flex flex-col overflow-hidden animate-scale-up">
        {/* Modal Top Header with Sequential Navigation */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3.5 border-b border-neutral-100 gap-3 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-white uppercase tracking-wider">
                Verifikasi Presensi
              </span>
              <span className="text-xs font-semibold text-neutral-500">
                Pengajuan {currentIndex + 1} dari {totalInView}
              </span>
              {pendingReviewCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {pendingReviewCount} Menunggu Review
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-neutral-900 mt-1">
              Pemeriksaan Bukti & Keputusan Admin
            </h3>
          </div>

          {/* Navigation Controls in Header */}
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={onNavigatePrevious}
              disabled={!hasPrevious || isSubmitting}
              className="px-2.5 py-1.5 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold flex items-center gap-1 transition-colors"
              title="Pengajuan Sebelumnya (←)"
            >
              <ChevronLeft size={15} />
              <span className="hidden sm:inline">Sebelumnya</span>
            </button>

            <span className="text-xs font-mono font-bold text-neutral-800 px-1">
              {currentIndex + 1}/{totalInView}
            </span>

            <button
              type="button"
              onClick={onNavigateNext}
              disabled={!hasNext || isSubmitting}
              className="px-2.5 py-1.5 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold flex items-center gap-1 transition-colors"
              title="Pengajuan Berikutnya (→)"
            >
              <span className="hidden sm:inline">Berikutnya</span>
              <ChevronRight size={15} />
            </button>

            <div className="w-px h-5 bg-neutral-200 mx-1" />

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 rounded-xl text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
              title="Tutup (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Success Banner Notice */}
        {saveSuccessNotice && (
          <div className="p-3 bg-emerald-900 text-white rounded-xl shadow-xs flex items-center gap-2.5 animate-fade-in text-xs flex-shrink-0">
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
            <span className="font-medium">{saveSuccessNotice}</span>
          </div>
        )}

        {/* Error Alert Banner Notice */}
        {saveError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-900 rounded-xl shadow-xs flex items-start gap-2.5 animate-fade-in text-xs flex-shrink-0">
            <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="font-bold block">Penyimpanan Gagal:</strong>
              <span>{saveError}</span>
              <span className="block text-[11px] text-red-600/80 mt-0.5">
                Sistem tidak berpindah ke pengajuan berikutnya sebelum perbaikan berhasil dikonfirmasi.
              </span>
            </div>
          </div>
        )}

        {/* Modal Scrollable Body: Split Desktop Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 overflow-y-auto pr-1">
          {/* Left Column (5 Cols): Selfie, GPS & Assistance Indicators */}
          <div className="md:col-span-5 space-y-3.5">
            {/* Selfie Photo Card */}
            <div>
              <div className="flex items-center justify-between pb-1.5">
                <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                  Foto Selfie Verifikasi
                </span>
                {selfieUrl && (
                  <button
                    type="button"
                    onClick={() => onOpenPhotoPreview(currentRecord)}
                    className="text-[11px] text-neutral-700 hover:text-neutral-900 font-semibold flex items-center gap-1"
                  >
                    <ZoomIn size={12} />
                    <span>Perbesar</span>
                  </button>
                )}
              </div>

              <div className="w-full aspect-square rounded-2xl bg-neutral-100 border border-neutral-200 overflow-hidden relative flex items-center justify-center group shadow-2xs">
                {isLoadingPhoto ? (
                  <div className="flex flex-col items-center gap-1.5 text-neutral-500 text-xs">
                    <RefreshCw size={20} className="animate-spin text-neutral-800" />
                    <span>Memuat foto selfie...</span>
                  </div>
                ) : selfieUrl ? (
                  <>
                    <img
                      src={selfieUrl}
                      alt={`Selfie ${currentRecord.employee_name}`}
                      className="w-full h-full object-cover cursor-pointer transition-transform duration-200 group-hover:scale-105"
                      onClick={() => onOpenPhotoPreview(currentRecord)}
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <span className="px-3 py-1 bg-black/75 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5">
                        <ZoomIn size={13} />
                        Klik untuk Memperbesar
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-neutral-400 text-xs p-4 text-center">
                    <Camera size={28} className="opacity-40" />
                    <span className="font-semibold text-neutral-600">Foto selfie tidak tersedia</span>
                    <span className="text-[10px] text-neutral-400">
                      Tidak ada rekaman foto pada pengajuan ini
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Geofence & Location Details */}
            <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-1.5 text-neutral-600 font-medium">
                  <MapPin size={14} className="text-neutral-500 flex-shrink-0" />
                  <span>Jarak ke Kantor:</span>
                </span>
                <span className="font-bold text-neutral-900 font-mono">
                  {currentRecord.distance_meters !== null && currentRecord.distance_meters !== undefined
                    ? formatDistance(currentRecord.distance_meters)
                    : 'Tidak tercatat'}
                </span>
              </div>

              {currentRecord.latitude !== null && currentRecord.latitude !== undefined && currentRecord.longitude !== null && currentRecord.longitude !== undefined ? (
                <div className="space-y-1 pt-1 border-t border-neutral-200/60">
                  <div className="flex items-center justify-between text-[11px] font-mono text-neutral-600">
                    <span>Koordinat:</span>
                    <span>{currentRecord.latitude.toFixed(6)}, {currentRecord.longitude.toFixed(6)}</span>
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${currentRecord.latitude},${currentRecord.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-neutral-900 hover:underline font-semibold"
                  >
                    <span>Buka Peta GPS</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              ) : (
                <p className="text-[11px] text-neutral-400 italic pt-1 border-t border-neutral-200/60">
                  Koordinat GPS tidak tersedia pada catatan ini.
                </p>
              )}
            </div>

            {/* Indikator Bantuan Pemeriksaan (Visual Aid Only) */}
            <div className={`p-3 rounded-2xl border text-xs space-y-1.5 ${
              flags.warningCount > 0
                ? 'bg-amber-50/70 border-amber-200/80 text-amber-950'
                : 'bg-emerald-50/70 border-emerald-200/80 text-emerald-950'
            }`}>
              <div className="flex items-center gap-1.5 font-bold text-xs">
                {flags.warningCount > 0 ? (
                  <>
                    <AlertTriangle size={14} className="text-amber-700 flex-shrink-0" />
                    <span>Catatan Bantuan Pemeriksaan ({flags.warningCount})</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-700 flex-shrink-0" />
                    <span>Kelengkapan Bukti Terpenuhi</span>
                  </>
                )}
              </div>

              {flags.warningCount > 0 ? (
                <ul className="space-y-1 text-[11px] list-disc list-inside text-amber-900">
                  {flags.reasons.map((reason, idx) => (
                    <li key={idx} className="leading-snug">
                      {reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-emerald-800 leading-snug">
                  Foto verifikasi tersedia, koordinat GPS tercatat, dan posisi berada dalam toleransi radius kantor.
                </p>
              )}
              <span className="text-[10px] text-neutral-500 block pt-1 border-t border-neutral-200/50">
                *Indikator di atas hanya alat bantu visual; keputusan sepenuhnya ditentukan oleh Admin.
              </span>
            </div>
          </div>

          {/* Right Column (7 Cols): Details & Decision Form */}
          <div className="md:col-span-7 space-y-4">
            {/* Employee Information Card */}
            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200/70">
                <div className="flex items-center gap-2">
                  <User size={15} className="text-neutral-500" />
                  <span className="font-bold text-neutral-900 text-sm">{currentRecord.employee_name}</span>
                </div>
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-neutral-200 text-neutral-800">
                  ID: {employeeCode}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-neutral-700">
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">
                    Divisi & Peran
                  </span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <CategoryBadge category={currentRecord.category} />
                    <AttendanceTypeBadge type={currentRecord.attendance_type} />
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">
                    {currentRecord.category === 'Security' ? 'Shift Kerja' : 'Jadwal Acuan'}
                  </span>
                  <div className="mt-0.5 font-semibold text-neutral-900">
                    {currentRecord.category === 'Security' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-200 text-neutral-800 text-[11px] font-bold">
                        <Shield size={11} />
                        {getSecurityShiftDisplayLabel(currentRecord.shift, currentRecord.work_date)}
                      </span>
                    ) : (
                      <span className="font-mono">
                        {currentRecord.scheduled_start && currentRecord.scheduled_end
                          ? `${currentRecord.scheduled_start} - ${currentRecord.scheduled_end}`
                          : 'Fleksibel'}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">
                    Tanggal & Waktu
                  </span>
                  <span className="font-medium text-neutral-900 block mt-0.5">
                    {formatReviewWorkDate(currentRecord)}
                  </span>
                  <span className="font-mono text-neutral-600 text-[11px]">
                    {formatReviewTime(currentRecord.recorded_at)}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">
                    Status Ketepatan
                  </span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <AttendanceStatusBadge status={currentRecord.attendance_status} />
                    {currentRecord.late_minutes > 0 && (
                      <span className="font-mono font-bold text-amber-700 text-[11px]">
                        +{currentRecord.late_minutes}m
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Overnight shift indicator for Security */}
              {isOvernight && (
                <div className="p-2 rounded-xl bg-neutral-200/70 text-[11px] text-neutral-800 font-medium flex items-center gap-1.5">
                  <Clock size={13} className="text-neutral-600 flex-shrink-0" />
                  <span>
                    Shift malam melewati pergantian hari. Presensi pulang ini terikat secara sah pada tanggal kerja {currentRecord.work_date}.
                  </span>
                </div>
              )}

              {/* Reason from employee */}
              {currentRecord.reason && (
                <div className="pt-2 border-t border-neutral-200/70">
                  <span className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">
                    Alasan / Keterangan Karyawan:
                  </span>
                  <p className="bg-white p-2.5 rounded-xl border border-neutral-200 text-neutral-900 font-medium italic">
                    &ldquo;{currentRecord.reason}&rdquo;
                  </p>
                </div>
              )}

              {/* Existing admin notes if present */}
              {currentRecord.admin_notes && (
                <div className="pt-1.5 border-t border-neutral-200/70">
                  <span className="text-[10px] text-neutral-500 uppercase font-bold block mb-0.5">
                    Catatan Sebelumnya:
                  </span>
                  <p className="text-neutral-700 text-[11px]">
                    {currentRecord.admin_notes}
                  </p>
                </div>
              )}
            </div>

            {/* Decision Radio Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-900 block">
                Keputusan Verifikasi <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setNewStatus('sudah_diperiksa')}
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    newStatus === 'sudah_diperiksa'
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-md ring-2 ring-neutral-900/10'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <CheckCircle2 size={16} className={newStatus === 'sudah_diperiksa' ? 'text-emerald-400' : 'text-neutral-400'} />
                  <span>Setujui (Sudah Diperiksa)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewStatus('perlu_tindak_lanjut')}
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    newStatus === 'perlu_tindak_lanjut'
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-md ring-2 ring-neutral-900/10'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <AlertTriangle size={16} className={newStatus === 'perlu_tindak_lanjut' ? 'text-amber-400' : 'text-neutral-400'} />
                  <span>Perlu Tindak Lanjut</span>
                </button>
              </div>
            </div>

            {/* Mandatory Admin Notes Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-900">
                  Catatan & Justifikasi Admin <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] text-neutral-400">Wajib diisi</span>
              </div>
              <textarea
                rows={3}
                placeholder="Contoh: Selfie dan geofence valid, toleransi keterlambatan tugas pos disetujui..."
                value={actionNotes}
                onChange={(e) => {
                  setActionNotes(e.target.value)
                  if (saveError) setSaveError(null)
                }}
                className="form-input text-xs py-2.5 px-3 resize-none w-full rounded-xl"
                required
              />
              <p className="text-[10px] text-neutral-400">
                Catatan ini akan tersimpan permanen pada riwayat log audit keputusan administrator.
              </p>
            </div>

            {/* Audit History for this Record */}
            {auditLogs.length > 0 && (
              <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-neutral-700 text-[11px] uppercase tracking-wider">
                  <History size={13} className="text-neutral-500" />
                  <span>Riwayat Keputusan Sebelumnya ({auditLogs.length})</span>
                </div>
                <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-2 rounded-lg bg-white border border-neutral-100 text-[11px] space-y-0.5">
                      <div className="flex items-center justify-between text-neutral-500 text-[10px]">
                        <span>{log.admin_profiles?.full_name || 'Admin'}</span>
                        <span className="font-mono">{formatJakartaTime(new Date(log.created_at))} WIB</span>
                      </div>
                      <p className="text-neutral-800 font-medium">&ldquo;{log.reason}&rdquo;</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-neutral-100 flex-shrink-0">
          <span className="text-[11px] text-neutral-400 hidden sm:inline">
            Gunakan tombol panah keyboard ← / → untuk navigasi cepat
          </span>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary text-xs py-2 px-4 rounded-xl"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={() => handleSaveDecision(false)}
              disabled={isSubmitting || !actionNotes.trim()}
              className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border border-neutral-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <FileText size={13} />
                  <span>Simpan Keputusan</span>
                </>
              )}
            </button>

            {hasNext && (
              <button
                type="button"
                onClick={() => handleSaveDecision(true)}
                disabled={isSubmitting || !actionNotes.trim()}
                className="btn-primary text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <span>Simpan & Berikutnya</span>
                    <ChevronRight size={14} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
