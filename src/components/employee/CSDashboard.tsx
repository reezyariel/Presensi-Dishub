// ============================================================
// SIPATEN — CS (Cleaning Service) Dashboard Components
// Dedicated operational recap & weekly attendance chart for CS officers:
// 1. CSWeeklyChartCard: 7-day Monday–Sunday bar chart with clean empty state,
//    proportional heights, clear day labels, and distinct today marker without
//    misleading fake bars.
// 2. CS30DayRecapCard: 4-card metric grid (Hadir, Tepat Waktu, Terlambat,
//    Tidak Hadir) consistent with the Security dashboard's visual style.
// ============================================================

import { BarChart2, CheckCircle2, Clock, AlertCircle, Calendar, TrendingUp } from 'lucide-react'
import type { WeekDayCount } from '../../lib/scheduleEngine'

// ─────────────────────────────────────────────────────────────
// 1. CS Weekly Chart Card
// ─────────────────────────────────────────────────────────────
interface CSWeeklyChartCardProps {
  weekChartData: WeekDayCount[]
  todayDateStr: string
}

export function CSWeeklyChartCard({ weekChartData, todayDateStr }: CSWeeklyChartCardProps) {
  const totalCount = weekChartData.reduce((sum, d) => sum + d.count, 0)
  const maxCount = Math.max(...weekChartData.map(d => d.count), 1)

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Minggu Ini</h3>
          <p className="text-[11px] text-neutral-400">Kehadiran per hari (Senin – Minggu)</p>
        </div>
        <BarChart2 size={15} className="text-neutral-400" />
      </div>

      <div className="px-5 py-4">
        {totalCount === 0 ? (
          /* Empty State: Clear, elegant, and informative */
          <div className="py-6 text-center space-y-1.5">
            <BarChart2 size={24} className="text-neutral-300 mx-auto mb-1" />
            <p className="text-xs font-semibold text-neutral-600">Belum Ada Aktivitas Minggu Ini</p>
            <p className="text-[11px] text-neutral-400 max-w-xs mx-auto">
              Grafik kehadiran mingguan akan otomatis terisi setelah Anda mencatat presensi kerja.
            </p>
          </div>
        ) : (
          /* Active Bar Chart */
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-2 h-24 pt-4">
              {weekChartData.map(w => {
                const isToday = w.dateStr === todayDateStr
                const hasAttendance = w.count > 0
                const heightPercent = hasAttendance
                  ? Math.max((w.count / maxCount) * 85, 22)
                  : 0

                return (
                  <div key={w.day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    {/* Count label above the bar (only if attended) */}
                    {hasAttendance ? (
                      <span className="text-[10px] font-bold text-neutral-800 font-mono">
                        {w.count}
                      </span>
                    ) : (
                      <span className="text-[10px] text-transparent select-none">-</span>
                    )}

                    {/* Bar pillar */}
                    {hasAttendance ? (
                      <div
                        className="w-full max-w-[20px] rounded-t bg-neutral-900 transition-all duration-500 shadow-xs"
                        style={{ height: `${heightPercent}%` }}
                        title={`${w.label}: ${w.count} kehadiran`}
                      />
                    ) : isToday ? (
                      /* Today with zero attendance: baseline pill marker, NOT a fake height bar */
                      <div
                        className="w-full max-w-[20px] h-1.5 rounded-full bg-neutral-300 ring-2 ring-neutral-400/40"
                        title={`${w.label} (Hari ini): Belum ada presensi`}
                      />
                    ) : (
                      /* Other days without attendance: flat subtle baseline slot */
                      <div
                        className="w-full max-w-[20px] h-1 rounded-full bg-neutral-100"
                        title={`${w.label}: Tidak ada presensi`}
                      />
                    )}

                    {/* Day label below */}
                    {isToday ? (
                      <span
                        className="text-[9px] font-bold text-neutral-900 bg-neutral-100 border border-neutral-300 rounded-md px-1.5 py-0.5 leading-none"
                        title="Hari ini"
                      >
                        {w.day}
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-neutral-400">
                        {w.day}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer Summary */}
            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-500">
              <span>Total Kehadiran Minggu Ini</span>
              <span className="font-bold font-mono text-neutral-800">{totalCount} Hari</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 2. CS 30-Day Recap Card
// ─────────────────────────────────────────────────────────────
interface CS30DayRecapCardProps {
  stats: {
    hadir: number
    terlambat: number
    tidakHadir: number
  }
}

export function CS30DayRecapCard({ stats }: CS30DayRecapCardProps) {
  const tepatWaktu = Math.max(stats.hadir - stats.terlambat, 0)

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Rekap 30 Hari</h3>
          <p className="text-[11px] text-neutral-400">Ringkasan kehadiran hari kerja efektif</p>
        </div>
        <TrendingUp size={16} className="text-neutral-400" />
      </div>

      <div className="p-4 grid grid-cols-2 gap-3">
        {/* Hari Hadir */}
        <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500">Hari Hadir</span>
            <CheckCircle2 size={14} className="text-neutral-700" />
          </div>
          <p className="text-xl font-bold text-neutral-900 font-mono">{stats.hadir}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Total presensi masuk</p>
        </div>

        {/* Tepat Waktu */}
        <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500">Tepat Waktu</span>
            <Clock size={14} className="text-neutral-700" />
          </div>
          <p className="text-xl font-bold text-neutral-900 font-mono">{tepatWaktu}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Sebelum 08.00 WIB</p>
        </div>

        {/* Terlambat */}
        <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500">Terlambat</span>
            <AlertCircle size={14} className="text-neutral-500" />
          </div>
          <p className="text-xl font-bold text-neutral-900 font-mono">{stats.terlambat}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Lewat 08.00 WIB</p>
        </div>

        {/* Tidak Hadir / Absen */}
        <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500">Tidak Hadir</span>
            <Calendar size={14} className="text-neutral-500" />
          </div>
          <p className="text-xl font-bold text-neutral-900 font-mono">{stats.tidakHadir}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Hari kerja tanpa presensi</p>
        </div>
      </div>
    </div>
  )
}
