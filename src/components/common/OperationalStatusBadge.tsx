// ============================================================
// SIPATEN — Operational Status Badge Component
// Reusable pill badge with smooth pulsing indicator for "Sedang Bertugas"
// Distinct CS (emerald) and Security (navy/teal) styling
// Lightweight, mobile-friendly, respects prefers-reduced-motion
// ============================================================

import {
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Briefcase,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  OPERATIONAL_STATUS_CONFIG,
  type OperationalStatusType,
} from '../../lib/operationalStatus'

interface OperationalStatusBadgeProps {
  status: OperationalStatusType
  category?: 'CS' | 'Security'
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  hideIfPerluPerhatian?: boolean
  className?: string
}

export default function OperationalStatusBadge({
  status,
  category = 'CS',
  size = 'md',
  showIcon = true,
  hideIfPerluPerhatian = false,
  className,
}: OperationalStatusBadgeProps) {
  if (hideIfPerluPerhatian && status === 'perlu_perhatian') {
    return null
  }
  const config = OPERATIONAL_STATUS_CONFIG[status] || OPERATIONAL_STATUS_CONFIG.belum_bertugas
  const isSecurity = category === 'Security'

  // Icon selection
  const IconComponent = (() => {
    switch (status) {
      case 'sedang_bertugas':
        return isSecurity ? Shield : Activity
      case 'tugas_selesai':
        return CheckCircle2
      case 'menunggu_jadwal':
        return Clock
      case 'perlu_perhatian':
        return AlertTriangle
      case 'belum_bertugas':
      default:
        return Briefcase
    }
  })()

  // Sizing classes
  const sizeClasses = {
    sm: {
      pill: 'text-[10px] px-2 py-0.5 gap-1',
      dot: 'w-1.5 h-1.5',
      icon: 11,
    },
    md: {
      pill: 'text-[11px] px-2.5 py-1 gap-1.5',
      dot: 'w-2 h-2',
      icon: 12,
    },
    lg: {
      pill: 'text-xs px-3.5 py-1.5 gap-2 font-bold',
      dot: 'w-2.5 h-2.5',
      icon: 14,
    },
  }[size]

  // Color styles based on status & category
  let pillStyle = ''
  let dotStyle = ''

  if (status === 'sedang_bertugas') {
    if (isSecurity) {
      // Security: Modern navy & teal
      pillStyle = 'bg-sky-50 text-slate-900 border-sky-200/90 font-semibold shadow-2xs'
      dotStyle = 'bg-teal-500 motion-safe:animate-pulse ring-2 ring-teal-300/40'
    } else {
      // CS: Emerald green
      pillStyle = 'bg-emerald-50 text-emerald-900 border-emerald-200/90 font-semibold shadow-2xs'
      dotStyle = 'bg-emerald-500 motion-safe:animate-pulse ring-2 ring-emerald-300/40'
    }
  } else if (status === 'tugas_selesai') {
    if (isSecurity) {
      pillStyle = 'bg-blue-50/70 text-blue-900 border-blue-200/80 font-medium'
      dotStyle = 'bg-blue-600'
    } else {
      pillStyle = 'bg-emerald-50/70 text-emerald-800 border-emerald-200/80 font-medium'
      dotStyle = 'bg-emerald-600'
    }
  } else if (status === 'menunggu_jadwal') {
    pillStyle = 'bg-neutral-100/80 text-neutral-600 border-neutral-200 font-medium'
    dotStyle = 'bg-neutral-400'
  } else if (status === 'perlu_perhatian') {
    pillStyle = 'bg-rose-50 text-rose-800 border-rose-200/80 font-semibold'
    dotStyle = 'bg-rose-500'
  } else {
    // belum_bertugas
    pillStyle = 'bg-amber-50/90 text-amber-900 border-amber-200/80 font-medium'
    dotStyle = 'bg-amber-500'
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border transition-all duration-300 select-none',
        sizeClasses.pill,
        pillStyle,
        className,
      )}
      title={config.description}
    >
      {/* Animated or static dot indicator */}
      <span className={cn('rounded-full flex-shrink-0', sizeClasses.dot, dotStyle)} />

      {/* Activity Icon */}
      {showIcon && <IconComponent size={sizeClasses.icon} className="flex-shrink-0 opacity-80" />}

      {/* Status Label */}
      <span className="truncate">{config.label}</span>
    </span>
  )
}
