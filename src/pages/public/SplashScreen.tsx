// ============================================================
// ShiftTrack — Full-Screen Splash Screen
// Genuine full-viewport layout with cinematic animations
// No phone mockup frame — fills 100% of any screen
// ============================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Shield, Users, Clock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

export default function SplashScreen() {
  const navigate = useNavigate()
  const { isAuthenticated, role, isAdmin, isLoading } = useAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Trigger animation cascade after mount
    const t = setTimeout(() => setMounted(true), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    // If user is already authenticated, redirect automatically after 1.8s
    if (!isLoading && isAuthenticated) {
      const timer = setTimeout(() => {
        if (isAdmin || role === 'admin') navigate('/admin', { replace: true })
        else if (role === 'CS') navigate('/cs', { replace: true })
        else if (role === 'Security') navigate('/security', { replace: true })
        else navigate('/login', { replace: true })
      }, 1800)
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
    <div className="relative w-full min-h-screen flex flex-col items-center justify-between overflow-hidden bg-[#0a0a0a]">

      {/* ── Animated Background Gradient ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(60,60,60,0.55) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 100% 110%, rgba(40,40,40,0.4) 0%, transparent 60%), #0a0a0a',
        }}
      />

      {/* ── Subtle Grid Pattern ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* ── Glowing orb top-right ── */}
      <div
        className="absolute -top-32 -right-32 w-80 h-80 rounded-full pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)' }}
      />
      {/* ── Glowing orb bottom-left ── */}
      <div
        className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full pointer-events-none opacity-10"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)' }}
      />

      {/* ── Top brand bar ── */}
      <div
        className="relative z-10 w-full flex items-center justify-between px-6 pt-10 sm:pt-12"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(-16px)',
          transition: 'opacity 0.5s ease-out 0.1s, transform 0.5s ease-out 0.1s',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-white/40 animate-pulse-dot" />
          <span className="text-[11px] font-semibold text-white/40 tracking-widest uppercase">Dinas Perhubungan</span>
        </div>
        <span className="text-[11px] font-mono text-white/25">v2.0</span>
      </div>

      {/* ── Center Content ── */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 py-8 my-auto">

        {/* Logo with bounce-in + continuous float */}
        <div
          className="mb-8"
          style={{
            animation: mounted
              ? 'logo-appear 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both, float 4s ease-in-out 1.1s infinite'
              : 'none',
            opacity: 0,
          }}
        >
          {/* Glow ring behind logo */}
          <div className="relative flex items-center justify-center">
            <div
              className="absolute w-32 h-32 rounded-3xl opacity-20"
              style={{
                background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
                filter: 'blur(12px)',
                animation: 'glow-pulse 3s ease-in-out 1.5s infinite',
              }}
            />
            <img
              src="/logo.jpg"
              alt="ShiftTrack Logo"
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover border border-white/10 shadow-2xl"
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}
            />
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 0.55s ease-out 0.55s, transform 0.55s ease-out 0.55s',
          }}
        >
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-white leading-none">
            ShiftTrack
          </h1>
        </div>

        {/* Tagline */}
        <div
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 0.55s ease-out 0.72s, transform 0.55s ease-out 0.72s',
          }}
        >
          <p className="mt-2.5 text-sm text-white/50 font-medium tracking-widest uppercase">
            Absensi & Manajemen Shift
          </p>
        </div>

        {/* Divider */}
        <div
          className="my-8"
          style={{
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.4s ease-out 0.9s',
          }}
        >
          <div className="w-12 h-px bg-white/15 mx-auto" />
        </div>

        {/* Description */}
        <div
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.55s ease-out 1.0s, transform 0.55s ease-out 1.0s',
          }}
        >
          <p className="text-sm text-white/40 leading-relaxed max-w-[260px]">
            Kerja lebih terarah,<br />kinerja lebih baik.
          </p>
        </div>

        {/* Feature badges */}
        <div
          className="flex flex-wrap gap-2 justify-center mt-7"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(14px)',
            transition: 'opacity 0.5s ease-out 1.15s, transform 0.5s ease-out 1.15s',
          }}
        >
          {[
            { icon: Clock, label: 'Real-time' },
            { icon: Shield, label: 'GPS Verified' },
            { icon: Users, label: 'Multi-Role' },
          ].map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white/60 border border-white/10 bg-white/5 backdrop-blur-sm"
            >
              <Icon size={11} className="text-white/40" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Bottom CTA ── */}
      <div
        className="relative z-10 w-full px-6 pb-10 sm:pb-12 space-y-4"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.55s ease-out 1.3s, transform 0.55s ease-out 1.3s',
        }}
      >
        <button
          onClick={handleContinue}
          id="splash-mulai"
          className="group w-full max-w-sm mx-auto py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #e8e8e8 100%)',
            color: '#0a0a0a',
            boxShadow: '0 8px 32px rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          <span>Mulai Sekarang</span>
          <ArrowRight
            size={16}
            className="group-hover:translate-x-1 transition-transform duration-200"
          />
        </button>

        {/* Home indicator */}
        <div className="w-28 h-1 bg-white/15 rounded-full mx-auto" />
      </div>

      {/* ── Decorative bottom wave (subtle) ── */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none opacity-10">
        <svg viewBox="0 0 375 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path d="M0 30C80 10 180 50 270 20C320 5 350 18 375 25V60H0V30Z" fill="white" />
          <path d="M0 45C100 25 200 55 300 35C340 25 360 35 375 40V60H0V45Z" fill="white" />
        </svg>
      </div>
    </div>
  )
}
