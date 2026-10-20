import { cn } from '../../lib/utils'
import type { AttendanceRecord } from '../../types/attendance'

interface StatusBadgeProps {
  status: AttendanceRecord['attendance_status']
  lateMinutes?: number
}

export function AttendanceStatusBadge({ status, lateMinutes }: StatusBadgeProps) {
  if (status === 'tepat_waktu') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-300">
        Tepat Waktu
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-900 text-white">
      Terlambat{lateMinutes ? ` ${lateMinutes}m` : ''}
    </span>
  )
}

interface ReviewBadgeProps {
  status: AttendanceRecord['review_status']
}

export function ReviewStatusBadge({ status }: ReviewBadgeProps) {
  const map = {
    belum_diperiksa: {
      label: 'Belum Diperiksa',
      cls: 'bg-neutral-100 text-neutral-600 border border-neutral-200',
    },
    sudah_diperiksa: {
      label: 'Sudah Diperiksa',
      cls: 'bg-neutral-900 text-white',
    },
    perlu_tindak_lanjut: {
      label: 'Perlu Tindak Lanjut',
      cls: 'bg-neutral-200 text-neutral-900 border border-neutral-400 font-semibold',
    },
  } as const

  const { label, cls } = map[status] || map.belum_diperiksa
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium', cls)}>
      {label}
    </span>
  )
}

interface CategoryBadgeProps {
  category: AttendanceRecord['category']
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return category === 'CS' ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
      CS
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-900 text-white">
      Security
    </span>
  )
}

interface AttendanceTypeBadgeProps {
  type: AttendanceRecord['attendance_type']
}

export function AttendanceTypeBadge({ type }: AttendanceTypeBadgeProps) {
  const map = {
    masuk: { label: 'Masuk', cls: 'bg-neutral-900 text-white' },
    istirahat: { label: 'Istirahat', cls: 'bg-neutral-100 text-neutral-800 border border-neutral-300' },
    pulang: { label: 'Pulang', cls: 'bg-neutral-800 text-white' },
  } as const
  const { label, cls } = map[type] || { label: type, cls: 'bg-neutral-100 text-neutral-800' }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize', cls)}>
      {label}
    </span>
  )
}
