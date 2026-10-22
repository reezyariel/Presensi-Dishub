import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  CheckSquare,
  CalendarRange,
  Clock,
  MapPin,
  History,
  LogOut,
  X,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'

interface NavSection {
  title: string
  items: {
    label: string
    path: string
    icon: React.ReactNode
    badge?: string
  }[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'UTAMA',
    items: [
      {
        label: 'Dashboard',
        path: '/admin',
        icon: <LayoutDashboard size={17} strokeWidth={2} />,
      },
    ],
  },
  {
    title: 'PRESENSI & SDM',
    items: [
      {
        label: 'Data Karyawan',
        path: '/admin/employees',
        icon: <Users size={17} strokeWidth={2} />,
      },
      {
        label: 'Daftar Absensi',
        path: '/admin/attendance',
        icon: <ClipboardList size={17} strokeWidth={2} />,
      },
      {
        label: 'Review Absensi',
        path: '/admin/review',
        icon: <CheckSquare size={17} strokeWidth={2} />,
      },
    ],
  },
  {
    title: 'REKAPITULASI',
    items: [
      {
        label: 'Laporan / Rekap Absensi',
        path: '/admin/reports',
        icon: <CalendarRange size={17} strokeWidth={2} />,
      },
    ],
  },
  {
    title: 'SISTEM & KONFIGURASI',
    items: [
      {
        label: 'Pengaturan Jadwal',
        path: '/admin/settings/schedule',
        icon: <Clock size={17} strokeWidth={2} />,
      },
      {
        label: 'Pengaturan Lokasi',
        path: '/admin/settings/location',
        icon: <MapPin size={17} strokeWidth={2} />,
      },
      {
        label: 'Audit Log',
        path: '/admin/audit',
        icon: <History size={17} strokeWidth={2} />,
      },
    ],
  },
]

interface SidebarProps {
  isMobileOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isMobileOpen = false, onClose }: SidebarProps) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [reviewBadge, setReviewBadge] = useState<number>(0)
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)

  useEffect(() => {
    async function loadReviewCount() {
      try {
        const { count } = await supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .in('review_status', ['perlu_tindak_lanjut', 'belum_diperiksa'])
        setReviewBadge(count || 0)
      } catch {
        // ignore
      }
    }
    loadReviewCount()
  }, [])

  // Warn before accidental tab close / refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const handleSignOut = async () => {
    setIsSignOutOpen(false)
    await signOut()
    navigate('/login', { replace: true, state: {} })
  }

  const handleNavClick = () => {
    if (onClose) onClose()
  }

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 left-0 z-50 flex flex-col',
          'w-[260px] bg-neutral-950 text-white border-r border-neutral-800',
          'transition-transform duration-300 ease-in-out',
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-neutral-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.jpg"
              alt="SIPATEN Logo"
              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-white">SIPATEN</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                  ADMIN
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 font-medium leading-none mt-0.5">
                Management Console
              </p>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 md:hidden transition-colors"
            aria-label="Tutup menu navigasi"
          >
            <X size={18} />
          </button>
        </div>

        {/* Grouped Nav Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin">
          {NAV_SECTIONS.map((section, sIdx) => (
            <div key={sIdx} className="space-y-1">
              <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400 select-none">
                {section.title}
              </div>

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isReviewItem = item.path === '/admin/review'
                  const badgeCount = isReviewItem ? reviewBadge : 0

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/admin'}
                      onClick={handleNavClick}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all',
                          isActive
                            ? 'bg-neutral-800 text-white shadow-xs'
                            : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                        )
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-neutral-400 group-hover:text-white transition-colors">
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </div>

                      {badgeCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white text-neutral-950 font-mono">
                          {badgeCount}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* User Admin Info & Logout Footer */}
        <div className="p-3 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-white truncate">
                {profile?.full_name || 'Administrator Utama'}
              </div>
              <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                <ShieldCheck size={11} className="text-neutral-400" />
                <span>Super Admin</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsSignOutOpen(true)}
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-lg transition-colors flex-shrink-0"
            title="Keluar dari akun admin"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ─── Admin Logout Confirmation Modal ─── */}
      {isSignOutOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsSignOutOpen(false) }}
        >
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-sm w-full p-6 space-y-5 animate-fade-in">
            {/* Icon + Title */}
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-neutral-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 leading-snug">
                  Yakin ingin keluar dari halaman Admin?
                </h3>
                <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                  Pastikan pekerjaan Anda sudah selesai sebelum melanjutkan.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSignOutOpen(false)}
                className="flex-1 py-2.5 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-semibold rounded-xl border border-neutral-200 transition-colors"
              >
                Tetap di Halaman
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <LogOut size={13} />
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
