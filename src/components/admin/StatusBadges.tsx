// ============================================================
// SIPATEN — Modern Enterprise Status Badges
// Harmonized palette: Emerald (success), Blue (info), Amber (warning), Rose (issue)
// ============================================================

import { cn } from '../../lib/utils'
import type { AttendanceRecord } from '../../types/attendance'
export { default as OperationalStatusBadge } from '../common/OperationalStatusBadge'

interface StatusBadgeProps {
  status: AttendanceRecord['attendance_status']
  lateMinutes?: number
}

export function AttendanceStatusBadge({ status, lateMinutes }: StatusBadgeProps) {
  if (status === 'tepat_waktu') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>Tepat Waktu</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200/90 shadow-2xs">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      <span>Terlambat{lateMinutes ? ` (+${lateMinutes} mnt)` : ''}</span>
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
      dot: 'bg-neutral-400',
    },
    sudah_diperiksa: {
      label: 'Sudah Diperiksa',
      cls: 'bg-blue-50 text-blue-800 border border-blue-200 font-semibold',
      dot: 'bg-blue-500',
    },
    perlu_tindak_lanjut: {
      label: 'Perlu Tindak Lanjut',
      cls: 'bg-rose-50 text-rose-800 border border-rose-200 font-semibold',
      dot: 'bg-rose-500',
    },
  } as const

  const config = map[status] || map.belum_diperiksa
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px]', config.cls)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      <span>{config.label}</span>
    </span>
  )
}

interface CategoryBadgeProps {
  category: AttendanceRecord['category']
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return category === 'CS' ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-2xs">
      CS
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-blue-950 border border-sky-200/90 shadow-2xs">
      Security
    </span>
  )
}

interface AttendanceTypeBadgeProps {
  type: AttendanceRecord['attendance_type']
}

export function AttendanceTypeBadge({ type }: AttendanceTypeBadgeProps) {
  const map = {
    masuk: {
      label: 'Masuk',
      cls: 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold',
    },
    istirahat: {
      label: 'Istirahat',
      cls: 'bg-neutral-100 text-neutral-700 border border-neutral-200/80 font-medium',
    },
    pulang: {
      label: 'Pulang',
      cls: 'bg-sky-50 text-blue-900 border border-sky-200/80 font-semibold',
    },
  } as const
  const config = map[type] || { label: type, cls: 'bg-neutral-100 text-neutral-800 border border-neutral-200 font-medium' }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] capitalize', config.cls)}>
      {config.label}
    </span>
  )
}
