import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  getIdleConfigForRole,
  IDLE_STORAGE_KEYS,
  IDLE_BROADCAST_CHANNEL,
  ACTIVITY_THROTTLE_MS,
  HEARTBEAT_INTERVAL_MS,
} from '../../config/idleTimeout'
import IdleWarningModal from './IdleWarningModal'

interface SessionBroadcastMessage {
  type: 'ACTIVITY' | 'EXTEND_SESSION' | 'LOGOUT'
  timestamp?: number
  reason?: string
}

export default function IdleSessionManager() {
  const { user, role, isAdmin, isAuthenticated, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [isWarningOpen, setIsWarningOpen] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(60)

  const lastActivityRef = useRef<number>(Date.now())
  const lastThrottleRef = useRef<number>(0)
  const isLoggingOutRef = useRef<boolean>(false)
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null)

  // Ambil konfigurasi batas idle spesifik untuk role saat ini
  const config = getIdleConfigForRole(role, isAdmin)

  // Deteksi apakah sedang berada di area presensi (CS, Security, atau formulir ambil absen)
  const isAttendancePage =
    location.pathname.startsWith('/cs') ||
    location.pathname.startsWith('/security') ||
    location.pathname.startsWith('/absen')

  /**
   * Mengatur ulang waktu aktivitas terakhir secara aman dan menyinkronkannya ke localStorage
   */
  const recordActivity = useCallback((broadcast = true) => {
    // Jika modal peringatan sedang terbuka atau proses logout sedang berjalan, jangan bypass lewat event pasif
    if (isLoggingOutRef.current) return

    const now = Date.now()
    lastActivityRef.current = now

    try {
      localStorage.setItem(IDLE_STORAGE_KEYS.LAST_ACTIVITY, now.toString())
    } catch {
      // Abaikan jika localStorage tidak dapat diakses
    }

    if (broadcast && broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({
          type: 'ACTIVITY',
          timestamp: now,
        } as SessionBroadcastMessage)
      } catch {
        // Abaikan kegagalan broadcast
      }
    }
  }, [])

  /**
   * Eksekusi logout aman ketika batas idle tercapai
   */
  const handleAutoLogout = useCallback(
    async (reason: 'idle' | 'manual' = 'idle') => {
      if (isLoggingOutRef.current) return
      isLoggingOutRef.current = true
      setIsWarningOpen(false)

      // Broadcast logout ke tab lain agar serentak
      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.postMessage({
            type: 'LOGOUT',
            reason,
          } as SessionBroadcastMessage)
        } catch {
          // ignore
        }
      }

      // Bersihkan metadata aktivitas sesi lokal
      try {
        localStorage.removeItem(IDLE_STORAGE_KEYS.LAST_ACTIVITY)
        localStorage.removeItem(IDLE_STORAGE_KEYS.ACTIVE_USER_ID)
        localStorage.removeItem(IDLE_STORAGE_KEYS.ACTIVE_USER_ROLE)
      } catch {
        // ignore
      }

      try {
        await signOut()
      } catch (err) {
        // Tangani secara aman tanpa membocorkan kredensial atau token
        console.warn('[SIPATEN] Auto logout signOut error:', err instanceof Error ? err.message : 'Unknown')
      } finally {
        isLoggingOutRef.current = false
        // Arahkan ke halaman login netral dengan penanda sessionExpired
        navigate('/login', {
          replace: true,
          state: {
            sessionExpired: true,
            reason: reason === 'idle' ? 'idle' : 'manual',
          },
        })
      }
    },
    [signOut, navigate]
  )

  /**
   * Handler tombol "Tetap Masuk": Memperpanjang sesi dan menutup modal peringatan
   */
  const handleStayLoggedIn = useCallback(() => {
    setIsWarningOpen(false)
    const now = Date.now()
    lastActivityRef.current = now

    try {
      localStorage.setItem(IDLE_STORAGE_KEYS.LAST_ACTIVITY, now.toString())
    } catch {
      // ignore
    }

    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({
          type: 'EXTEND_SESSION',
          timestamp: now,
        } as SessionBroadcastMessage)
      } catch {
        // ignore
      }
    }
  }, [])

  // ─── 1. Inisialisasi Aktivitas & Penanganan Pergantian Akun/Role ───
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setIsWarningOpen(false)
      return
    }

    const currentUserId = user.id
    let storedUserId: string | null = null
    let storedActivity: number | null = null

    try {
      storedUserId = localStorage.getItem(IDLE_STORAGE_KEYS.ACTIVE_USER_ID)
      const rawTs = localStorage.getItem(IDLE_STORAGE_KEYS.LAST_ACTIVITY)
      if (rawTs) storedActivity = parseInt(rawTs, 10)
    } catch {
      // ignore
    }

    // Jika pengguna baru login atau berganti akun, perbarui timestamp awal
    if (storedUserId !== currentUserId || !storedActivity || Number.isNaN(storedActivity)) {
      const now = Date.now()
      lastActivityRef.current = now
      try {
        localStorage.setItem(IDLE_STORAGE_KEYS.ACTIVE_USER_ID, currentUserId)
        localStorage.setItem(IDLE_STORAGE_KEYS.ACTIVE_USER_ROLE, role || 'user')
        localStorage.setItem(IDLE_STORAGE_KEYS.LAST_ACTIVITY, now.toString())
      } catch {
        // ignore
      }
    } else {
      lastActivityRef.current = storedActivity
    }

    isLoggingOutRef.current = false
  }, [isAuthenticated, user, role])

  // ─── 2. BroadcastChannel & Storage Event (Sinkronisasi Multi-Tab) ───
  useEffect(() => {
    if (!isAuthenticated) return

    // Inisialisasi BroadcastChannel jika didukung
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel(IDLE_BROADCAST_CHANNEL)
        broadcastChannelRef.current = channel

        channel.onmessage = (event: MessageEvent<SessionBroadcastMessage>) => {
          const data = event.data
          if (!data || typeof data !== 'object') return

          if (data.type === 'ACTIVITY' && data.timestamp) {
            lastActivityRef.current = Math.max(lastActivityRef.current, data.timestamp)
            // Jika ada aktivitas di tab lain, tutup modal peringatan di tab ini jika sedang terbuka
            setIsWarningOpen(false)
          } else if (data.type === 'EXTEND_SESSION') {
            const ts = data.timestamp || Date.now()
            lastActivityRef.current = ts
            setIsWarningOpen(false)
          } else if (data.type === 'LOGOUT') {
            // Tab lain telah logout -> ikuti logout lokal tanpa broadcast ulang
            if (!isLoggingOutRef.current) {
              isLoggingOutRef.current = true
              setIsWarningOpen(false)
              signOut().finally(() => {
                isLoggingOutRef.current = false
                navigate('/login', {
                  replace: true,
                  state: { sessionExpired: true, reason: data.reason || 'idle' },
                })
              })
            }
          }
        }
      } catch {
        // Fallback jika pembuatan BroadcastChannel gagal
      }
    }

    // Storage event listener sebagai fallback sinkronisasi antartab
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === IDLE_STORAGE_KEYS.LAST_ACTIVITY && e.newValue) {
        const ts = parseInt(e.newValue, 10)
        if (!Number.isNaN(ts)) {
          lastActivityRef.current = Math.max(lastActivityRef.current, ts)
          setIsWarningOpen(false)
        }
      } else if (e.key === IDLE_STORAGE_KEYS.ACTIVE_USER_ID && !e.newValue) {
        // User id dihapus dari storage oleh tab lain (logout)
        if (!isLoggingOutRef.current) {
          isLoggingOutRef.current = true
          setIsWarningOpen(false)
          signOut().finally(() => {
            isLoggingOutRef.current = false
            navigate('/login', {
              replace: true,
              state: { sessionExpired: true, reason: 'idle' },
            })
          })
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)

    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close()
        broadcastChannelRef.current = null
      }
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [isAuthenticated, signOut, navigate])

  // ─── 3. Deteksi Aktivitas Pengguna (Throttled & Passive) ───
  useEffect(() => {
    if (!isAuthenticated) return

    const handleThrottledActivity = () => {
      // Jika modal peringatan sedang terbuka, jangan reset otomatis lewat goyangan pointer
      if (isWarningOpen) return

      const now = Date.now()
      if (now - lastThrottleRef.current >= ACTIVITY_THROTTLE_MS) {
        lastThrottleRef.current = now
        recordActivity(true)
      }
    }

    const handleImmediateActivity = () => {
      if (isWarningOpen) return
      recordActivity(true)
    }

    // Pasang listener global dengan passive: true agar performa UI maksimal
    const passiveOpts: AddEventListenerOptions = { passive: true, capture: true }

    window.addEventListener('click', handleImmediateActivity, passiveOpts)
    window.addEventListener('keydown', handleImmediateActivity, passiveOpts)
    window.addEventListener('touchstart', handleImmediateActivity, passiveOpts)
    window.addEventListener('pointerdown', handleImmediateActivity, passiveOpts)
    window.addEventListener('mousemove', handleThrottledActivity, passiveOpts)
    window.addEventListener('scroll', handleThrottledActivity, passiveOpts)

    return () => {
      window.removeEventListener('click', handleImmediateActivity, passiveOpts)
      window.removeEventListener('keydown', handleImmediateActivity, passiveOpts)
      window.removeEventListener('touchstart', handleImmediateActivity, passiveOpts)
      window.removeEventListener('pointerdown', handleImmediateActivity, passiveOpts)
      window.removeEventListener('mousemove', handleThrottledActivity, passiveOpts)
      window.removeEventListener('scroll', handleThrottledActivity, passiveOpts)
    }
  }, [isAuthenticated, isWarningOpen, recordActivity])

  // ─── 4. Heartbeat Timer & Penanganan Tab Background / Visibility ───
  useEffect(() => {
    if (!isAuthenticated) return

    const checkSessionState = () => {
      if (isLoggingOutRef.current) return

      // Periksa timestamp terbaru dari localStorage (jika diperbarui dari tab lain)
      try {
        const rawStored = localStorage.getItem(IDLE_STORAGE_KEYS.LAST_ACTIVITY)
        if (rawStored) {
          const parsed = parseInt(rawStored, 10)
          if (!Number.isNaN(parsed) && parsed > lastActivityRef.current) {
            lastActivityRef.current = parsed
          }
        }
      } catch {
        // ignore
      }

      const now = Date.now()
      const elapsed = now - lastActivityRef.current
      const remainingMs = config.idleTimeoutMs - elapsed

      // 1. Batas idle terlampaui -> Logout otomatis seketika
      if (remainingMs <= 0) {
        handleAutoLogout('idle')
        return
      }

      // 2. Dalam rentang peringatan (1 menit / 60 detik terakhir)
      if (remainingMs <= config.warningThresholdMs) {
        const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000))
        setRemainingSeconds(secondsLeft)
        setIsWarningOpen(true)
      } else {
        // Masih aman di luar rentang peringatan
        if (isWarningOpen) {
          setIsWarningOpen(false)
        }
      }
    }

    // Jalankan pengecekan pertama kali
    checkSessionState()

    // Jalankan timer heartbeat setiap 1 detik
    const timerId = setInterval(checkSessionState, HEARTBEAT_INTERVAL_MS)

    // Deteksi saat tab aktif kembali dari background / diminimalkan
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkSessionState()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)

    return () => {
      clearInterval(timerId)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.removeEventListener('focus', handleVisibilityOrFocus)
    }
  }, [isAuthenticated, config, isWarningOpen, handleAutoLogout])

  // Jika tidak terotentikasi, jangan tampilkan modal
  if (!isAuthenticated) return null

  return (
    <IdleWarningModal
      isOpen={isWarningOpen}
      remainingSeconds={remainingSeconds}
      roleLabel={config.roleLabel}
      isAttendancePage={isAttendancePage}
      onStayLoggedIn={handleStayLoggedIn}
      onLogoutNow={() => handleAutoLogout('manual')}
    />
  )
}
