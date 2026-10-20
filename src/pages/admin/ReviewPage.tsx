// ============================================================
// ShiftTrack — Review & Verifikasi Presensi (Enterprise Desktop Layout)
// Tab Filters, Wide Data Table, Split Desktop Verification Modal
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import {
  CheckCircle, Clock,
  Search, AlertTriangle, ShieldCheck,
  CheckCircle2, X, MapPin, Camera, RefreshCw
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import {
  AttendanceStatusBadge,
  CategoryBadge,
  AttendanceTypeBadge,
} from '../../components/admin/StatusBadges'
import { formatJakartaTime, formatJakartaDate } from '../../lib/scheduleEngine'
import { formatDistance } from '../../lib/officeLocation'
import type { AttendanceRecord, ReviewStatus } from '../../types/attendance'

export default function ReviewPage() {
  const { profile } = useAuth()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [reviewFilter, setReviewFilter] = useState<ReviewStatus>('perlu_tindak_lanjut')
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [activeModalRecord, setActiveModalRecord] = useState<AttendanceRecord | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [newStatus, setNewStatus] = useState<ReviewStatus>('sudah_diperiksa')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedSelfieUrl, setSelectedSelfieUrl] = useState<string | null>(null)
  const [tabCounts, setTabCounts] = useState<{ perlu: number; belum: number; sudah: number }>({
    perlu: 0,
    belum: 0,
    sudah: 0,
  })

  // Load counts for all 3 tabs
  const loadTabCounts = useCallback(async () => {
    try {
      const [r1, r2, r3] = await Promise.all([
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('review_status', 'perlu_tindak_lanjut'),
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('review_status', 'belum_diperiksa'),
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('review_status', 'sudah_diperiksa'),
      ])
      setTabCounts({
        perlu: r1.count || 0,
        belum: r2.count || 0,
        sudah: r3.count || 0,
      })
    } catch {
      // ignore
    }
  }, [])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      let q = supabase
        .from('attendance_records')
        .select('*')
        .eq('review_status', reviewFilter)
        .order('recorded_at', { ascending: false })

      if (searchTerm.trim()) {
        q = q.ilike('employee_name', `%${searchTerm.trim()}%`)
      }

      const { data } = await q
      setRecords((data ?? []) as AttendanceRecord[])
      loadTabCounts()
    } finally {
      setIsLoading(false)
    }
  }, [reviewFilter, searchTerm, loadTabCounts])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openActionModal = async (record: AttendanceRecord) => {
    setActiveModalRecord(record)
    setActionNotes(record.admin_notes || '')
    setNewStatus(record.review_status === 'perlu_tindak_lanjut' ? 'sudah_diperiksa' : record.review_status)
    setSelectedSelfieUrl(null)

    // Load selfie signed URL if available
    if (record.selfie_storage_path) {
      const { data } = await supabase.storage
        .from('selfies')
        .createSignedUrl(record.selfie_storage_path, 3600)
      if (data?.signedUrl) {
        setSelectedSelfieUrl(data.signedUrl)
      }
    }
  }

  const handleUpdateStatus = async () => {
    if (!activeModalRecord || !profile) return
    if (!actionNotes.trim()) {
      alert('Catatan / alasan pemeriksaan wajib diisi sebelum menyimpan perubahan status.')
      return
    }
    setIsSubmitting(true)
    try {
      const oldValues = {
        review_status: activeModalRecord.review_status,
        admin_notes: activeModalRecord.admin_notes,
      }
      const newValues = {
        review_status: newStatus,
        admin_notes: actionNotes.trim(),
      }

      // Update attendance record
      const { error: updateErr } = await supabase
        .from('attendance_records')
        .update({
          review_status: newStatus,
          admin_notes: actionNotes.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeModalRecord.id)

      if (updateErr) throw updateErr

      // Log in audit log with mandatory justification
      await supabase.from('attendance_audit_logs').insert({
        attendance_record_id: activeModalRecord.id,
        admin_id: profile.id,
        action: 'review_status_change',
        old_values: oldValues,
        new_values: newValues,
        reason: actionNotes.trim(),
      })

      setActiveModalRecord(null)
      await loadData()
    } catch {
      alert('Gagal memperbarui status pemeriksaan. Silakan coba lagi.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Desktop Filter & Tab Card */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Review Filter Tabs */}
          <div className="flex items-center gap-2 bg-neutral-100/80 p-1 rounded-2xl border border-neutral-200 text-xs">
            {/* Perlu Tindak Lanjut */}
            <button
              onClick={() => setReviewFilter('perlu_tindak_lanjut')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                reviewFilter === 'perlu_tindak_lanjut'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-200/50'
              }`}
            >
              <AlertTriangle size={15} />
              <span>Perlu Tindak Lanjut</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                reviewFilter === 'perlu_tindak_lanjut' ? 'bg-white text-black' : 'bg-neutral-200 text-neutral-800'
              }`}>
                {tabCounts.perlu}
              </span>
            </button>

            {/* Belum Diperiksa */}
            <button
              onClick={() => setReviewFilter('belum_diperiksa')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                reviewFilter === 'belum_diperiksa'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-200/50'
              }`}
            >
              <Clock size={15} />
              <span>Belum Diperiksa</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                reviewFilter === 'belum_diperiksa' ? 'bg-white text-black' : 'bg-neutral-200 text-neutral-800'
              }`}>
                {tabCounts.belum}
              </span>
            </button>

            {/* Sudah Diperiksa */}
            <button
              onClick={() => setReviewFilter('sudah_diperiksa')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                reviewFilter === 'sudah_diperiksa'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-200/50'
              }`}
            >
              <CheckCircle2 size={15} />
              <span>Sudah Diperiksa</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                reviewFilter === 'sudah_diperiksa' ? 'bg-white text-black' : 'bg-neutral-200 text-neutral-800'
              }`}>
                {tabCounts.sudah}
              </span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Cari nama pegawai..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input pl-9 text-xs py-2"
            />
          </div>
        </div>
      </div>

      {/* 2. Main Desktop List Table */}
      <div className="card overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
              Antrean Verifikasi & Tindak Lanjut
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 text-neutral-800 font-mono">
              {records.length} Catatan
            </span>
          </div>
          <span className="text-xs text-neutral-500">
            Periksa keabsahan foto selfie dan toleransi waktu presensi pegawai
          </span>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-[11px] uppercase tracking-wider font-semibold">
                <th className="px-5 py-3.5 font-semibold">Pegawai</th>
                <th className="px-4 py-3.5 font-semibold">Divisi & Shift</th>
                <th className="px-4 py-3.5 font-semibold">Tipe Absen</th>
                <th className="px-4 py-3.5 font-semibold">Tanggal & Jam</th>
                <th className="px-4 py-3.5 font-semibold">Jadwal Acuan</th>
                <th className="px-4 py-3.5 font-semibold text-center">Ketepatan</th>
                <th className="px-4 py-3.5 font-semibold">Catatan / Alasan</th>
                <th className="px-5 py-3.5 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-neutral-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Memuat antrean verifikasi...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-neutral-400">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-2">
                      <CheckCircle2 size={24} />
                    </div>
                    <p className="font-semibold text-neutral-700 text-sm">Tidak ada data untuk status ini</p>
                    <p className="text-xs text-neutral-400 mt-1">Semua presensi dalam antrean telah selesai ditinjau.</p>
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-neutral-50/80 transition-colors">
                    {/* Pegawai */}
                    <td className="px-5 py-3.5 font-semibold text-neutral-900">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-900 flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {rec.employee_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="block font-semibold text-neutral-900">{rec.employee_name}</span>
                          <span className="block text-[10px] text-neutral-400 font-mono">ID: {rec.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </td>

                    {/* Divisi & Shift */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CategoryBadge category={rec.category} />
                        {rec.shift && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200 text-neutral-700 font-medium">
                            {rec.shift}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Tipe Absen */}
                    <td className="px-4 py-3.5">
                      <AttendanceTypeBadge type={rec.attendance_type} />
                    </td>

                    {/* Tanggal & Jam */}
                    <td className="px-4 py-3.5">
                      <span className="block font-medium text-neutral-900">{formatJakartaDate(rec.work_date)}</span>
                      <span className="block text-[11px] font-mono text-neutral-500">
                        {rec.recorded_at ? formatJakartaTime(new Date(rec.recorded_at)) : '--:--'} WIB
                      </span>
                    </td>

                    {/* Jadwal Acuan */}
                    <td className="px-4 py-3.5 font-mono text-neutral-600">
                      {rec.scheduled_start && rec.scheduled_end ? (
                        <span>{rec.scheduled_start} - {rec.scheduled_end}</span>
                      ) : (
                        <span>Fleksibel</span>
                      )}
                    </td>

                    {/* Status Ketepatan */}
                    <td className="px-4 py-3.5 text-center">
                      <AttendanceStatusBadge status={rec.attendance_status} />
                      {rec.late_minutes > 0 && (
                        <span className="block text-[10px] font-mono text-neutral-500 mt-0.5">
                          +{rec.late_minutes} mnt
                        </span>
                      )}
                    </td>

                    {/* Catatan / Alasan */}
                    <td className="px-4 py-3.5">
                      {rec.reason ? (
                        <span className="text-xs text-neutral-800 font-medium max-w-xs truncate block" title={rec.reason}>
                          "{rec.reason}"
                        </span>
                      ) : rec.admin_notes ? (
                        <span className="text-xs text-neutral-500 italic max-w-xs truncate block" title={rec.admin_notes}>
                          Admin: {rec.admin_notes}
                        </span>
                      ) : (
                        <span className="text-neutral-400 text-xs">-</span>
                      )}
                    </td>

                    {/* Aksi */}
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => openActionModal(rec)}
                        className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 ml-auto shadow-2xs"
                      >
                        <ShieldCheck size={13} />
                        <span>Tinjau</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Split Desktop Review Modal */}
      {activeModalRecord && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl border border-neutral-200 max-w-3xl w-full p-6 shadow-2xl space-y-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="text-base font-bold text-neutral-900">
                  Verifikasi & Tinjau Presensi
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Tinjau foto selfie, radius geofence lokasi, dan justifikasi toleransi.
                </p>
              </div>
              <button
                onClick={() => setActiveModalRecord(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Split Desktop Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Column (5 Cols): Selfie Photo & Geofence Status */}
              <div className="md:col-span-5 space-y-3">
                <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                  Foto Selfie Verifikasi
                </p>

                <div className="w-full aspect-square rounded-2xl bg-neutral-100 border border-neutral-200 overflow-hidden relative flex items-center justify-center group shadow-2xs">
                  {selectedSelfieUrl ? (
                    <img
                      src={selectedSelfieUrl}
                      alt="Selfie Presensi"
                      className="w-full h-full object-cover"
                    />
                  ) : activeModalRecord.selfie_storage_path ? (
                    <div className="flex flex-col items-center gap-1.5 text-neutral-400 text-xs">
                      <RefreshCw size={18} className="animate-spin" />
                      <span>Memuat foto selfie...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-neutral-400 text-xs">
                      <Camera size={24} />
                      <span>Tidak ada foto selfie</span>
                    </div>
                  )}
                </div>

                {/* Geofence info badge */}
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs space-y-1">
                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-neutral-500" />
                      <span>Jarak Geofence:</span>
                    </span>
                    <span className="font-bold text-neutral-900 font-mono">
                      {activeModalRecord.distance_meters !== null && activeModalRecord.distance_meters !== undefined
                        ? formatDistance(activeModalRecord.distance_meters)
                        : 'Tidak tercatat'}
                    </span>
                  </div>
                  {activeModalRecord.distance_meters && activeModalRecord.distance_meters > 150 && (
                    <p className="text-[10px] text-neutral-500 font-medium">
                      ⚠️ Presensi dilakukan di luar radius toleransi kantor.
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column (7 Cols): Details & Decision Form */}
              <div className="md:col-span-7 space-y-4">
                {/* Employee summary block */}
                <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Pegawai:</span>
                    <span className="font-bold text-neutral-900">{activeModalRecord.employee_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Divisi & Shift:</span>
                    <span className="font-semibold text-neutral-800">
                      {activeModalRecord.category} {activeModalRecord.shift ? `• ${activeModalRecord.shift}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Waktu Tercatat:</span>
                    <span className="font-mono font-bold text-neutral-900">
                      {formatJakartaDate(activeModalRecord.work_date)} • {formatJakartaTime(new Date(activeModalRecord.recorded_at))} WIB
                    </span>
                  </div>
                  {activeModalRecord.reason && (
                    <div className="pt-1.5 border-t border-neutral-200/80">
                      <span className="text-neutral-500 block mb-0.5">Alasan Karyawan:</span>
                      <p className="font-semibold text-neutral-900 bg-white p-2 rounded-lg border border-neutral-200">
                        "{activeModalRecord.reason}"
                      </p>
                    </div>
                  )}
                </div>

                {/* Status decision radio */}
                <div className="space-y-1.5">
                  <label className="form-label text-xs">Keputusan Verifikasi *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewStatus('sudah_diperiksa')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        newStatus === 'sudah_diperiksa'
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <CheckCircle size={14} />
                      <span>Setujui (Sudah Diperiksa)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewStatus('perlu_tindak_lanjut')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        newStatus === 'perlu_tindak_lanjut'
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <AlertTriangle size={14} />
                      <span>Perlu Tindak Lanjut</span>
                    </button>
                  </div>
                </div>

                {/* Mandatory Admin Notes */}
                <div className="space-y-1.5">
                  <label className="form-label text-xs">Catatan & Justifikasi Admin *</label>
                  <textarea
                    rows={3}
                    placeholder="Contoh: Selfie terverifikasi wajar, toleransi tugas luar pos disetujui..."
                    value={actionNotes}
                    onChange={e => setActionNotes(e.target.value)}
                    className="form-input text-xs py-2 resize-none"
                    required
                  />
                  <p className="text-[10px] text-neutral-400">
                    Catatan ini akan direkam dalam log audit administrator secara permanen.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setActiveModalRecord(null)}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdateStatus}
                    disabled={isSubmitting || !actionNotes.trim()}
                    className="btn-primary text-xs py-2 px-5"
                  >
                    {isSubmitting ? 'Menyimpan...' : 'Simpan Keputusan'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
