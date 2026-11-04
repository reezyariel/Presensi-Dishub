import { useEffect } from 'react'
import {
  X,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  FileText,
  ExternalLink,
  ShieldCheck,
  User,
} from 'lucide-react'
import { formatJakartaDate, formatJakartaTime } from '../../lib/scheduleEngine'
import { AttendanceStatusBadge, ReviewStatusBadge } from './StatusBadges'
import AttendanceSelfieThumbnail from '../common/AttendanceSelfieThumbnail'
import type { AttendanceRecord, CSGroupedAttendance } from '../../types/attendance'
import { Link } from 'react-router-dom'

interface Props {
  isOpen: boolean
  onClose: () => void
  group: CSGroupedAttendance | null
  onPreviewPhoto: (record: AttendanceRecord) => void
}

interface SectionProps {
  title: string
  sequenceNumber: number
  record: AttendanceRecord | null
  onPreviewPhoto: (record: AttendanceRecord) => void
}

function AttendanceSection({
  title,
  sequenceNumber,
  record,
  onPreviewPhoto,
}: SectionProps) {
  const isAbsent = !record

  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${
        isAbsent
          ? 'bg-neutral-50/80 border-dashed border-neutral-200'
          : record.attendance_status === 'terlambat'
          ? 'bg-amber-50/30 border-amber-200/80'
          : 'bg-white border-neutral-200 shadow-2xs'
      }`}
    >
      {/* Section Header */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              isAbsent
                ? 'bg-neutral-200 text-neutral-500'
                : record.attendance_status === 'terlambat'
                ? 'bg-amber-500 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {sequenceNumber}
          </span>
          <h4 className="text-sm font-bold text-neutral-900">{title}</h4>
        </div>

        {isAbsent ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-500 border border-neutral-200">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
            Belum Absen
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <AttendanceStatusBadge status={record.attendance_status} />
            <ReviewStatusBadge status={record.review_status} />
          </div>
        )}
      </div>

      {/* Section Body */}
      {isAbsent ? (
        <div className="py-6 px-4 text-center text-neutral-400">
          <Clock size={24} className="mx-auto mb-1.5 opacity-40 text-neutral-400" />
          <p className="text-xs font-medium text-neutral-600">
            Pegawai belum melakukan transaksi {title.toLowerCase()} untuk tanggal ini.
          </p>
          <span className="text-[11px] text-neutral-400 block mt-0.5">
            Foto selfie dan catatan waktu akan otomatis muncul setelah presensi dicatat.
          </span>
        </div>
      ) : (
        <div className="pt-3.5 flex flex-col md:flex-row gap-4">
          {/* Left: Original Selfie Photo */}
          <div className="flex flex-col items-center md:items-start flex-shrink-0">
            <div className="relative group">
              <AttendanceSelfieThumbnail
                storagePath={record.selfie_storage_path}
                alt={`Selfie ${title} - ${record.employee_name}`}
                size="lg"
                className="w-24 h-24 rounded-xl border border-neutral-300 object-cover cursor-pointer hover:shadow-md"
                onClick={() => onPreviewPhoto(record)}
              />
            </div>
            <button
              type="button"
              onClick={() => onPreviewPhoto(record)}
              className="text-[11px] text-neutral-600 hover:text-neutral-900 font-medium mt-1.5 flex items-center gap-1"
            >
              <span>Perbesar Foto</span>
            </button>
          </div>

          {/* Right: Detailed Transaction Information */}
          <div className="flex-1 space-y-2.5 text-xs text-neutral-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-neutral-50/80 p-3 rounded-xl border border-neutral-100">
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">
                  Waktu & Tanggal
                </span>
                <span className="font-bold text-neutral-900 font-mono text-sm">
                  {formatJakartaTime(record.recorded_at)}
                </span>
                <span className="block text-[11px] text-neutral-500">
                  {formatJakartaDate(record.work_date)}
                </span>
              </div>

              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">
                  Keterlambatan
                </span>
                {record.late_minutes > 0 ? (
                  <span className="font-bold text-amber-700">
                    +{record.late_minutes} menit terlambat
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 size={13} />
                    Tepat Waktu
                  </span>
                )}
                {record.scheduled_start && (
                  <span className="block text-[11px] text-neutral-400">
                    Jadwal Mulai: {record.scheduled_start}
                  </span>
                )}
              </div>
            </div>

            {/* GPS & Geofence Section */}
            <div className="flex items-start gap-2 bg-neutral-50/50 p-2.5 rounded-xl border border-neutral-100">
              <MapPin size={15} className="text-neutral-500 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] flex-1">
                <span className="font-semibold text-neutral-800">Informasi Lokasi & Geofence:</span>
                {record.latitude !== null && record.latitude !== undefined && record.longitude !== null && record.longitude !== undefined ? (
                  <div className="mt-0.5 space-y-0.5">
                    <span className="block font-mono text-neutral-600">
                      Koordinat: {record.latitude.toFixed(6)}, {record.longitude.toFixed(6)}
                    </span>
                    {record.distance_meters !== null && record.distance_meters !== undefined && (
                      <span className="block text-neutral-600">
                        Jarak ke kantor: <strong>{record.distance_meters} m</strong>
                        {record.distance_meters <= 100 ? (
                          <span className="text-emerald-700 font-semibold ml-1.5">(Dalam Radius Kantor)</span>
                        ) : (
                          <span className="text-amber-700 font-semibold ml-1.5">(Di Luar Radius Kantor)</span>
                        )}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="block text-neutral-400 mt-0.5">
                    Data koordinat GPS tidak tersedia pada catatan ini.
                  </span>
                )}
              </div>
            </div>

            {/* Reason or Admin Notes */}
            {(record.reason || record.admin_notes) && (
              <div className="flex items-start gap-2 bg-amber-50/60 border border-amber-200/70 p-2.5 rounded-xl text-[11px]">
                <FileText size={15} className="text-amber-800 flex-shrink-0 mt-0.5" />
                <div>
                  {record.reason && (
                    <div className="text-amber-950">
                      <strong className="font-semibold">Alasan Pegawai:</strong> {record.reason}
                    </div>
                  )}
                  {record.admin_notes && (
                    <div className="text-neutral-700 mt-1">
                      <strong className="font-semibold">Catatan Admin:</strong> {record.admin_notes}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Link to Dedicated Record Page */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-neutral-400 font-mono">
                ID Transaksi: {record.id}
              </span>
              <Link
                to={`/admin/attendance/${record.id}`}
                className="text-[11px] font-semibold text-neutral-800 hover:text-black hover:underline flex items-center gap-1"
              >
                <span>Halaman Koreksi Transaksi</span>
                <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CSAttendanceDetailModal({
  isOpen,
  onClose,
  group,
  onPreviewPhoto,
}: Props) {
  // ESC key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !group) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fade-in overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-neutral-200 my-auto animate-scale-up">
        {/* Modal Top Header */}
        <div className="px-6 py-5 border-b border-neutral-100 flex items-start justify-between bg-neutral-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                Cleaning Service (CS)
              </span>
              <span className="text-xs text-neutral-400">•</span>
              <span className="text-xs text-neutral-500 font-medium">Detail Presensi Harian</span>
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mt-1 flex items-center gap-2">
              <User size={18} className="text-neutral-700" />
              <span>{group.employee_name}</span>
            </h3>
            <div className="flex items-center gap-3 text-xs text-neutral-600 mt-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Calendar size={13} className="text-neutral-500" />
                {formatJakartaDate(group.work_date)}
              </span>
              <span>•</span>
              <span className="font-mono text-neutral-400 text-[11px]">
                ID: {group.employee_id}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition-colors"
            title="Tutup (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Status Summary Bar */}
        <div className="px-6 py-3 bg-neutral-100/50 border-b border-neutral-100 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-neutral-500 text-[11px] font-semibold uppercase">Status Presensi:</span>
            <AttendanceStatusBadge status={group.overall_attendance_status} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-500 text-[11px] font-semibold uppercase">Status Pemeriksaan:</span>
            <ReviewStatusBadge status={group.overall_review_status} />
          </div>
        </div>

        {/* Vertical 3-Section Attendance List */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Section 1: Absen Masuk */}
          <AttendanceSection
            title="Absen Masuk"
            sequenceNumber={1}
            record={group.masuk}
            onPreviewPhoto={onPreviewPhoto}
          />

          {/* Section 2: Absen Istirahat */}
          <AttendanceSection
            title="Absen Istirahat"
            sequenceNumber={2}
            record={group.istirahat}
            onPreviewPhoto={onPreviewPhoto}
          />

          {/* Section 3: Absen Pulang */}
          <AttendanceSection
            title="Absen Pulang"
            sequenceNumber={3}
            record={group.pulang}
            onPreviewPhoto={onPreviewPhoto}
          />
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1">
            <ShieldCheck size={14} className="text-neutral-500" />
            <span>SIPATEN Enterprise Verifikasi Presensi Resmi</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs py-2 px-5 font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
