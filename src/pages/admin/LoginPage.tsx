// ============================================================
// ShiftTrack — Premium Split Login Page
// Desktop: Left visual panel (bridge-night.jpg) + Right form
// Mobile: Full-width form with logo header
// Preserves all auth logic: resolve_employee_identifier, 
// role-based redirects, signIn, error handling.
// ============================================================

import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { User, Lock, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const { signIn, isAuthenticated, isAdmin, role, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <div className="min-h-screen flex">
      {/* ─── Left Visual Panel (Desktop only) ─── */}
      <div
        className="hidden lg:flex lg:w-[55%] xl:w-[60%] relative overflow-hidden flex-col justify-between"
        style={{
          backgroundImage: 'url(/bridge-night.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/30" />

        {/* Brand top-left */}
        <div className="relative z-10 p-10 flex items-center gap-3">
          <img
            src="/logo.jpg"
            alt="ShiftTrack Logo"
            className="w-11 h-11 rounded-xl object-cover shadow-lg border border-white/20"
          />
          <div>
            <span className="text-xl font-bold text-white tracking-tight">ShiftTrack</span>
            <p className="text-xs text-white/70 font-medium leading-none mt-0.5">Absensi & Manajemen Shift</p>
          </div>
        </div>

        {/* Hero text center */}
        <div className="relative z-10 px-10 pb-14">
          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight mb-4">
            Presensi yang<br />
            <span className="text-white/80">Cerdas &amp; Terukur</span>
          </h1>
          <p className="text-white/70 text-sm font-medium max-w-sm leading-relaxed">
            Sistem manajemen kehadiran terpadu untuk tim CS dan Security.
            Real-time, akurat, dan mudah digunakan dari mana saja.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-6">
            {['GPS Geofencing', 'Foto Selfie', 'Laporan Instan', 'Multi-Shift'].map(f => (
              <span key={f} className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-full text-xs font-semibold text-white/90 backdrop-blur-sm">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom attribution */}
        <div className="relative z-10 px-10 pb-5">
          <p className="text-white/30 text-[11px]">© 2026 Dinas Perhubungan. ShiftTrack v2.0</p>
        </div>
      </div>

      {/* ─── Right Form Panel ─── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-screen lg:min-h-0 px-6 py-10 lg:px-12 xl:px-16">
        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center mb-8">
          <img
            src="/logo.jpg"
            alt="ShiftTrack Logo"
            className="w-14 h-14 rounded-2xl object-cover shadow-md mb-3"
          />
          <span className="text-lg font-bold text-neutral-900">ShiftTrack</span>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">Absensi & Manajemen Shift</p>
        </div>

        <div className="w-full max-w-[360px] lg:max-w-[400px]">
          {/* Welcome header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Selamat datang 👋</h2>
            <p className="text-sm text-neutral-500 mt-1.5">
              Login dengan ID Karyawan atau Email Anda
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-700 text-xs animate-fade-in">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ID / Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700">ID Karyawan atau Email</label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-neutral-400 pointer-events-none">
                  <User size={16} />
                </span>
                <input
                  id="login-identifier"
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="Contoh: CS001 atau admin@email.com"
                  autoComplete="username"
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 focus:bg-white rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 transition-all outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700">Password</label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-neutral-400 pointer-events-none">
                  <Lock size={16} />
                </span>
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Masukkan password Anda"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-11 py-3 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 focus:bg-white rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 text-neutral-400 hover:text-neutral-700 transition-colors p-1"
                  aria-label={showPass ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              id="login-submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white font-semibold text-sm rounded-xl shadow-sm transition-all flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99] mt-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <span>Masuk</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Accounts */}
          <div className="mt-6 pt-5 border-t border-neutral-100">
            <p className="text-[11px] text-center text-neutral-400 font-medium mb-3 uppercase tracking-wider">
              Akun Demo Cepat
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="demo-cs"
                onClick={() => { setIdentifier('CS001'); setPassword('password123'); setError(null) }}
                className="py-2 px-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-[11px] font-semibold text-neutral-700 transition-colors text-center"
              >
                Demo CS
              </button>
              <button
                type="button"
                id="demo-security"
                onClick={() => { setIdentifier('SEC001'); setPassword('password123'); setError(null) }}
                className="py-2 px-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-[11px] font-semibold text-neutral-700 transition-colors text-center"
              >
                Security
              </button>
              <button
                type="button"
                id="demo-admin"
                onClick={() => { setIdentifier('reezyfbi4@gmail.com'); setPassword('admin123'); setError(null) }}
                className="py-2 px-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-[11px] font-semibold text-neutral-700 transition-colors text-center"
              >
                Admin
              </button>
            </div>
          </div>

          {/* Forgot password */}
          <div className="text-center mt-4">
            <Link
              to="/login"
              onClick={e => {
                e.preventDefault()
                setError('Silakan hubungi Administrator HR untuk mereset password akun Anda.')
              }}
              className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
            >
              Lupa password?
            </Link>
          </div>

          <p className="text-center text-[11px] text-neutral-300 mt-8">
            © 2026 ShiftTrack · Dinas Perhubungan
          </p>
        </div>
      </div>
    </div>
  )
}
