// ============================================================
// SIPATEN — Development Mock Clock Banner & Floating Controller
// Rendered ONLY in development (import.meta.env.DEV).
// Allows toggling mock time, switching presets (e.g. Minggu 20:15,
// Senin 08:15), and custom time for testing overnight shifts.
//
// In production builds, this component compiles to null.
// ============================================================

import React, { useState, useEffect } from 'react'
import {
  Clock, AlertTriangle, RotateCcw, ChevronDown, ChevronUp,
  Sliders, Check, ShieldAlert
} from 'lucide-react'
import {
  isMockClockActive,
  getMockClockState,
  getEffectiveNow,
  setMockClock,
  clearMockClock,
  DEV_CLOCK_PRESETS,
  subscribeToMockClock,
  TIMEZONE,
} from '../../lib/mockClock'
import { formatInTimeZone } from 'date-fns-tz'

export default function DevMockClockBanner() {
  // If not development, return null immediately so tree-shaking drops this component
  if (!import.meta.env.DEV) {
    return null
  }

  const [active, setActive] = useState(() => isMockClockActive())
  const [clockState, setClockState] = useState(() => getMockClockState())
  const [currentTime, setCurrentTime] = useState<Date>(() => getEffectiveNow())
  const [isExpanded, setIsExpanded] = useState(false)
  const [customDateTime, setCustomDateTime] = useState('')
  const [isTicking, setIsTicking] = useState(false)

  useEffect(() => {
    const unsub = subscribeToMockClock(() => {
      setActive(isMockClockActive())
      setClockState(getMockClockState())
      setCurrentTime(getEffectiveNow())
    })

    const interval = setInterval(() => {
      setCurrentTime(getEffectiveNow())
    }, 1000)

    return () => {
      unsub()
      clearInterval(interval)
    }
  }, [])

  const handleSelectPreset = (iso: string) => {
    setMockClock(iso, { ticking: isTicking })
    setIsExpanded(false)
  }

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customDateTime) return
    // customDateTime is "YYYY-MM-DDTHH:mm", append seconds +07:00
    const isoWithTz = `${customDateTime}:00+07:00`
    setMockClock(isoWithTz, { ticking: isTicking })
    setIsExpanded(false)
  }

  const handleResetToRealTime = () => {
    clearMockClock()
    setIsExpanded(false)
  }

  const formattedJakartaNow = formatInTimeZone(currentTime, TIMEZONE, 'EEEE, dd MMM yyyy — HH:mm:ss')

  return (
    <aside
      aria-label="Development Time Simulation Control"
      className="fixed bottom-0 inset-x-0 z-50 pointer-events-none select-none font-sans"
    >
      <div className="max-w-4xl mx-auto p-3 pointer-events-auto">
        {/* Banner Bar */}
        <div
          className={`rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 overflow-hidden ${
            active
              ? 'bg-amber-950/90 text-amber-100 border-amber-500/50 shadow-amber-900/30 ring-1 ring-amber-400/30'
              : 'bg-neutral-900/90 text-neutral-200 border-neutral-700/60 shadow-black/40'
          }`}
        >
          {/* Header Row */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                  active
                    ? 'bg-amber-400 text-neutral-950 font-black animate-pulse'
                    : 'bg-neutral-700 text-neutral-300'
                }`}
              >
                {active ? <AlertTriangle size={12} className="stroke-[2.5]" /> : <Clock size={12} />}
                {active ? 'Simulasi Waktu DEV Aktif' : 'Dev Clock (Waktu Nyata)'}
              </span>

              <div className="truncate">
                <span className="font-semibold text-white">
                  {formattedJakartaNow} <span className="text-[10px] opacity-75">WIB</span>
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {active && (
                <button
                  type="button"
                  onClick={handleResetToRealTime}
                  className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Kembalikan ke waktu sistem asli"
                >
                  <RotateCcw size={12} />
                  Reset Nyata
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-sm'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-600'
                }`}
              >
                <Sliders size={12} />
                <span>{isExpanded ? 'Tutup Kontrol' : 'Atur Waktu'}</span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>
          </div>

          {/* Expandable Control Panel */}
          {isExpanded && (
            <div className="border-t border-white/10 px-4 py-3 bg-black/40 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200 text-xs">
              {/* Presets */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                  Preset Skenario Pengujian (Lintas Hari Security):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEV_CLOCK_PRESETS.map(preset => {
                    const isSelected = active && clockState.simulatedIso === preset.iso
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset.iso)}
                        className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-400/20 border-amber-400 text-amber-100 ring-1 ring-amber-400'
                            : 'bg-neutral-800/80 hover:bg-neutral-700/80 border-neutral-700 text-neutral-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs">{preset.label}</span>
                          {isSelected && <Check size={14} className="text-amber-400" />}
                        </div>
                        <p className="text-[11px] font-medium text-amber-300/90 mt-0.5">{preset.sublabel}</p>
                        <p className="text-[10px] text-neutral-400 mt-1 line-clamp-1">{preset.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Custom Date Time Form */}
              <form onSubmit={handleApplyCustom} className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
                <span className="text-[11px] text-neutral-400 font-medium shrink-0">Waktu Kustom (WIB):</span>
                <input
                  type="datetime-local"
                  value={customDateTime}
                  onChange={e => setCustomDateTime(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-amber-400 outline-none"
                />

                <label className="flex items-center gap-1.5 text-[11px] text-neutral-300 cursor-pointer ml-1">
                  <input
                    type="checkbox"
                    checked={isTicking}
                    onChange={e => setIsTicking(e.target.checked)}
                    className="rounded border-neutral-600 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <span>Berjalan (Ticking)</span>
                </label>

                <button
                  type="submit"
                  disabled={!customDateTime}
                  className="ml-auto px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-neutral-950 text-xs font-bold transition-colors cursor-pointer"
                >
                  Terapkan Waktu Kustom
                </button>
              </form>

              {/* Informative Security Disclaimer */}
              <div className="rounded-xl bg-neutral-900/90 border border-neutral-800 p-2.5 text-[11px] text-neutral-300 flex items-start gap-2">
                <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-semibold mb-0.5">
                    Catatan Arsitektur Waktu Server (Authoritative Server Time):
                  </strong>
                  <p className="text-neutral-400 leading-relaxed text-[10px]">
                    Simulasi waktu ini mengatur jam frontend (React, scheduleEngine, dan TakeAttendanceModal) di localhost
                    sehingga Anda dapat melihat transisi status tombol (&ldquo;can_masuk&rdquo; vs &ldquo;can_pulang&rdquo;) dan countdown secara langsung.
                    Supabase Edge Function (<code className="text-amber-300">submit-attendance</code>) di server tetap memvalidasi waktu server asli.
                    Jika Anda menekan tombol kirim di luar jadwal server yang sebenarnya, server akan menolak dengan galat resmi.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
