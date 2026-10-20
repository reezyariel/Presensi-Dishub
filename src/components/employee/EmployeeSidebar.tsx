// ============================================================
// ShiftTrack — Employee Sidebar (Desktop, ≥ md breakpoint)
// Shown only on desktop (hidden on mobile via CSS)
// Handles CS and Security navigation
// ============================================================

import { NavLink, useNavigate } from 'react-router-dom'
import { Clock, Home, History, Calendar, User, LogOut, Shield, Headphones, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

interface EmployeeSidebarProps {
  category: 'CS' | 'Security'
  isMobileOpen?: boolean
  onClose?: () => void
}

export default function EmployeeSidebar({ category, isMobileOpen = false, onClose }: EmployeeSidebarProps) {
  const { profile, employeeProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)

  const basePath = category === 'Security' ? '/security' : '/cs'
  const displayName = employeeProfile?.full_name || profile?.full_name || 'Karyawan'
  const RoleIcon = category === 'Security' ? Shield : Headphones

  const navItems = [
    { label: 'Beranda', path: basePath, icon: Home, exact: true },
    { label: 'Riwayat Absensi', path: `${basePath}/history`, icon: History, exact: false },
    { label: 'Jadwal', path: `${basePath}/schedule`, icon: Calendar, exact: false },
    { label: 'Profil', path: `${basePath}/profile`, icon: User, exact: false },
  ]

  const handleSignOut = async () => {
    setIsSignOutOpen(false)
    await signOut()
    navigate('/login', { replace: true, state: {} })
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 bottom-0 z-50 flex flex-col',
          'w-[240px] bg-white border-r border-neutral-200',
          'transition-transform duration-300 ease-in-out',
          // Desktop: always visible; Mobile: drawer
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-neutral-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.jpg"
              alt="ShiftTrack Logo"
              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
            />
            <div>
              <p className="text-sm font-bold text-neutral-900 leading-none">ShiftTrack</p>
              <p className="text-[10px] text-neutral-500 font-medium mt-0.5 leading-none">Portal Karyawan</p>
            </div>
          </div>
          {/* Close on mobile */}
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 md:hidden transition-colors"
            aria-label="Tutup menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* User Profile Strip */}
        <div className="px-4 py-4 border-b border-neutral-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-neutral-900 truncate">{displayName}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <RoleIcon size={10} className="text-neutral-500 flex-shrink-0" />
                <p className="text-[11px] text-neutral-500 font-medium truncate">
                  {category === 'CS' ? 'Customer Service' : 'Security / Keamanan'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 select-none">
            Menu
          </p>
          {navItems.map(item => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.label}
                to={item.path}
                end={item.exact}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all',
                    isActive
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Logout Footer */}
        <div className="px-3 pb-4 border-t border-neutral-100 pt-3 flex-shrink-0">
          <button
            onClick={() => setIsSignOutOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-neutral-600 hover:text-red-600 hover:bg-red-50 transition-all"
          >
            <LogOut size={16} />
            <span>Keluar Akun</span>
          </button>
        </div>
      </aside>

      {/* Sign Out Modal */}
      {isSignOutOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl p-5 max-w-sm w-full space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-neutral-900">Keluar dari Akun?</h3>
              <p className="text-xs text-neutral-500">
                Apakah Anda yakin ingin keluar dari sesi ShiftTrack di perangkat ini?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsSignOutOpen(false)}
                className="flex-1 py-2.5 bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-semibold rounded-xl border border-neutral-200 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
