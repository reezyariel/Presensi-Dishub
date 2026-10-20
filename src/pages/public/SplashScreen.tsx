import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, ArrowRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

export default function SplashScreen() {
  const navigate = useNavigate()
  const { isAuthenticated, role, isAdmin, isLoading } = useAuth()

  useEffect(() => {
    // If user is already authenticated, redirect automatically after 1.5s
    if (!isLoading && isAuthenticated) {
      const timer = setTimeout(() => {
        if (isAdmin || role === 'admin') navigate('/admin', { replace: true })
        else if (role === 'CS') navigate('/cs', { replace: true })
        else if (role === 'Security') navigate('/security', { replace: true })
        else navigate('/login', { replace: true })
      }, 1200)
      return () => clearTimeout(timer)
    }
  }, [isLoading, isAuthenticated, role, isAdmin, navigate])

  const handleContinue = () => {
    if (isAuthenticated) {
      if (isAdmin || role === 'admin') navigate('/admin')
      else if (role === 'CS') navigate('/cs')
      else if (role === 'Security') navigate('/security')
      else navigate('/login')
    } else {
      navigate('/login')
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100/70 sm:py-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-md bg-white min-h-screen sm:min-h-[844px] sm:rounded-3xl sm:border sm:border-neutral-200 sm:shadow-xl flex flex-col justify-between p-8 relative overflow-hidden">
        {/* Top spacer */}
        <div className="pt-12 text-center">
          {/* Subtle status indicator */}
        </div>

        {/* Center: ShiftTrack Icon & Title matching Reference 1 */}
        <div className="flex flex-col items-center text-center my-auto space-y-4">
          <div className="w-18 h-18 w-20 h-20 bg-neutral-900 rounded-3xl flex items-center justify-center shadow-md">
            <Clock size={42} className="text-white" strokeWidth={2.2} />
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              ShiftTrack
            </h1>
            <p className="text-xs text-neutral-500 font-medium">
              Absensi & Manajemen Shift
            </p>
          </div>

          <div className="pt-8">
            <p className="text-sm text-neutral-600 font-medium leading-relaxed max-w-[220px]">
              Kerja lebih terarah,<br />
              kinerja lebih baik.
            </p>
          </div>
        </div>

        {/* Bottom Decorative Wave & Action Button */}
        <div className="w-full pb-4 space-y-5">
          <button
            onClick={handleContinue}
            className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 group"
          >
            <span>Mulai Sekarang</span>
            <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* SVG Monochrome Waves (bottom decoration matching mockup) */}
          <div className="relative w-full h-16 pointer-events-none opacity-40">
            <svg
              viewBox="0 0 375 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full object-cover"
            >
              <path
                d="M0 45C80 20 180 65 270 30C320 10 350 25 375 35V80H0V45Z"
                fill="#e4e4e7"
              />
              <path
                d="M0 60C100 35 200 70 300 45C340 35 360 45 375 50V80H0V60Z"
                fill="#d4d4d8"
              />
            </svg>
          </div>

          {/* Home indicator pill */}
          <div className="w-32 h-1 bg-neutral-900/80 rounded-full mx-auto" />
        </div>
      </div>
    </div>
  )
}
