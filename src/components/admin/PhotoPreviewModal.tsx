import { useEffect, useState } from 'react'
import { X, ZoomIn, Loader2, ImageOff } from 'lucide-react'
import { getSignedSelfieUrl } from '../../lib/selfieStorage'
import { formatJakartaDate, formatJakartaTime } from '../../lib/scheduleEngine'
import { AttendanceStatusBadge, AttendanceTypeBadge } from './StatusBadges'
import type { AttendanceRecord } from '../../types/attendance'

interface Props {
  isOpen: boolean
  onClose: () => void
  record: AttendanceRecord | null
}

export default function PhotoPreviewModal({ isOpen, onClose, record }: Props) {
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!isOpen || !record?.selfie_storage_path) {
      setFullImageUrl(null)
      setIsLoading(false)
      setHasError(false)
      return
    }

    setIsLoading(true)
    setHasError(false)

    // Load URL on demand
    getSignedSelfieUrl(record.selfie_storage_path, 3600)
      .then(url => {
        if (url) {
          setFullImageUrl(url)
          setHasError(false)
        } else {
          setHasError(true)
        }
      })
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false))
  }, [isOpen, record])

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-neutral-200 animate-scale-up">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2">
            <ZoomIn size={16} className="text-neutral-700" />
            <h3 className="text-sm font-bold text-neutral-900">
              Bukti Foto Selfie Transaksi
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition-colors"
            title="Tutup (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Image Content Area */}
        <div className="p-5 flex flex-col items-center justify-center bg-neutral-900/5 min-h-[300px]">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 text-neutral-500 py-12">
              <Loader2 size={24} className="animate-spin text-neutral-800" />
              <span className="text-xs">Memuat foto ukuran penuh...</span>
            </div>
          ) : hasError || !fullImageUrl ? (
            <div className="flex flex-col items-center gap-2 text-neutral-400 py-12">
              <ImageOff size={36} className="opacity-40" />
              <span className="text-xs font-medium">Foto selfie tidak dapat dimuat atau tidak tersedia.</span>
            </div>
          ) : (
            <div className="relative max-h-[60vh] max-w-full rounded-xl overflow-hidden border border-neutral-200 shadow-md bg-white">
              <img
                src={fullImageUrl}
                alt={`Selfie ${record.employee_name} (${record.attendance_type})`}
                className="max-h-[55vh] w-auto object-contain mx-auto"
              />
            </div>
          )}
        </div>

        {/* Metadata Footer */}
        <div className="px-5 py-4 bg-white border-t border-neutral-100 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-neutral-900">{record.employee_name}</h4>
              <p className="text-xs text-neutral-500">
                Divisi: <span className="font-semibold text-neutral-800">{record.category}</span>
                {record.shift && <span> • {record.shift}</span>}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <AttendanceTypeBadge type={record.attendance_type} />
              <AttendanceStatusBadge status={record.attendance_status} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs bg-neutral-50 p-3 rounded-xl border border-neutral-100">
            <div>
              <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Tanggal Kerja</span>
              <span className="font-semibold text-neutral-800">{formatJakartaDate(record.work_date)}</span>
            </div>
            <div>
              <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Waktu Tercatat</span>
              <span className="font-semibold font-mono text-neutral-800">
                {record.recorded_at ? formatJakartaTime(record.recorded_at) : '-'}
                {record.late_minutes > 0 && (
                  <span className="text-amber-600 font-normal ml-1">(+{record.late_minutes} mnt)</span>
                )}
              </span>
            </div>
          </div>

          {record.reason && (
            <div className="text-xs text-neutral-700 bg-amber-50/70 border border-amber-200/70 p-2.5 rounded-lg">
              <span className="font-bold text-amber-900 block text-[10px] uppercase">Alasan Keterlambatan / Catatan:</span>
              <span>{record.reason}</span>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-1.5 px-4"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
