// ============================================================
// SIPATEN — Laporan / Rekap Absensi (Unified Report Hub)
// Consolidates Daily & Monthly Recaps with Tab Switcher,
// Filter Toolbar, Live Matrix Tables, and Excel / PDF Exports
// ============================================================

import { useState } from 'react'
import { Calendar, CalendarRange } from 'lucide-react'
import RecapDailyPage from './RecapDailyPage'
import RecapMonthlyPage from './RecapMonthlyPage'

export default function AdminReportsPage() {
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily')

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* Top Tab Navigator */}
      <div className="bg-white rounded-xl border border-neutral-200 p-2 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${activeTab === 'daily'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
          >
            <Calendar size={15} />
            <span>Rekapitulasi Harian</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('monthly')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${activeTab === 'monthly'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
          >
            <CalendarRange size={15} />
            <span>Rekapitulasi Bulanan</span>
          </button>
        </div>

        <span className="text-[11px] text-neutral-400 font-medium hidden sm:inline mr-2">
          Laporan Resmi Presensi CS & Security
        </span>
      </div>

      {/* Render Active View */}
      {activeTab === 'daily' ? <RecapDailyPage /> : <RecapMonthlyPage />}
    </div>
  )
}
