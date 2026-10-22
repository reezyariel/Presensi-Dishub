// ============================================================
// SIPATEN — AttendanceDetailPage Component
// Desktop-Optimized for Admin Console (/admin/attendance/:id)
// Single-column Mobile Shell for CS & Security Field Workers
// ============================================================

import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Clock, MapPin, Image as ImageIcon, X,
  Shield, History, Save, RefreshCw
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { formatJakartaTime, formatJakartaDate } from '../../lib/scheduleEngine'
import { formatDistance } from '../../lib/officeLocation'
import type { AttendanceRecord, AttendanceAuditLog, ReviewStatus } from '../../types/attendance'

export default function AttendanceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, isAdmin, role } = useAuth()

  const [record, setRecord] = useState<AttendanceRecord | null>(null)
  const [dayRecords, setDayRecords] = useState<AttendanceRecord[]>([])
  const [auditLogs, setAuditLogs] = useState<AttendanceAuditLog[]>([])
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Admin review form
  const [showCorrection, setShowCorrection] = useState(false)
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionReviewStatus, setCorrectionReviewStatus] = useState<ReviewStatus>('belum_diperiksa')
  const [correctionAttendanceStatus, setCorrectionAttendanceStatus] = useState<'tepat_waktu' | 'terlambat'>('tepat_waktu')
  const [correctionLateMinutes, setCorrectionLateMinutes] = useState<number>(0)
  const [correctionNotes, setCorrectionNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (id && id !== 'detail') {
      loadRecord(id)
    } else {
      // If opened at /admin/attendance/detail without ID, load latest record
      loadLatestRecord()
    }
  }, [id])

  async function loadLatestRecord() {
    setIsLoading(true)
    try {
      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        loadRecord(data.id)
      } else {
        setError('Belum ada catatan presensi.')
        setIsLoading(false)
      }
    } catch {
      setIsLoading(false)
    }
  }

  async function loadRecord(recordId: string) {
    setIsLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('id', recordId)
        .single()

      if (err || !data) {
        setError('Catatan presensi tidak ditemukan.')
        return
      }

      const r = data as AttendanceRecord
      setRecord(r)
      setCorrectionReviewStatus(r.review_status)
      setCorrectionAttendanceStatus(r.attendance_status)
      setCorrectionLateMinutes(r.late_minutes ?? 0)
      setCorrectionNotes(r.admin_notes ?? '')

      // Get signed URL for private selfie storage
      if (r.selfie_storage_path) {
        const { data: urlData } = await supabase.storage
          .from('selfies')
          .createSignedUrl(r.selfie_storage_path, 3600)
        if (urlData?.signedUrl) setSelfieUrl(urlData.signedUrl)
      }

      // Fetch all records for same employee on same work_date (masuk, istirahat, pulang)
      const { data: dayList } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('work_date', r.work_date)
        .eq('normalized_name', r.normalized_name || r.employee_name.toLowerCase().trim())
        .order('recorded_at', { ascending: true })

      if (dayList) setDayRecords(dayList as AttendanceRecord[])

      // If admin, fetch audit logs
      if (isAdmin || role === 'admin') {
        const { data: logs } = await supabase
          .from('attendance_audit_logs')
          .select('*, admin_profiles(full_name)')
          .eq('attendance_record_id', recordId)
          .order('created_at', { ascending: false })

        setAuditLogs((logs ?? []) as AttendanceAuditLog[])
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function saveCorrection() {
    if (!record || !profile || !correctionReason.trim()) return
    setIsSaving(true)

    try {
      const finalLate = correctionAttendanceStatus === 'tepat_waktu' ? 0 : correctionLateMinutes
      const oldValues = {
        review_status: record.review_status,
        attendance_status: record.attendance_status,
        late_minutes: record.late_minutes,
        admin_notes: record.admin_notes,
      }
      const newValues = {
        review_status: correctionReviewStatus,
        attendance_status: correctionAttendanceStatus,
        late_minutes: finalLate,
        admin_notes: correctionNotes,
      }

      // Update record
      const { error: updateErr } = await supabase
        .from('attendance_records')
        .update({
          review_status: correctionReviewStatus,
          attendance_status: correctionAttendanceStatus,
          late_minutes: finalLate,
          admin_notes: correctionNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id)

      if (updateErr) throw updateErr

      // Insert audit log
      await supabase.from('attendance_audit_logs').insert({
        attendance_record_id: record.id,
        admin_id: profile.id,
        action: 'UPDATE_STATUS_AND_REVIEW',
        old_values: oldValues,
        new_values: newValues,
        reason: correctionReason,
      })

      // Reload
      await loadRecord(record.id)
      setShowCorrection(false)
      setCorrectionReason('')
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan penyesuaian.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center text-center space-y-3 min-h-[400px]">
        <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-neutral-500 font-medium">Memuat detail absensi pegawai...</p>
      </div>
    )
  }

  if (error || !record) {
    return (
      <div className="p-6 space-y-4 max-w-xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 hover:text-black"
        >
          <ArrowLeft size={16} />
          <span>Kembali</span>
        </button>

        <div className="p-5 bg-neutral-100 rounded-xl border border-neutral-200 text-neutral-800 text-xs">
          <p className="font-semibold">{error || 'Catatan presensi tidak ditemukan.'}</p>
        </div>
      </div>
    )
  }

  // Find masuk, istirahat, pulang records for this employee on this date
  const masukRec = dayRecords.find(r => r.attendance_type === 'masuk') || (record.attendance_type === 'masuk' ? record : null)
  const istirahatRec = dayRecords.find(r => r.attendance_type === 'istirahat') || (record.attendance_type === 'istirahat' ? record : null)
  const pulangRec = dayRecords.find(r => r.attendance_type === 'pulang') || (record.attendance_type === 'pulang' ? record : null)

  const isDesktopAdmin = location.pathname.startsWith('/admin')

  // Common UI building blocks
  const employeeCard = (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-base flex-shrink-0">
            {record.employee_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900">
              {record.employee_name}
            </h3>
            <p className="text-xs text-neutral-500 font-medium mt-0.5">
              Divisi {record.category} {record.shift ? `• ${record.shift}` : ''} • ID: {record.id.substring(0, 8)}
            </p>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-neutral-100 text-neutral-900 border border-neutral-300">
          {record.attendance_status === 'terlambat' ? 'Terlambat' : 'Tepat Waktu'}
        </span>
      </div>

      <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-600">
        <span>Tanggal Kerja: <strong className="text-neutral-900">{formatJakartaDate(new Date(record.work_date))}</strong></span>
        <span>Jadwal Masuk: <strong className="font-mono text-neutral-900">{record.scheduled_start || '-'}</strong></span>
      </div>
    </div>
  )

  const attendanceTimelineCard = (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4 shadow-xs">
      <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
        Timeline Jam Absensi Harian
      </h4>

      <div className="divide-y divide-neutral-100 text-xs">
        {/* Masuk */}
        <div className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center flex-shrink-0">
              <Clock size={16} />
            </div>
            <div>
              <p className="text-[11px] text-neutral-500">Presensi Masuk</p>
              <p className="font-bold text-neutral-900 font-mono text-sm">
                {masukRec?.recorded_at ? formatJakartaTime(new Date(masukRec.recorded_at)) : '--:--'}
              </p>
            </div>
          </div>

          {masukRec ? (
            masukRec.attendance_status === 'terlambat' ? (
              <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-neutral-900 text-white font-mono">
                Terlambat +{masukRec.late_minutes}m
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-900 border border-neutral-300">
                Tepat Waktu
              </span>
            )
          ) : (
            <span className="text-neutral-400 font-medium">Belum Presensi</span>
          )}
        </div>

        {/* Istirahat */}
        {record.category === 'CS' && (
          <div className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center flex-shrink-0">
                <Clock size={16} />
              </div>
              <div>
                <p className="text-[11px] text-neutral-500">Presensi Istirahat</p>
                <p className="font-bold text-neutral-900 font-mono text-sm">
                  {istirahatRec?.recorded_at ? formatJakartaTime(new Date(istirahatRec.recorded_at)) : '--:--'}
                </p>
              </div>
            </div>

            {istirahatRec ? (
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-900 border border-neutral-300">
                Tercatat
              </span>
            ) : (
              <span className="text-neutral-400 font-medium">--</span>
            )}
          </div>
        )}

        {/* Pulang */}
        <div className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center flex-shrink-0">
              <Clock size={16} />
            </div>
            <div>
              <p className="text-[11px] text-neutral-500">Presensi Pulang</p>
              <p className="font-bold text-neutral-900 font-mono text-sm">
                {pulangRec?.recorded_at ? formatJakartaTime(new Date(pulangRec.recorded_at)) : '--:--'}
              </p>
            </div>
          </div>

          {pulangRec ? (
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-900 border border-neutral-300">
              Tepat Waktu
            </span>
          ) : (
            <span className="text-neutral-400 font-medium">Belum Presensi</span>
          )}
        </div>
      </div>
    </div>
  )

  const documentationCard = (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
          Dokumentasi Selfie & Geofence GPS
        </h4>
        {selfieUrl && (
          <button
            onClick={() => setIsPhotoModalOpen(true)}
            className="text-xs text-neutral-900 hover:underline font-semibold"
          >
            Perbesar Foto
          </button>
        )}
      </div>

      <div className="flex items-start gap-4">
        {selfieUrl ? (
          <button
            type="button"
            onClick={() => setIsPhotoModalOpen(true)}
            className="w-24 h-24 rounded-xl overflow-hidden border border-neutral-200 hover:opacity-90 transition-opacity bg-neutral-100 flex-shrink-0 group relative"
          >
            <img
              src={selfieUrl}
              alt="Selfie"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
              <ImageIcon size={18} />
            </div>
          </button>
        ) : (
          <div className="w-24 h-24 rounded-xl bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center text-neutral-400 text-xs flex-shrink-0">
            <ImageIcon size={22} />
            <span className="text-[10px] mt-1 font-medium">Tanpa Foto</span>
          </div>
        )}

        <div className="text-xs text-neutral-600 space-y-2 flex-1">
          <div>
            <p className="font-bold text-neutral-900">Foto Selfie Lapangan</p>
            <p className="text-[11px] text-neutral-500">
              Disimpan terenkripsi di Supabase Storage privat
            </p>
          </div>

          <div className="p-2.5 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-neutral-900">
              <MapPin size={13} />
              <span>Lokasi Geofence:</span>
            </div>
            <p className="text-[11px] text-neutral-600 font-mono">
              Jarak ke kantor: <strong>{formatDistance(record.distance_meters)}</strong>
            </p>
            {record.latitude && record.longitude && (
              <p className="text-[10px] text-neutral-400 font-mono">
                GPS: {record.latitude.toFixed(5)}, {record.longitude.toFixed(5)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const notesCard = (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-2 shadow-xs">
      <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
        Catatan & Keterangan
      </h4>
      <p className="text-xs text-neutral-700 leading-relaxed font-medium">
        {record.reason || record.admin_notes || 'Tidak ada catatan atau alasan khusus dari pegawai.'}
      </p>
    </div>
  )

  const adminReviewCard = (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
        <div>
          <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <Shield size={16} />
            Tinjauan & Verifikasi Administrator
          </h4>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Status: <span className="font-bold text-neutral-900 uppercase">{record.review_status.replace(/_/g, ' ')}</span>
          </p>
        </div>

        <button
          onClick={() => setShowCorrection(!showCorrection)}
          className="px-3 py-1.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {showCorrection ? 'Tutup Form' : 'Ubah Status'}
        </button>
      </div>

      {showCorrection ? (
        <div className="space-y-3.5 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-neutral-800">
                Status Kehadiran
              </label>
              <select
                value={correctionAttendanceStatus}
                onChange={e => {
                  const val = e.target.value as 'tepat_waktu' | 'terlambat'
                  setCorrectionAttendanceStatus(val)
                  if (val === 'tepat_waktu') setCorrectionLateMinutes(0)
                }}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs bg-white text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="tepat_waktu">Tepat Waktu</option>
                <option value="terlambat">Terlambat</option>
              </select>
            </div>

            {correctionAttendanceStatus === 'terlambat' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-800">
                  Menit Keterlambatan
                </label>
                <input
                  type="number"
                  min="0"
                  value={correctionLateMinutes}
                  onChange={e => setCorrectionLateMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-neutral-900 font-mono"
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-neutral-800">
              Pilihan Status Review
            </label>
            <select
              value={correctionReviewStatus}
              onChange={e => setCorrectionReviewStatus(e.target.value as ReviewStatus)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs bg-white text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            >
              <option value="belum_diperiksa">Belum Diperiksa</option>
              <option value="sudah_diperiksa">Sudah Diperiksa (Disetujui Sah)</option>
              <option value="perlu_tindak_lanjut">Perlu Tindak Lanjut (Ditangguhkan)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-neutral-800">
              Catatan Internal Admin
            </label>
            <input
              type="text"
              value={correctionNotes}
              onChange={e => setCorrectionNotes(e.target.value)}
              placeholder="Contoh: Bukti foto dan GPS telah terkonfirmasi"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-neutral-800">
              Alasan Perubahan <span className="text-neutral-500 font-normal">(Wajib untuk Audit Trail)</span>
            </label>
            <input
              type="text"
              value={correctionReason}
              onChange={e => setCorrectionReason(e.target.value)}
              placeholder="Alasan justifikasi perubahan status..."
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200 font-medium">
              {saveError}
            </p>
          )}

          <button
            type="button"
            onClick={saveCorrection}
            disabled={isSaving || !correctionReason.trim()}
            className="w-full py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            {isSaving ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Penyesuaian'}</span>
          </button>
        </div>
      ) : (
        <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-neutral-600">
          Klik tombol <strong>Ubah Status</strong> di atas untuk menyetujui atau menandai absensi ini. Setiap perubahan terekam di Audit Log.
        </div>
      )}

      {/* Audit Logs list */}
      {auditLogs.length > 0 && (
        <div className="pt-3 border-t border-neutral-100 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
            <History size={14} />
            <span>Riwayat Audit Presensi Ini:</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {auditLogs.map(log => (
              <div key={log.id} className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-[11px] space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-900">
                    {log.action} • {log.admin_profiles?.full_name || 'Admin'}
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-neutral-600">Alasan: {log.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // RENDER DESKTOP ADMIN LAYOUT
  if (isDesktopAdmin) {
    return (
      <div className="space-y-6 animate-fade-in w-full">
        {/* Top Header Card */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 border border-neutral-200 hover:bg-neutral-50 rounded-lg text-neutral-800 transition-colors"
              title="Kembali"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <span>Presensi & SDM</span>
                <span>/</span>
                <span className="text-neutral-900">Detail Presensi</span>
              </div>
              <h1 className="text-lg font-bold text-neutral-900 tracking-tight mt-0.5">
                Detail Presensi Pegawai: {record.employee_name}
              </h1>
            </div>
          </div>

          <div className="text-xs text-neutral-500 font-mono">
            ID Rekaman: {record.id.substring(0, 13)}...
          </div>
        </div>

        {/* 2-Column Desktop Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Profile, Timeline, Documentation (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {employeeCard}
            {attendanceTimelineCard}
            {documentationCard}
            {notesCard}
          </div>

          {/* Right Column: Admin Actions & Audit Trail (5 cols) */}
          <div className="lg:col-span-5 space-y-5 sticky top-20">
            {adminReviewCard}
          </div>
        </div>

        {/* Photo Modal */}
        {isPhotoModalOpen && selfieUrl && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
            <div className="relative max-w-md w-full bg-white rounded-2xl overflow-hidden border border-neutral-200 shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Bukti Foto Selfie Pegawai
                </span>
                <button
                  onClick={() => setIsPhotoModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-700"
                >
                  <X size={18} />
                </button>
              </div>

              <img
                src={selfieUrl}
                alt="Bukti Selfie Full"
                className="w-full aspect-4/3 object-cover rounded-xl border border-neutral-200"
              />

              <div className="flex items-center justify-between text-xs text-neutral-600">
                <span>{record.employee_name}</span>
                <span className="font-mono">{formatJakartaTime(new Date(record.recorded_at))}</span>
              </div>

              <button
                onClick={() => setIsPhotoModalOpen(false)}
                className="w-full py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-black transition-colors"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // RENDER RESPONSIVE EMPLOYEE LAYOUT (Panel 9 Reference for CS & Security)
  return (
    <div className="flex flex-col space-y-6 w-full max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between pb-1">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 hover:text-black transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Kembali</span>
        </button>
        <div className="text-xs text-neutral-400 font-mono">
          ID: {record.id.substring(0, 8)}
        </div>
      </div>

      {/* Responsive Grid: 2 columns on desktop (>= md), single column on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* Left Column: Profile, Timeline, Notes (7 cols) */}
        <div className="md:col-span-7 space-y-5">
          {employeeCard}
          {attendanceTimelineCard}
          {notesCard}
          {(isAdmin || role === 'admin') && adminReviewCard}
        </div>

        {/* Right Column: Documentation Card (5 cols) */}
        <div className="md:col-span-5 space-y-5 md:sticky md:top-20">
          {documentationCard}
        </div>
      </div>

      {/* Photo Modal */}
      {isPhotoModalOpen && selfieUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="relative max-w-md w-full bg-white rounded-2xl overflow-hidden border border-neutral-200 shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <span className="text-xs font-bold text-neutral-900">Dokumentasi Selfie</span>
              <button
                onClick={() => setIsPhotoModalOpen(false)}
                className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-700"
              >
                <X size={18} />
              </button>
            </div>

            <img
              src={selfieUrl}
              alt="Bukti Selfie Full"
              className="w-full aspect-4/3 object-cover rounded-xl border border-neutral-200"
            />

            <button
              onClick={() => setIsPhotoModalOpen(false)}
              className="w-full py-2.5 bg-neutral-900 text-white rounded-xl text-xs font-semibold hover:bg-black transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
