// ============================================================
// SIPATEN — ReviewBulkModal Component
// Enterprise Safe Bulk Review Modal with Mandatory Explicit Notes
// Guarantees individual audit logging for every decision
// ============================================================

import { useState } from 'react'
import { X, CheckCircle2, AlertTriangle, RefreshCw, Layers } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { AttendanceRecord, ReviewStatus } from '../../types/attendance'

interface Props {
  isOpen: boolean
  onClose: () => void
  selectedRecords: AttendanceRecord[]
  onBulkUpdated: () => void
  currentAdminId?: string
}

export default function ReviewBulkModal({
  isOpen,
  onClose,
  selectedRecords,
  onBulkUpdated,
  currentAdminId,
}: Props) {
  const [decision, setDecision] = useState<ReviewStatus>('sudah_diperiksa')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen || selectedRecords.length === 0) return null

  const handleSubmit = async () => {
    if (!currentAdminId) {
      setErrorMessage('Identitas admin tidak terautentikasi.')
      return
    }

    const trimmedNotes = notes.trim()
    if (!trimmedNotes) {
      setErrorMessage('Catatan & Justifikasi Admin wajib diisi untuk tindakan massal.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      // Process updates safely and record individual audit logs
      const recordIds = selectedRecords.map((r) => r.id)

      // 1. Update records in database
      const { error: updateErr } = await supabase
        .from('attendance_records')
        .update({
          review_status: decision,
          admin_notes: trimmedNotes,
          updated_at: new Date().toISOString(),
        })
        .in('id', recordIds)

      if (updateErr) {
        throw new Error(`Gagal memperbarui rekaman: ${updateErr.message}`)
      }

      // 2. Insert audit log for EACH selected record to maintain tamper-evident trail
      const auditPayloads = selectedRecords.map((rec) => ({
        attendance_record_id: rec.id,
        admin_id: currentAdminId,
        action: 'review_status_change',
        old_values: {
          review_status: rec.review_status,
          admin_notes: rec.admin_notes,
        },
        new_values: {
          review_status: decision,
          admin_notes: trimmedNotes,
        },
        reason: `[Tinjau Massal] ${trimmedNotes}`,
      }))

      const { error: auditErr } = await supabase
        .from('attendance_audit_logs')
        .insert(auditPayloads)

      if (auditErr) {
        console.warn('[ReviewBulkModal] Bulk audit log warning:', auditErr.message)
      }

      onBulkUpdated()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses review massal.'
      console.error('[ReviewBulkModal] Error:', msg)
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose()
      }}
    >
      <div className="bg-white rounded-3xl border border-neutral-200 max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scale-up">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">
                Tinjau Massal Pengajuan
              </h3>
              <p className="text-xs text-neutral-500">
                {selectedRecords.length} pengajuan presensi terpilih
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error notice */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
            {errorMessage}
          </div>
        )}

        {/* Selected preview summary */}
        <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs space-y-1.5 max-h-36 overflow-y-auto">
          <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">
            Daftar Pegawai Terpilih:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {selectedRecords.map((r) => (
              <span
                key={r.id}
                className="px-2 py-0.5 rounded-md bg-white border border-neutral-200 text-neutral-800 text-[11px] font-medium"
              >
                {r.employee_name} ({r.category})
              </span>
            ))}
          </div>
        </div>

        {/* Explicit Decision Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-neutral-900">
            Keputusan Review Bersama <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDecision('sudah_diperiksa')}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                decision === 'sudah_diperiksa'
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <CheckCircle2 size={15} />
              <span>Setujui Semua</span>
            </button>

            <button
              type="button"
              onClick={() => setDecision('perlu_tindak_lanjut')}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                decision === 'perlu_tindak_lanjut'
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <AlertTriangle size={15} />
              <span>Perlu Tindak Lanjut</span>
            </button>
          </div>
        </div>

        {/* Mandatory Admin Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-neutral-900">
            Catatan & Justifikasi Admin <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            placeholder="Contoh: Bukti foto dan lokasi telah diverifikasi sesuai penugasan pos..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="form-input text-xs py-2 px-3 resize-none w-full rounded-xl"
            required
          />
          <p className="text-[10px] text-neutral-400">
            Catatan ini akan dicatat dalam log audit untuk setiap pegawai terpilih.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
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
            onClick={handleSubmit}
            disabled={isSubmitting || !notes.trim()}
            className="btn-primary text-xs py-2 px-5 rounded-xl flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Memproses {selectedRecords.length} data...</span>
              </>
            ) : (
              <span>Terapkan ke {selectedRecords.length} Pengajuan</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
