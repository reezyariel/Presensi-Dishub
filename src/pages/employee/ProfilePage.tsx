// ============================================================
// SIPATEN — Halaman Profil Utama (Security & CS)
// Ringkasan Akun Rapi & Ringkas
// Fitur:
//   - Tampilan Foto profil / Inisial avatar
//   - Nama lengkap, Divisi/role, Email & ID Pegawai
//   - Status Akun Terverifikasi
//   - Menu baris navigasi:
//       1. Kelola Profil (-> /profile/edit)
//       2. Kata Sandi & Keamanan (-> /profile/security)
//       3. Riwayat Absensi (-> /history)
//       4. Jadwal Saya (-> /schedule)
//   - Tombol Keluar dari Akun (Logout dengan konfirmasi modal)
//   - Desain mobile-first, rapi, bersih, tanpa formulir panjang di halaman utama
// ============================================================

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Calendar, History, LogOut, ChevronRight,
  Shield, Headphones, Mail, BadgeCheck,
  Clock, Lock, UserCog, AlertCircle,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import AvatarImage from '../../components/common/AvatarImage'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, profile, employeeProfile, role, signOut } = useAuth()
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)

  const displayName = employeeProfile?.full_name || profile?.full_name || user?.email?.split('@')[0] || 'Karyawan'
  const roleLabel = role === 'Security' ? 'Security / Keamanan' : 'Cleaning Service'
  const RoleIcon = role === 'Security' ? Shield : Headphones
  const basePath = role === 'Security' ? '/security' : '/cs'
  const avatarStoragePath = employeeProfile?.avatar_url || null
  const employeeCode = employeeProfile?.employee_code || employeeProfile?.id?.slice(0, 8).toUpperCase() || '—'

  const handleSignOut = async () => {
    setIsSignOutOpen(false)
    await signOut()
    navigate('/login', { replace: true, state: {} })
  }

  // Daftar menu navigasi utama
  const navMenuItems = [
    {
      label: 'Kelola Profil',
      desc: 'Ubah foto profil dan informasi akun',
      icon: UserCog,
      href: `${basePath}/profile/edit`,
    },
    {
      label: 'Kata Sandi & Keamanan',
      desc: 'Perbarui kata sandi login Anda',
      icon: Lock,
      href: `${basePath}/profile/security`,
    },
    {
      label: 'Riwayat Absensi',
      desc: 'Lihat catatan presensi harian',
      icon: History,
      href: `${basePath}/history`,
    },
    {
      label: 'Jadwal Saya',
      desc: 'Jadwal dan shift kerja',
      icon: Calendar,
      href: `${basePath}/schedule`,
    },
  ]

  return (
    <>
      <div className="max-w-xl mx-auto space-y-4">
        {/* ─── Page Title ─── */}
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Profil Saya</h2>
          <p className="text-xs text-neutral-500">Ringkasan akun dan pusat pengaturan</p>
        </div>

        {/* ─── 1. Ringkasan Akun Pegawai (Summary Card) ─── */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-4">
            {/* Foto Profil / Avatar */}
            <div className="flex-shrink-0">
              <AvatarImage
                storagePath={avatarStoragePath}
                name={displayName}
                sizeClass="w-16 h-16 sm:w-20 sm:h-20"
                roundedClass="rounded-2xl"
                initialsTextClass="text-xl sm:text-2xl"
                className="border-2 border-white shadow-sm ring-1 ring-neutral-200/80"
              />
            </div>

            {/* Nama, Role & ID */}
            <div className="flex-1 min-w-0 space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-neutral-900 truncate">
                {displayName}
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-medium">
                <RoleIcon size={13} className="text-neutral-500 flex-shrink-0" />
                <span className="truncate">{roleLabel}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400 font-mono pt-0.5">
                <span>ID: {employeeCode}</span>
                {user?.email && (
                  <span className="flex items-center gap-1 truncate max-w-[200px]">
                    <Mail size={11} className="flex-shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status Akun Terverifikasi Strip */}
          <div className="flex items-center justify-between pt-3 border-t border-neutral-100 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 font-medium">
              <BadgeCheck size={14} className="text-emerald-600 flex-shrink-0" />
              <span className="text-[11px]">Akun Terverifikasi</span>
            </div>
            {role === 'Security' && employeeProfile?.default_shift && (
              <span className="text-[11px] text-neutral-400 font-medium">
                {employeeProfile.default_shift}
              </span>
            )}
          </div>
        </div>

        {/* ─── 2. Menu Navigasi Utama (Baris Menu Bersih) ─── */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Pengaturan &amp; Aktivitas
            </p>
          </div>
          <div className="divide-y divide-neutral-100">
            {navMenuItems.map(item => {
              const Icon = item.icon
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-neutral-50/80 transition-colors group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center flex-shrink-0 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-neutral-900 leading-snug">
                        {item.label}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-neutral-300 group-hover:text-neutral-700 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2"
                  />
                </Link>
              )
            })}
          </div>
        </div>

        {/* ─── 3. Tombol Keluar dari Akun ─── */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setIsSignOutOpen(true)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-red-50/50 transition-colors group text-left"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0 group-hover:bg-red-600 group-hover:text-white transition-colors">
                <LogOut size={16} />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-red-600">
                  Keluar dari Akun
                </p>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Akhiri sesi kerja di perangkat ini
                </p>
              </div>
            </div>
            <ChevronRight
              size={16}
              className="text-neutral-300 group-hover:text-red-400 group-hover:translate-x-0.5 transition-all"
            />
          </button>
        </div>

        {/* ─── Footer Versi Aplikasi ─── */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-neutral-400 pt-1 pb-2">
          <Clock size={11} />
          <span>SIPATEN v1.0 · Sistem Absensi &amp; Manajemen Shift</span>
        </div>
      </div>

      {/* ─── Modal Konfirmasi Keluar ─── */}
      {isSignOutOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl p-5 max-w-sm w-full space-y-4 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Konfirmasi Keluar</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Apakah Anda yakin ingin keluar dari akun?</p>
              </div>
            </div>
            <p className="text-xs text-neutral-600">
              Anda perlu memasukkan ID Pegawai atau Email dan kata sandi kembali untuk masuk.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsSignOutOpen(false)}
                className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
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
