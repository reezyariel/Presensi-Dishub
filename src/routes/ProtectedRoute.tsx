import { Navigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ShieldAlert, RefreshCw, LogOut, Headphones, Shield } from 'lucide-react'
import type { UserRole } from '../types/attendance'

interface Props {
  children: React.ReactNode
  requireAdmin?: boolean
  allowedRoles?: UserRole[]
}

export default function ProtectedRoute({ children, requireAdmin, allowedRoles }: Props) {
  const { user, isAuthenticated, role, isAdmin, isLoading, authError, signOut, refreshProfile } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-500 font-medium">Memverifikasi hak akses...</p>
        </div>
      </div>
    )
  }

  // 1. Not logged in -> redirect to login
  if (!isAuthenticated || !user) {
    // Only preserve 'from' for specific deep links, not generic landing or profile pages
    const isGenericOrProfile =
      location.pathname.includes('/profile') ||
      location.pathname === '/' ||
      location.pathname === '/login' ||
      location.pathname === '/cs' ||
      location.pathname === '/security'

    return (
      <Navigate
        to="/login"
        state={isGenericOrProfile ? undefined : { from: location }}
        replace
      />
    )
  }

  // Determine authorized status
  const effectiveAllowedRoles: UserRole[] = allowedRoles || (requireAdmin ? ['admin'] : ['admin', 'CS', 'Security', 'user'])

  // Admin has universal access
  const isAuthorized = isAdmin || (role && effectiveAllowedRoles.includes(role))

  // 2. Logged in, but unauthorized for this specific role
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center space-y-5 animate-fade-in border border-neutral-200">
          <div className="w-14 h-14 rounded-full bg-neutral-100 text-neutral-900 border border-neutral-300 flex items-center justify-center mx-auto">
            <ShieldAlert size={28} />
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-800 border border-neutral-200">
              Peran Akun: {role || 'User'}
            </span>
            <h1 className="text-base font-bold text-neutral-900 mt-2.5">
              Akses Dibatasi
            </h1>
            <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
              Akun <strong>{user.email}</strong> berhasil masuk, namun tidak memiliki izin untuk membuka halaman ({location.pathname}).
            </p>
          </div>

          {authError && (
            <div className="p-3 bg-neutral-50 text-neutral-800 text-xs rounded-xl border border-neutral-200 text-left font-mono">
              Info Teknis: {authError}
            </div>
          )}

          {/* Role specific quick action */}
          <div className="space-y-2 pt-2">
            {role === 'CS' && (
              <Link
                to="/cs"
                className="btn-primary w-full justify-center py-2.5 text-xs flex items-center gap-1.5"
              >
                <Headphones size={15} />
                <span>Buka Portal Customer Service</span>
              </Link>
            )}

            {role === 'Security' && (
              <Link
                to="/security"
                className="btn-primary w-full justify-center py-2.5 text-xs flex items-center gap-1.5"
              >
                <Shield size={15} />
                <span>Buka Portal Security</span>
              </Link>
            )}

            <button
              onClick={() => refreshProfile()}
              className="btn-secondary w-full justify-center py-2.5 text-xs flex items-center gap-1.5"
            >
              <RefreshCw size={14} />
              <span>Periksa Ulang Hak Akses</span>
            </button>

            <button
              onClick={() => signOut()}
              className="text-xs text-neutral-500 hover:text-black py-2 flex items-center justify-center gap-1 font-medium hover:underline w-full transition-colors"
            >
              <LogOut size={13} />
              <span>Keluar dari Akun</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
