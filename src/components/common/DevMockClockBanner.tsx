// ============================================================
// SIPATEN — Development Mock Clock Banner & Floating Controller
// Rendered ONLY in development (import.meta.env.DEV).
// Allows toggling mock time, switching presets (e.g. Minggu 20:15,
// Jumat 07:15, Senin 08:15), and enabling Mock Testing Sandbox.
//
// In production builds, this component compiles to null.
// ============================================================

import React, { useState, useEffect } from 'react'
import {
  Clock, AlertTriangle, RotateCcw, ChevronDown, ChevronUp,
  Sliders, Check, ShieldAlert, Sparkles, Database, Shield, Lock
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
import {
  isTestingModeActive,
  setTestingModeActive,
  getActiveMockRole,
  setActiveMockRole,
  type MockRole,
} from '../../lib/mockSandbox'
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
  const [isSandboxActive, setIsSandboxActive] = useState(() => isTestingModeActive())
  const [activeRole, setActiveRoleState] = useState<MockRole>(() => getActiveMockRole())

  useEffect(() => {
    const unsub = subscribeToMockClock(() => {
      setActive(isMockClockActive())
      setClockState(getMockClockState())
      setCurrentTime(getEffectiveNow())
    })

    const interval = setInterval(() => {
      setCurrentTime(getEffectiveNow())
    }, 1000)

    const handleTestingChange = () => {
      setIsSandboxActive(isTestingModeActive())
      setActiveRoleState(getActiveMockRole())
    }

    window.addEventListener('sipaten_testing_mode_changed', handleTestingChange)
    window.addEventListener('sipaten_mock_role_changed', handleTestingChange)

    return () => {
      unsub()
      clearInterval(interval)
      window.removeEventListener('sipaten_testing_mode_changed', handleTestingChange)
      window.removeEventListener('sipaten_mock_role_changed', handleTestingChange)
    }
  }, [])

  const handleSelectPreset = (iso: string) => {
    setMockClock(iso, { ticking: isTicking })
    setIsExpanded(false)
  }

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customDateTime) return
    const isoWithTz = `${customDateTime}:00+07:00`
    setMockClock(isoWithTz, { ticking: isTicking })
    setIsExpanded(false)
  }

  const handleResetToRealTime = () => {
    clearMockClock()
    setIsExpanded(false)
  }

  const handleToggleSandbox = () => {
    const nextState = !isSandboxActive
    setTestingModeActive(nextState, activeRole)
    setIsSandboxActive(nextState)
    window.location.reload()
  }

  const handleSwitchMockRole = (role: MockRole) => {
    setActiveMockRole(role)
    setActiveRoleState(role)
    if (!isSandboxActive) {
      setTestingModeActive(true, role)
      setIsSandboxActive(true)
    }
    window.location.reload()
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
            active || isSandboxActive
              ? 'bg-amber-950/95 text-amber-100 border-amber-500/50 shadow-amber-900/40 ring-1 ring-amber-400/30'
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
                {active ? 'DevClock Aktif' : 'DevClock (Waktu Nyata)'}
              </span>

              {isSandboxActive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px]">
                  <Database size={11} />
                  <span>Sandbox ON ({activeRole})</span>
                </span>
              )}

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
                  active || isSandboxActive
                    ? 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-sm'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-600'
                }`}
              >
                <Sliders size={12} />
                <span>{isExpanded ? 'Tutup Kontrol' : 'Atur Waktu & Sandbox'}</span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>
          </div>

          {/* Expandable Control Panel */}
          {isExpanded && (
            <div className="border-t border-white/10 px-4 py-3 bg-black/50 space-y-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200 text-xs">
              {/* Sandbox Control Row */}
              <div className="p-3 rounded-xl bg-neutral-900 border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-amber-400" />
                    <div>
                      <span className="font-bold text-white text-xs block">
                        Mode Testing Lokal (Offline Mock Sandbox)
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {isSandboxActive
                          ? 'Aktif: Presensi, foto, dan database disimulasikan lokal. 0 request ke Supabase Production.'
                          : 'Nonaktif: Terhubung ke database Supabase nyata.'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleSandbox}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSandboxActive
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                    }`}
                  >
                    {isSandboxActive ? 'Nonaktifkan Sandbox' : 'Aktifkan Mode Testing (Sandbox)'}
                  </button>
                </div>

                {isSandboxActive && (
                  <div className="pt-2 border-t border-neutral-800 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-neutral-400 font-semibold">Simulasikan Role:</span>
                    <button
                      type="button"
                      onClick={() => handleSwitchMockRole('admin')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                        activeRole === 'admin' ? 'bg-amber-400 text-neutral-950' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      <Lock size={11} />
                      Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMockRole('Security')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                        activeRole === 'Security' ? 'bg-amber-400 text-neutral-950' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      <Shield size={11} />
                      Security (Ahmad Dani)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMockRole('CS')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                        activeRole === 'CS' ? 'bg-amber-400 text-neutral-950' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      <Sparkles size={11} />
                      CS (Budi Santoso)
                    </button>
                  </div>
                )}
              </div>

              {/* Presets */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                  Preset Skenario Pengujian Jadwal & Lintas Hari:
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
                    Isolasi Lingkungan Pengujian:
                  </strong>
                  <p className="text-neutral-400 leading-relaxed text-[10px]">
                    Saat <strong>Mode Sandbox</strong> aktif, simulasi presensi, unggah foto, dan database berjalan sepenuhnya di browser/memori lokal. DevClock bertindak sebagai waktu otoritatif untuk menguji semua shift tanpa menyentuh database Supabase Production.
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
