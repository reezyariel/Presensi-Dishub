// ============================================================
// SIPATEN — Sistem Informasi Pelayanan dan Tenaga Perhubungan
// - Full-Screen Bridge Night Background (100vw x 100vh, cover & center)
// - Left-side bridge cityscape remains vibrant and clearly visible
// - Right-aligned Glassmorphic Login Card on Desktop (380-430px)
// - Official App Identity: SIPATEN (Sistem Informasi Pelayanan dan Tenaga Perhubungan)
// - Responsive touch-friendly mobile layout with zero white gaps
// - 100% preservation of auth logic, roles, and quick demo accounts
// ============================================================

import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { User, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Clock } from 'lucide-react'

export default function LoginPage() {
  const { signIn, isAuthenticated, isAdmin, role, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mounted, setMounted] = useState(false)

  const isSessionExpired = Boolean((location.state as { sessionExpired?: boolean })?.sessionExpired)
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(isSessionExpired)
  const from = isSessionExpired ? undefined : (location.state as { from?: { pathname: string } })?.from?.pathname

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Smooth entrance animation trigger
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60)
    return () => clearTimeout(t)
  }, [])

  const determineDestination = (userRole: string | null | undefined, isUserAdmin: boolean, fromPath?: string): string => {
    const verifiedRole = isUserAdmin || userRole === 'admin' ? 'admin' : userRole

    if (verifiedRole === 'admin') {
      if (fromPath && fromPath.startsWith('/admin') && fromPath !== '/admin/login') return fromPath
      return '/admin'
    }
    if (verifiedRole === 'CS') {
      if (fromPath && fromPath.startsWith('/cs') && !fromPath.includes('/profile')) return fromPath
      return '/cs'
    }
    if (verifiedRole === 'Security') {
      if (fromPath && fromPath.startsWith('/security') && !fromPath.includes('/profile')) return fromPath
      return '/security'
    }
    return '/login'
  }

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const destination = determineDestination(role, isAdmin, from)
      if (destination !== '/login') navigate(destination, { replace: true })
    }
  }, [authLoading, isAuthenticated, isAdmin, role, navigate, from])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSessionExpiredNotice(false)

    if (!identifier.trim()) {
      setError('Harap masukkan ID Karyawan atau Email Anda.')
      return
    }
    if (!password) {
      setError('Harap masukkan password akun Anda.')
      return
    }

    setIsSubmitting(true)
    try {
      const authData = await signIn(identifier, password)
      const destination = determineDestination(authData?.role, authData?.isAdmin ?? false, from)

      if (destination === '/login') {
        setError('Akun Anda tidak memiliki hak akses yang terdaftar. Hubungi Administrator.')
        return
      }
      navigate(destination, { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login gagal.'
      if (msg.includes('Invalid login credentials')) {
        setError('ID Karyawan/Email atau password salah. Silakan periksa kembali.')
      } else {
        setError(msg)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      id="sipaten-login-root"
      className="relative min-h-[100svh] w-full flex flex-col justify-center items-center lg:items-end p-4 sm:p-6 lg:py-6 lg:px-12 xl:px-20 overflow-x-hidden overflow-y-auto selection:bg-white selection:text-black bg-neutral-950"
    >

      {/* ─── Info Block (Desktop Only — Left / Center Area) ─── */}
      <div
        className="hidden lg:flex fixed left-0 top-0 h-full w-[55%] z-10 flex-col justify-center items-start px-14 xl:px-20 pointer-events-none select-none"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateX(0)' : 'translateX(-20px)',
          transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s',
        }}
      >
        {/* Label kecil */}
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/40 mb-4">
          SISTEM INFORMASI PELAYANAN DAN TENAGA PERHUBUNGAN
        </p>

        {/* Headline */}
        <h2 className="text-3xl xl:text-4xl font-black text-white leading-tight mb-4 max-w-[440px]"
          style={{ textShadow: '0 2px 24px rgba(0,0,0,0.6)' }}>
          Satu Sistem,<br />
          <span className="text-white/70">Pelayanan Lebih</span><br />
          <span className="text-white/70">Terintegrasi.</span>
        </h2>

        {/* Divider */}
        <div className="w-10 h-[2px] bg-white/25 mb-5 rounded-full" />

        {/* Deskripsi */}
        <p className="text-sm xl:text-[15px] text-white/50 leading-relaxed max-w-[380px] mb-7"
          style={{ textShadow: '0 1px 12px rgba(0,0,0,0.5)' }}>
          Platform digital untuk mendukung pengelolaan tenaga kerja, absensi, dan jadwal shift secara lebih efektif dan terorganisir.
        </p>

        {/* Feature Points */}
        <div className="flex flex-col gap-3">
          {/* Point 1 */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span className="text-[13px] text-white/55 font-medium">Akses sesuai peran dan tanggung jawab</span>
          </div>
          {/* Point 2 */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <span className="text-[13px] text-white/55 font-medium">Informasi jadwal dan absensi terpusat</span>
          </div>
        </div>
      </div>

      {/* ─── 1. Full-Screen Bridge Night Background (100vw x 100vh) ─── */}
      <div className="fixed inset-0 w-screen h-screen overflow-hidden pointer-events-none select-none z-0">
        {/* Bridge Night Image */}
        <div
          className="absolute inset-0 w-full h-full will-change-transform transform-gpu"
          style={{
            backgroundImage: 'url(/bridge-night.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center 45%',
            backgroundRepeat: 'no-repeat',
            animation: 'slow-zoom 30s ease-in-out infinite alternate',
          }}
        />

        {/* Base dark tint to preserve contrast without drowning out bridge lights */}
        <div className="absolute inset-0 bg-black/45" />

        {/* Desktop directional overlay: clearer on the left, subtle dark gradient to the right behind the form */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-black/35 to-black/80 hidden lg:block" />

        {/* Vertical atmospheric vignettes */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

        {/* Ambient subtle glow lights */}
        <div className="absolute top-[10%] right-[5%] w-[45vw] h-[45vw] max-w-[500px] max-h-[500px] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[10%] left-[5%] w-[40vw] h-[40vw] max-w-[450px] max-h-[450px] rounded-full bg-amber-500/10 blur-[130px] pointer-events-none" />
      </div>

      {/* ─── 2. Glassmorphic Login Card (Positioned on the Right on Desktop) ─── */}
      <div
        className="relative z-10 w-full max-w-[420px] my-auto"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateX(0)' : 'translateX(28px)',
          transition: 'opacity 0.65s cubic-bezier(0.16, 1, 0.3, 1), transform 0.65s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="bg-neutral-950/70 sm:bg-neutral-950/75 backdrop-blur-2xl border border-white/[0.14] rounded-3xl p-6 sm:p-7 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.85),0_0_1px_1px_rgba(255,255,255,0.08)]">

          {/* ── Header: SIPATEN Official Identity & Logo ── */}
          <div
            className="flex flex-col items-center text-center mb-5"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 0.45s ease-out 0.12s, transform 0.45s ease-out 0.12s',
            }}
          >
            {/* Logo Resmi */}
            <div className="relative mb-3 group">
              <div className="absolute -inset-1 rounded-2xl bg-white/20 blur-sm opacity-40 group-hover:opacity-75 transition-opacity duration-300" />
              <img
                src="/logo.jpg"
                alt="Logo SIPATEN"
                className="relative w-12 h-12 rounded-xl object-cover shadow-xl border border-white/25 bg-neutral-900"
              />
            </div>

            {/* Nama Aplikasi SIPATEN */}
            <h1 className="text-2xl sm:text-[26px] font-black text-white tracking-tight leading-none mb-1">
              SIPATEN
            </h1>

            {/* Kepanjangan Resmi */}
            <p className="text-[11px] sm:text-xs text-neutral-300/90 font-medium tracking-normal max-w-[320px] leading-tight">
              Sistem Informasi Pelayanan dan Tenaga Perhubungan
            </p>

            <div className="w-12 h-[1px] bg-white/15 my-3" />

            {/* Sapaan Pengguna */}
            <h2 className="text-sm sm:text-[15px] font-bold text-white tracking-tight flex items-center gap-1.5">
              <span>Selamat datang</span>
              <span className="animate-wave inline-block origin-bottom-right">👋</span>
            </h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Masuk dengan ID Karyawan atau Email Anda
            </p>
          </div>

          {/* ── Session Expired Banner ── */}
          {sessionExpiredNotice && !error && (
            <div className="mb-4 p-3 rounded-xl bg-amber-950/70 border border-amber-500/40 backdrop-blur-md flex items-start gap-2.5 text-amber-200 text-xs shadow-lg animate-fade-in">
              <Clock size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Sesi Anda telah berakhir secara otomatis karena tidak ada aktivitas. Silakan masuk kembali.
              </p>
            </div>
          )}

          {/* ── Error Banner ── */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/70 border border-red-500/40 backdrop-blur-md flex items-start gap-2.5 text-red-200 text-xs shadow-lg animate-fade-in">
              <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          {/* ── Form Input ── */}
          <form onSubmit={handleSubmit} className="space-y-3.5">

            {/* Input: ID Karyawan / Email */}
            <div
              className="space-y-1"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.4s ease-out 0.2s, transform 0.4s ease-out 0.2s',
              }}
            >
              <label htmlFor="login-identifier" className="block text-xs font-semibold text-neutral-200">
                ID Karyawan atau Email
              </label>
              <div className="relative flex items-center group">
                <span className="absolute left-3.5 text-neutral-400 group-focus-within:text-white transition-colors duration-200 pointer-events-none">
                  <User size={15} />
                </span>
                <input
                  id="login-identifier"
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="Contoh: CS001, SEC001, atau Email"
                  autoComplete="username"
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/[0.07] hover:bg-white/[0.10] focus:bg-white/[0.14] border border-white/15 focus:border-white/50 focus:ring-2 focus:ring-white/20 rounded-xl text-sm text-white placeholder:text-neutral-400/80 transition-all duration-200 outline-none"
                />
              </div>
            </div>

            {/* Input: Password */}
            <div
              className="space-y-1"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.4s ease-out 0.26s, transform 0.4s ease-out 0.26s',
              }}
            >
              <label htmlFor="login-password" className="block text-xs font-semibold text-neutral-200">
                Password
              </label>
              <div className="relative flex items-center group">
                <span className="absolute left-3.5 text-neutral-400 group-focus-within:text-white transition-colors duration-200 pointer-events-none">
                  <Lock size={15} />
                </span>
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Masukkan password Anda"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-11 py-2.5 bg-white/[0.07] hover:bg-white/[0.10] focus:bg-white/[0.14] border border-white/15 focus:border-white/50 focus:ring-2 focus:ring-white/20 rounded-xl text-sm text-white placeholder:text-neutral-400/80 transition-all duration-200 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 text-neutral-400 hover:text-white transition-colors p-1 rounded-lg"
                  aria-label={showPass ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Tombol Masuk */}
            <div
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.4s ease-out 0.32s, transform 0.4s ease-out 0.32s',
              }}
            >
              <button
                type="submit"
                id="login-submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-white hover:bg-neutral-100 active:bg-neutral-200 text-neutral-950 font-bold text-sm rounded-xl shadow-[0_4px_24px_rgba(255,255,255,0.25)] hover:shadow-[0_6px_28px_rgba(255,255,255,0.35)] transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] mt-2 group cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                    <span>Memverifikasi...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform duration-200" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* ── Akun Demo Cepat ── */}
          <div
            className="mt-5 pt-4 border-t border-white/10"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.4s ease-out 0.38s, transform 0.4s ease-out 0.38s',
            }}
          >
            <p className="text-[10px] text-center text-neutral-400 font-bold mb-2.5 uppercase tracking-wider">
              Akun Demo Cepat
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="demo-cs"
                title="Akun Demo Petugas Cleaning Service (CS)"
                onClick={() => { setIdentifier('CS001'); setPassword('password123'); setError(null) }}
                className="py-2 px-1.5 bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-white/30 rounded-xl text-[11px] font-semibold text-neutral-200 hover:text-white transition-all text-center active:scale-[0.96] hover:shadow-sm"
              >
                Demo CS
              </button>
              <button
                type="button"
                id="demo-security"
                title="Akun Demo Petugas Security"
                onClick={() => { setIdentifier('SEC001'); setPassword('password123'); setError(null) }}
                className="py-2 px-1.5 bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-white/30 rounded-xl text-[11px] font-semibold text-neutral-200 hover:text-white transition-all text-center active:scale-[0.96] hover:shadow-sm"
              >
                Security
              </button>
              <button
                type="button"
                id="demo-admin"
                title="Akun Demo Administrator Utama"
                onClick={() => { setIdentifier('reezyfbi4@gmail.com'); setPassword('admin123'); setError(null) }}
                className="py-2 px-1.5 bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-white/30 rounded-xl text-[11px] font-semibold text-neutral-200 hover:text-white transition-all text-center active:scale-[0.96] hover:shadow-sm"
              >
                Admin
              </button>
            </div>
          </div>

          {/* ── Lupa Password & Footer ── */}
          <div
            className="text-center mt-3.5"
            style={{
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.4s ease-out 0.44s',
            }}
          >
            <Link
              to="/login"
              onClick={e => {
                e.preventDefault()
                setError('Silakan hubungi Administrator HR untuk mereset password akun Anda.')
              }}
              className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Lupa password?
            </Link>
          </div>

          <p
            className="text-center text-[10px] sm:text-[11px] text-neutral-400/60 mt-4"
            style={{
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.4s ease-out 0.5s',
            }}
          >
            © 2026 SIPATEN · Dinas Perhubungan
          </p>
        </div>
      </div>
    </div>
  )
}

