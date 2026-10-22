// ============================================================
// SIPATEN — Profil Page (Responsive)
// Desktop: Two-column layout with profile card + info sections
// Mobile: Compact single-column list
// No window.alert, no window.confirm, clean sign-out flow
// ============================================================

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Calendar, History, Settings,
  HelpCircle, LogOut, ChevronRight,
  Shield, Headphones, Mail, BadgeCheck,
  Clock,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

interface InfoRowProps {
  label: string
  value: string | undefined | null
  mono?: boolean
}
function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-neutral-100 last:border-0">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className={`text-xs font-semibold text-neutral-900 ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </span>
    </div>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, profile, employeeProfile, role, signOut } = useAuth()
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)
  const [isInfoOpen, setIsInfoOpen] = useState(false)

  const handleSignOut = async () => {
    setIsSignOutOpen(false)
    await signOut()
    navigate('/login', { replace: true, state: {} })
  }

  const displayName = employeeProfile?.full_name || profile?.full_name || user?.email?.split('@')[0] || 'Karyawan'
  const roleLabel = role === 'Security' ? 'Security / Keamanan' : 'Cleaning Service'
  const RoleIcon = role === 'Security' ? Shield : Headphones
  const basePath = role === 'Security' ? '/security' : '/cs'
  const initials = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()

  const menuGroups = [
    {
      title: 'Akun & Aktivitas',
      items: [
        {
          label: 'Riwayat Absensi',
          icon: History,
          href: `${basePath}/history`,
          desc: 'Lihat catatan presensi Anda',
        },
        {
          label: 'Jadwal Saya',
          icon: Calendar,
          href: `${basePath}/schedule`,
          desc: 'Jadwal dan shift kerja',
        },
      ],
    },
    {
      title: 'Pengaturan & Bantuan',
      items: [
        {
          label: 'Pengaturan Akun',
          icon: Settings,
          onClick: () => setIsInfoOpen(true),
          desc: 'Kelola preferensi akun',
        },
        {
          label: 'Bantuan & Dukungan',
          icon: HelpCircle,
          onClick: () => {/* no-op */ },
          desc: 'Hubungi IT Helpdesk',
        },
      ],
    },
  ]

  return (
    <>
      <div className="space-y-5">
        {/* ─── Page Header ─── */}
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Profil Saya</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Informasi akun dan pengaturan</p>
        </div>

        {/* ─── Two-column layout on desktop ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT: Profile card + detailed info */}
          <div className="lg:col-span-1 space-y-5">
            {/* Profile Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              {/* Header strip */}
              <div className="h-16 bg-neutral-900" />
              <div className="px-5 pb-5 -mt-8">
                <div className="w-16 h-16 rounded-2xl bg-white border-4 border-white shadow-sm flex items-center justify-center text-xl font-bold text-neutral-900 mb-3">
                  {initials}
                </div>
                <h3 className="text-base font-bold text-neutral-900">{displayName}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <RoleIcon size={12} className="text-neutral-500" />
                  <p className="text-xs text-neutral-500 font-medium">{roleLabel}</p>
                </div>
                {user?.email && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Mail size={11} className="text-neutral-400" />
                    <p className="text-[11px] text-neutral-400 font-mono">{user.email}</p>
                  </div>
                )}
              </div>
              <div className="px-5 pb-4 border-t border-neutral-100 pt-4">
                <div className="flex items-center gap-2 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                  <BadgeCheck size={15} className="text-neutral-700 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-neutral-700">Akun Terverifikasi</p>
                    <p className="text-[10px] text-neutral-400">SIPATEN ID aktif</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Details Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-100">
                <h4 className="text-xs font-bold text-neutral-900">Informasi Akun</h4>
              </div>
              <div className="px-5 py-2">
                <InfoRow label="Nama Lengkap" value={displayName} />
                <InfoRow label="Divisi / Role" value={roleLabel} />
                <InfoRow label="Employee ID" value={employeeProfile?.id?.slice(0, 8).toUpperCase()} mono />
                <InfoRow label="Email" value={user?.email} mono />
                <InfoRow label="Shift Default" value={employeeProfile?.default_shift || 'Shift Standar'} />
              </div>
            </div>
          </div>

          {/* RIGHT: Menu groups + logout */}
          <div className="lg:col-span-2 space-y-5">
            {menuGroups.map(group => (
              <div key={group.title} className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-100">
                  <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">{group.title}</h4>
                </div>
                <div className="divide-y divide-neutral-100">
                  {group.items.map(item => {
                    const Icon = item.icon
                    const inner = (
                      <div className="w-full p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors text-left group">
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-600 flex-shrink-0 group-hover:bg-neutral-200 transition-colors">
                            <Icon size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-neutral-900">{item.label}</p>
                            {'desc' in item && item.desc && (
                              <p className="text-[11px] text-neutral-400 mt-0.5">{item.desc}</p>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-neutral-300 group-hover:text-neutral-600 transition-colors" />
                      </div>
                    )
                    if ('href' in item && item.href) {
                      return (
                        <Link key={item.label} to={item.href}>
                          {inner}
                        </Link>
                      )
                    }
                    const clickItem = item as { label: string; icon: typeof Calendar; onClick: () => void; desc: string }
                    return (
                      <button key={item.label} type="button" onClick={clickItem.onClick} className="w-full">
                        {inner}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Logout Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="divide-y divide-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsSignOutOpen(true)}
                  className="w-full p-4 flex items-center justify-between hover:bg-red-50 transition-colors text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-600 flex-shrink-0 group-hover:bg-red-100 transition-colors">
                      <LogOut size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-red-600">Keluar dari Akun</p>
                      <p className="text-[11px] text-neutral-400">Akhiri sesi SIPATEN</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-neutral-300" />
                </button>
              </div>
            </div>

            {/* App version info */}
            <div className="flex items-center justify-center gap-2 text-[10px] text-neutral-400 py-2">
              <Clock size={11} />
              <span>SIPATEN v1.0 · Absensi &amp; Manajemen Shift</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sign Out Confirmation Modal */}
      {isSignOutOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <LogOut size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Keluar dari Akun?</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Sesi SIPATEN akan diakhiri di perangkat ini.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
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

      {/* Account Info Modal */}
      {isInfoOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">Informasi Akun</h3>
              <button onClick={() => setIsInfoOpen(false)} className="text-neutral-400 hover:text-neutral-700 transition-colors">
                <ChevronRight size={18} className="rotate-90" />
              </button>
            </div>
            <div className="space-y-1 text-xs">
              <InfoRow label="Nama" value={displayName} />
              <InfoRow label="Divisi" value={roleLabel} />
              <InfoRow label="Employee ID" value={employeeProfile?.id?.slice(0, 8).toUpperCase()} mono />
              <InfoRow label="Email" value={user?.email} mono />
              <InfoRow label="Shift Default" value={employeeProfile?.default_shift || 'Shift Standar'} />
            </div>
            <p className="text-[10px] text-neutral-400 text-center">
              Untuk mengubah data akun, hubungi tim HRD/IT.
            </p>
            <button
              onClick={() => setIsInfoOpen(false)}
              className="w-full py-2.5 bg-neutral-900 text-white text-xs font-semibold rounded-xl transition-colors hover:bg-black"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  )
}
