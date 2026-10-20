import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: number | string
  icon?: LucideIcon
  subtitle?: string
  trend?: {
    value: string
    positive?: boolean
  }
  className?: string
}

export default function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  className,
}: StatCardProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 flex flex-col justify-between shadow-[0_1px_3px_rgba(0,0,0,0.02)]', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-neutral-900 mt-1">{value}</p>
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center flex-shrink-0 text-neutral-800">
            <Icon size={18} />
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="flex items-center gap-2 mt-3 text-xs text-neutral-500">
          {trend && (
            <span className="font-semibold text-neutral-900 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
              {trend.value}
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </div>
  )
}
