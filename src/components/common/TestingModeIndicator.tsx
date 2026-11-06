// ============================================================
// SIPATEN — Testing Mode Top Indicator & Role Switcher
// Displays a prominent, unmistakable alert when Sandbox Mode is active.
// In production builds (import.meta.env.DEV = false), this returns null.
// ============================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShieldAlert, Shield, Sparkles,
  RotateCcw, X, Check, Lock
} from 'lucide-react'
import {
  isTestingModeActive,
  setTestingModeActive,
  getActiveMockRole,
  setActiveMockRole,
  initSeedData,
  type MockRole,
} from '../../lib/mockSandbox'

export default function TestingModeIndicator() {
  if (!import.meta.env.DEV) {
    return null
  }

  const navigate = useNavigate()
  const [isActive, setIsActive] = useState(() => isTestingModeActive())
  const [activeRole, setActiveRole] = useState<MockRole>(() => getActiveMockRole())
  const [resetSuccess, setResetSuccess] = useState(false)

  useEffect(() => {
    const handleTestingMode = () => {
      setIsActive(isTestingModeActive())
      setActiveRole(getActiveMockRole())
    }
    const handleRoleChanged = () => {
      setActiveRole(getActiveMockRole())
    }

    window.addEventListener('sipaten_testing_mode_changed', handleTestingMode)
    window.addEventListener('sipaten_mock_role_changed', handleRoleChanged)

    return () => {
      window.removeEventListener('sipaten_testing_mode_changed', handleTestingMode)
      window.removeEventListener('sipaten_mock_role_changed', handleRoleChanged)
    }
  }, [])

  if (!isActive) return null

  const handleSwitchRole = (newRole: MockRole) => {
    setActiveMockRole(newRole)
    if (newRole === 'admin') {
      navigate('/admin/dashboard')
    } else if (newRole === 'Security') {
      navigate('/security')
    } else {
      navigate('/cs')
    }
  }

  const handleResetData = () => {
    initSeedData(true)
    setResetSuccess(true)
    setTimeout(() => setResetSuccess(false), 2000)
    window.location.reload()
  }

  const handleExitSandbox = () => {
    setTestingModeActive(false)
    window.location.reload()
  }

  return (
    <aside
      aria-label="Testing Mode Status"
      className="sticky top-0 z-[9999] bg-amber-500 text-neutral-950 px-3 sm:px-5 py-2 border-b-2 border-amber-600 shadow-lg text-xs font-medium"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Status & Warning Banner */}
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-600 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-700" />
          </span>
          <div className="flex items-center gap-1.5 font-bold">
            <ShieldAlert size={16} className="text-neutral-950 shrink-0" />
            <span>MODE TESTING (SANDBOX) AKTIF</span>
          </div>
          <span className="hidden md:inline-block text-[11px] bg-neutral-950/10 px-2 py-0.5 rounded-full border border-neutral-950/20">
            0 Request Tulis ke Supabase Production (Terisolasi Total)
          </span>
        </div>

        {/* Middle: Role Switcher Buttons */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-neutral-900 hidden sm:inline">Role Aktif:</span>
          
          <button
            type="button"
            onClick={() => handleSwitchRole('admin')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeRole === 'admin'
                ? 'bg-neutral-950 text-white shadow-sm ring-1 ring-neutral-950'
                : 'bg-white/80 hover:bg-white text-neutral-900 border border-neutral-950/20'
            }`}
          >
            <Lock size={12} />
            <span>Admin</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchRole('Security')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeRole === 'Security'
                ? 'bg-neutral-950 text-white shadow-sm ring-1 ring-neutral-950'
                : 'bg-white/80 hover:bg-white text-neutral-900 border border-neutral-950/20'
            }`}
          >
            <Shield size={12} />
            <span>Security (Ahmad Dani)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchRole('CS')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeRole === 'CS'
                ? 'bg-neutral-950 text-white shadow-sm ring-1 ring-neutral-950'
                : 'bg-white/80 hover:bg-white text-neutral-900 border border-neutral-950/20'
            }`}
          >
            <Sparkles size={12} />
            <span>CS (Budi Santoso)</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetData}
            title="Reset data simulasi ke nilai default"
            className="px-2.5 py-1 rounded-lg bg-neutral-950/10 hover:bg-neutral-950/20 text-neutral-950 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            {resetSuccess ? <Check size={12} className="text-emerald-900" /> : <RotateCcw size={12} />}
            <span>{resetSuccess ? 'Tereset!' : 'Reset Data'}</span>
          </button>

          <button
            type="button"
            onClick={handleExitSandbox}
            title="Keluar dari Sandbox Mode dan kembali ke koneksi Supabase nyata"
            className="px-2.5 py-1 rounded-lg bg-red-700 hover:bg-red-800 text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <X size={12} />
            <span>Keluar Sandbox</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
