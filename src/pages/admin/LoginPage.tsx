// ============================================================
// ShiftTrack — Minimalist Monochrome Login Page
// Matches Reference Mockup Panel 2
// Unified, secure entry point for Admin, CS, & Security
// ============================================================

import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Clock, User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'

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

  // Strict Role-Based Destination Resolver
  const determineDestination = (userRole: string | null | undefined, isUserAdmin: boolean, fromPath?: string): string => {
    const verifiedRole = isUserAdmin || userRole === 'admin' ? 'admin' : userRole

    if (verifiedRole === 'admin') {
      if (fromPath && fromPath.startsWith('/admin') && fromPath !== '/admin/login') {
        return fromPath
      }
      return '/admin'
    }

    if (verifiedRole === 'CS') {
      if (fromPath && fromPath.startsWith('/cs') && !fromPath.includes('/profile')) {
        return fromPath
      }
      return '/cs'
    }

    if (verifiedRole === 'Security') {
      if (fromPath && fromPath.startsWith('/security') && !fromPath.includes('/profile')) {
        return fromPath
      }
      return '/security'
    }

    return '/login'
  }

  // Auto-redirect if already authenticated based on verified database role
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const destination = determineDestination(role, isAdmin, from)
      if (destination !== '/login') {
        navigate(destination, { replace: true })
      }
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
        setError('Akun Anda tidak memiliki hak akses (role) yang terdaftar di sistem. Hubungi Administrator.')
        return
      }

      navigate(destination, { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login gagal. Periksa kembali ID/Email dan password.'
      // Format friendly error messages
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
    <div className="min-h-screen bg-neutral-100/70 sm:py-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-md bg-white min-h-screen sm:min-h-[844px] sm:rounded-3xl sm:border sm:border-neutral-200 sm:shadow-xl flex flex-col justify-between p-7 sm:p-8 relative overflow-hidden">
        {/* Top ShiftTrack Brand */}
        <div className="pt-6 flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center shadow-sm">
            <Clock size={32} className="text-white" strokeWidth={2.2} />
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
              ShiftTrack
            </h1>
            <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
              Absensi & Manajemen Shift
            </p>
          </div>
        </div>

        {/* Center: Form Area */}
        <div className="my-auto py-6 space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-neutral-900">Selamat datang!</h2>
            <p className="text-xs text-neutral-500">
              Silakan login untuk melanjutkan
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-neutral-100 border border-neutral-300 flex items-start gap-2.5 text-neutral-800 text-xs animate-fade-in">
              <AlertCircle size={16} className="text-neutral-900 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Input: ID Karyawan atau Email */}
            <div className="space-y-1.5">
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-neutral-400 pointer-events-none">
                  <User size={17} />
                </span>
                <input
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="ID Karyawan atau Email"
                  autoComplete="username"
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 transition-all outline-none"
                />
              </div>
            </div>

            {/* Input: Password */}
            <div className="space-y-1.5">
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-neutral-400 pointer-events-none">
                  <Lock size={17} />
                </span>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-11 py-3 bg-white border border-neutral-200 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 text-neutral-400 hover:text-neutral-700 transition-colors p-1"
                  aria-label={showPass ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Button: Masuk */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99] mt-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Memproses Masuk...</span>
                </>
              ) : (
                <span>Masuk</span>
              )}
            </button>

            {/* Quick Demo Fill Pills */}
            <div className="pt-2">
              <p className="text-[10px] text-center text-neutral-400 font-medium mb-1.5 uppercase tracking-wider">
                Pilih Akun Demo Cepat
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier('CS001')
                    setPassword('password123')
                    setError(null)
                  }}
                  className="py-1.5 px-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-[11px] font-medium text-neutral-700 transition-colors text-center"
                >
                  Demo CS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier('SEC001')
                    setPassword('password123')
                    setError(null)
                  }}
                  className="py-1.5 px-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-[11px] font-medium text-neutral-700 transition-colors text-center"
                >
                  Demo Security
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier('reezyfbi4@gmail.com')
                    setPassword('admin123')
                    setError(null)
                  }}
                  className="py-1.5 px-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-[11px] font-medium text-neutral-700 transition-colors text-center"
                >
                  Admin
                </button>
              </div>
            </div>

            {/* Forgot Password Link */}
            <div className="text-center pt-1">
              <Link
                to="/login"
                onClick={e => {
                  e.preventDefault()
                  alert('Silakan hubungi Administrator HR untuk reset password akun Anda.')
                }}
                className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
              >
                Lupa password?
              </Link>
            </div>
          </form>
        </div>

        {/* Bottom Decorative Wave & Home Indicator */}
        <div className="w-full pb-2 space-y-4">
          <div className="relative w-full h-12 pointer-events-none opacity-40">
            <svg
              viewBox="0 0 375 60"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full object-cover"
            >
              <path
                d="M0 35C90 15 190 55 280 25C330 10 355 20 375 30V60H0V35Z"
                fill="#e4e4e7"
              />
              <path
                d="M0 48C100 28 200 60 300 38C340 30 360 40 375 45V60H0V48Z"
                fill="#d4d4d8"
              />
            </svg>
          </div>

          <div className="w-32 h-1 bg-neutral-900/80 rounded-full mx-auto" />
        </div>
      </div>
    </div>
  )
}
