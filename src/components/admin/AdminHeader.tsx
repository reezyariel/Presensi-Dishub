import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import {
  Calendar, Menu, Bell, LogOut, ChevronRight,
  ShieldCheck, AlertTriangle, CheckCircle2, Clock
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'
import { TIMEZONE } from '../../lib/scheduleEngine'

const PAGE_TITLES: Record<string, { title: string; category: string }> = {
  '/admin': { title: 'Dashboard Ringkasan', category: 'Utama' },
  '/admin/employees': { title: 'Manajemen Pegawai', category: 'SDM' },
  '/admin/attendance': { title: 'Daftar Presensi', category: 'Presensi' },
  '/admin/attendance/detail': { title: 'Detail Catatan Presensi', category: 'Presensi' },
  '/admin/review': { title: 'Review & Verifikasi Presensi', category: 'Pemeriksaan' },
  '/admin/recap/daily': { title: 'Rekapitulasi Harian', category: 'Laporan' },
  '/admin/recap/monthly': { title: 'Rekapitulasi Bulanan', category: 'Laporan' },
  '/admin/settings/schedule': { title: 'Konfigurasi Shift & Jadwal', category: 'Pengaturan' },
  '/admin/settings/location': { title: 'Titik Lokasi & Geofence', category: 'Pengaturan' },
  '/admin/audit': { title: 'Log Audit Keamanan', category: 'Keamanan' },
}

interface AdminHeaderProps {
  onToggleSidebar?: () => void
}

export default function AdminHeader({ onToggleSidebar }: AdminHeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()

  const [currentTime, setCurrentTime] = useState<Date>(new Date())
  const [pendingReviewCount, setPendingReviewCount] = useState<number>(0)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  // Determine current page info
  const pageInfo = (() => {
    if (location.pathname.startsWith('/admin/attendance/')) {
      return { title: 'Detail Presensi', category: 'Presensi' }
    }
    return PAGE_TITLES[location.pathname] ?? { title: 'Dashboard Admin', category: 'Admin' }
  })()

  // Real-time clock interval (updates every second)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch pending attendance reviews for notification badge
  useEffect(() => {
    async function fetchPendingCount() {
      try {
        const { count } = await supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('review_status', 'perlu_tindak_lanjut')

        setPendingReviewCount(count || 0)
      } catch (err) {
        console.warn('Failed to load pending reviews count', err)
      }
    }

    fetchPendingCount()
    const pollInterval = setInterval(fetchPendingCount, 30000)
    return () => clearInterval(pollInterval)
  }, [])

  // Close notifications dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true, state: {} })
  }

  // Localized date formatting
  const dateStr = formatInTimeZone(currentTime, TIMEZONE, 'EEEE, dd MMM yyyy')
  const timeStr = formatInTimeZone(currentTime, TIMEZONE, 'HH:mm:ss')

  const dayMap: Record<string, string> = {
    Monday: 'Senin',
    Tuesday: 'Selasa',
    Wednesday: 'Rabu',
    Thursday: 'Kamis',
    Friday: 'Jumat',
    Saturday: 'Sabtu',
    Sunday: 'Minggu',
  }
  const localeDateStr = Object.entries(dayMap).reduce(
    (str, [en, id]) => str.replace(en, id),
    dateStr,
  )

  return (
    <header className="admin-header justify-between">
      {/* Left: Mobile Toggle & Desktop Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="md:hidden p-2 rounded-xl text-neutral-600 hover:bg-neutral-100 transition-colors"
          aria-label="Buka Menu Navigasi"
        >
          <Menu size={20} />
        </button>

        <div className="flex flex-col min-w-0">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
            <span>Admin</span>
            <ChevronRight size={12} />
            <span className="text-neutral-500 font-semibold">{pageInfo.category}</span>
          </div>
          <h1 className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight truncate">
            {pageInfo.title}
          </h1>
        </div>
      </div>

      {/* Right: Live Clock, Notifications, User Profile & Logout */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Live Jakarta Time & Date Pill (Desktop) */}
        <div className="hidden lg:flex items-center gap-2.5 text-xs text-neutral-600 bg-neutral-100/90 px-3.5 py-1.5 rounded-xl border border-neutral-200 shadow-2xs font-mono">
          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-neutral-500" />
            <span className="font-sans font-medium text-neutral-700">{localeDateStr}</span>
          </div>
          <span className="text-neutral-300 font-sans">•</span>
          <div className="flex items-center gap-1.5 text-neutral-900 font-bold">
            <Clock size={13} className="text-neutral-500" />
            <span>{timeStr} WIB</span>
          </div>
        </div>

        {/* Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotifOpen(prev => !prev)}
            className="relative p-2 rounded-xl text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            aria-label="Notifikasi"
            title="Pusat Notifikasi & Verifikasi"
          >
            <Bell size={18} />
            {pendingReviewCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-neutral-900 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                {pendingReviewCount > 9 ? '9+' : pendingReviewCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-neutral-200 shadow-xl p-4 z-50 animate-fade-in space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-neutral-900">Notifikasi Presensi</h3>
                  {pendingReviewCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-white">
                      {pendingReviewCount} Perlu Ditindaklanjuti
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-neutral-400">Update Realtime</span>
              </div>

              {pendingReviewCount > 0 ? (
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
                  <div className="flex items-start gap-2.5 text-neutral-800 text-xs">
                    <AlertTriangle size={16} className="text-neutral-900 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-neutral-900">
                        {pendingReviewCount} Catatan Presensi Memerlukan Review
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Terdapat absensi selfie di luar toleransi jadwal atau perlu verifikasi manual admin.
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/admin/review"
                    onClick={() => setIsNotifOpen(false)}
                    className="btn-primary w-full text-[11px] py-1.5 text-center justify-center"
                  >
                    Buka Halaman Review Presensi
                  </Link>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-neutral-500 flex flex-col items-center gap-1.5">
                  <CheckCircle2 size={24} className="text-neutral-800" />
                  <p className="font-medium text-neutral-800">Semua Berjalan Normal</p>
                  <p className="text-[11px] text-neutral-400">Tidak ada antrean presensi yang memerlukan review.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Profile Pill */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-neutral-200">
          <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-2xs">
            {profile?.full_name?.charAt(0).toUpperCase() ?? 'A'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold text-neutral-900 leading-none truncate max-w-[130px]">
              {profile?.full_name ?? 'Administrator'}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck size={11} className="text-neutral-500" />
              <span className="text-[10px] text-neutral-500 font-medium">Super Admin</span>
            </div>
          </div>
        </div>

        {/* Prominent Desktop Logout Button */}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-xl transition-all border border-transparent hover:border-neutral-200"
          title="Keluar dari sesi administrator"
        >
          <LogOut size={15} />
          <span className="hidden md:inline">Keluar</span>
        </button>
      </div>
    </header>
  )
}
