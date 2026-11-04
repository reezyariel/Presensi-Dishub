import { useEffect } from 'react'
import {
  X,
  Calendar,
  MapPin,
  FileText,
  ExternalLink,
  User,
  Shield,
} from 'lucide-react'
import { formatJakartaTime } from '../../lib/scheduleEngine'
import { formatSecurityDisplayDate } from '../../lib/securityDateDisplay'
import { AttendanceStatusBadge, AttendanceTypeBadge, ReviewStatusBadge } from './StatusBadges'
import AttendanceSelfieThumbnail from '../common/AttendanceSelfieThumbnail'
import type { AttendanceRecord } from '../../types/attendance'
import { Link } from 'react-router-dom'

interface Props {
  isOpen: boolean
  onClose: () => void
  record: AttendanceRecord | null
  onPreviewPhoto: (record: AttendanceRecord) => void
}

export default function SecurityAttendanceDetailModal({
  isOpen,
  onClose,
  record,
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

  if (!isOpen || !record) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fade-in overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full flex flex-col overflow-hidden border border-neutral-200 my-auto animate-scale-up">
        {/* Modal Top Header */}
        <div className="px-6 py-5 border-b border-neutral-100 flex items-start justify-between bg-neutral-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-neutral-900 text-white border border-neutral-800 uppercase flex items-center gap-1">
                <Shield size={11} />
                Security
              </span>
              <span className="text-xs text-neutral-400">•</span>
              <span className="text-xs text-neutral-500 font-medium">Detail Transaksi Absensi</span>
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mt-1 flex items-center gap-2">
              <User size={18} className="text-neutral-700" />
              <span>{record.employee_name}</span>
            </h3>
            <div className="flex items-center gap-3 text-xs text-neutral-600 mt-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Calendar size={13} className="text-neutral-500" />
                {formatSecurityDisplayDate(record.work_date, record.shift, record.attendance_type, record.category)}
              </span>
              {record.shift && (
                <>
                  <span>•</span>
                  <span className="px-2 py-0.5 rounded-md bg-neutral-200 text-neutral-800 font-bold text-[10px]">
                    {record.shift}
                  </span>
                </>
              )}
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

        {/* Modal Status Badges */}
        <div className="px-6 py-3 bg-neutral-100/50 border-b border-neutral-100 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <AttendanceTypeBadge type={record.attendance_type} />
            <AttendanceStatusBadge status={record.attendance_status} />
          </div>
          <ReviewStatusBadge status={record.review_status} />
        </div>

        {/* Detail Content */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Selfie Photo Card */}
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-neutral-50 p-4 rounded-2xl border border-neutral-200">
            <div className="relative group flex-shrink-0">
              <AttendanceSelfieThumbnail
                storagePath={record.selfie_storage_path}
                alt={`Selfie ${record.employee_name}`}
                size="lg"
                className="w-28 h-28 rounded-2xl border border-neutral-300 object-cover cursor-pointer hover:shadow-lg"
                onClick={() => onPreviewPhoto(record)}
              />
            </div>
            <div className="space-y-1 text-center sm:text-left flex-1">
              <span className="text-xs font-bold text-neutral-900 block">Foto Selfie Transaksi Resmi</span>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Foto diambil langsung dari perangkat petugas saat transaksi{' '}
                <strong className="text-neutral-800 uppercase">{record.attendance_type}</strong> dicatat.
              </p>
              <button
                type="button"
                onClick={() => onPreviewPhoto(record)}
                className="btn-secondary text-xs py-1 px-3 mt-1 inline-flex items-center gap-1.5"
              >
                <span>Lihat Ukuran Penuh</span>
              </button>
            </div>
          </div>

          {/* Time & Shift Details */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-white p-4 rounded-2xl border border-neutral-200 shadow-2xs">
            <div>
              <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">
                Waktu Transaksi
              </span>
              <span className="font-bold text-neutral-900 font-mono text-base block mt-0.5">
                {formatJakartaTime(record.recorded_at)}
              </span>
              <span className="text-[11px] text-neutral-500">
                {formatSecurityDisplayDate(record.work_date, record.shift, record.attendance_type, record.category)}
              </span>
            </div>

            <div>
              <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">
                Shift & Jadwal
              </span>
              <span className="font-bold text-neutral-900 block mt-0.5">
                {record.shift || '-'}
              </span>
              {record.scheduled_start && (
                <span className="text-[11px] text-neutral-500">
                  Jadwal: {record.scheduled_start} {record.scheduled_end ? `- ${record.scheduled_end}` : ''}
                </span>
              )}
            </div>

            <div>
              <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">
                Status Ketepatan
              </span>
              {record.late_minutes > 0 ? (
                <span className="font-bold text-amber-700 block mt-0.5">
                  Terlambat (+{record.late_minutes} menit)
                </span>
              ) : (
                <span className="font-bold text-emerald-700 block mt-0.5">
                  Tepat Waktu
                </span>
              )}
            </div>

            <div>
              <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">
                ID Transaksi
              </span>
              <span className="font-mono text-[11px] text-neutral-600 block mt-0.5 truncate" title={record.id}>
                {record.id}
              </span>
            </div>
          </div>

          {/* GPS & Geofence Section */}
          <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-neutral-900">
              <MapPin size={15} className="text-neutral-700" />
              <span>Informasi GPS & Radius Geofence</span>
            </div>
            {record.latitude !== null && record.latitude !== undefined && record.longitude !== null && record.longitude !== undefined ? (
              <div className="space-y-1 text-neutral-700 text-[11px] pt-1">
                <div className="font-mono">
                  Koordinat: <strong>{record.latitude.toFixed(6)}, {record.longitude.toFixed(6)}</strong>
                </div>
                {record.distance_meters !== null && record.distance_meters !== undefined && (
                  <div>
                    Jarak ke pos/kantor: <strong>{record.distance_meters} meter</strong>
                    {record.distance_meters <= 100 ? (
                      <span className="text-emerald-700 font-semibold ml-1.5">(Dalam Batas Toleransi)</span>
                    ) : (
                      <span className="text-amber-700 font-semibold ml-1.5">(Di Luar Radius)</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-neutral-400 pt-1">
                Data koordinat GPS tidak tersedia pada transaksi ini.
              </p>
            )}
          </div>

          {/* Reason or Admin Notes */}
          {(record.reason || record.admin_notes) && (
            <div className="bg-amber-50/70 border border-amber-200/80 p-3.5 rounded-2xl text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <FileText size={14} />
                <span>Catatan & Alasan Transaksi</span>
              </div>
              {record.reason && (
                <div className="text-amber-950 text-[11px]">
                  <strong>Alasan:</strong> {record.reason}
                </div>
              )}
              {record.admin_notes && (
                <div className="text-neutral-700 text-[11px]">
                  <strong>Catatan Pemeriksaan Admin:</strong> {record.admin_notes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <Link
            to={`/admin/attendance/${record.id}`}
            className="text-xs font-semibold text-neutral-800 hover:text-black flex items-center gap-1"
          >
            <span>Buka Halaman Koreksi Lengkap</span>
            <ExternalLink size={13} />
          </Link>

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
