// ============================================================
// SIPATEN — Employee Topbar (Desktop)
// Shown at top of content area on ≥md breakpoint
// Breadcrumb, date/time, user info, hamburger for mobile
// ============================================================

import { useState, useEffect } from 'react'
import { useLocation, NavLink } from 'react-router-dom'
import { Menu, Clock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

interface EmployeeTopbarProps {
  category: 'CS' | 'Security'
  onMenuToggle: () => void
}

const pageTitles: Record<string, string> = {
  '': 'Beranda',
  'history': 'Riwayat Absensi',
  'schedule': 'Jadwal Kerja',
  'profile': 'Profil Saya',
  'reports': 'Laporan',
}

export default function EmployeeTopbar({ category, onMenuToggle }: EmployeeTopbarProps) {
  const { profile, employeeProfile } = useAuth()
  const location = useLocation()
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Determine page title from last URL segment
  const basePath = category === 'Security' ? '/security' : '/cs'
  const pathSuffix = location.pathname.replace(basePath, '').replace(/^\//, '')
  const pageTitle = pageTitles[pathSuffix] ?? 'SIPATEN'

  const displayName = employeeProfile?.full_name || profile?.full_name || 'Karyawan'
  const shortName = displayName.split(' ')[0]

  // Format date Indonesian
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des']
  const dateStr = `${days[currentTime.getDay()]}, ${currentTime.getDate()} ${months[currentTime.getMonth()]} ${currentTime.getFullYear()}`
  const timeStr = currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <header className="h-16 bg-white border-b border-neutral-200 flex items-center px-5 lg:px-7 sticky top-0 z-30 gap-4">
      {/* Mobile hamburger button */}
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors md:hidden flex-shrink-0"
        aria-label="Buka menu navigasi"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-bold text-neutral-900 truncate">{pageTitle}</h1>
        <p className="text-[11px] text-neutral-400 hidden sm:block">{dateStr}</p>
      </div>

      {/* Real-time Clock (desktop) */}
      <div className="hidden md:flex items-center gap-1.5 text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 flex-shrink-0">
        <Clock size={13} />
        <span className="font-mono font-semibold text-neutral-700">{timeStr}</span>
        <span className="text-neutral-400">WIB</span>
      </div>

      {/* User Avatar */}
      <NavLink
        to={`${basePath}/profile`}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-neutral-100 transition-colors flex-shrink-0"
      >
        <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="hidden sm:block">
          <p className="text-xs font-semibold text-neutral-900 leading-none">{shortName}</p>
          <p className="text-[10px] text-neutral-400 leading-none mt-0.5">{category}</p>
        </div>
      </NavLink>
    </header>
  )
}
