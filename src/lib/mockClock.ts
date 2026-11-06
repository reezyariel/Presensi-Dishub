// ============================================================
// SIPATEN — Development Mock Clock System
// Allows simulating any date and time in localhost (import.meta.env.DEV)
// without altering Windows system time or Supabase server time.
//
// IN PRODUCTION: All methods are completely inert and strictly return
// real system time. Mock clock CANNOT be activated in production.
// ============================================================

import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

export const TIMEZONE = 'Asia/Jakarta'

const STORAGE_KEY = 'sipaten_dev_mock_clock_config'

export interface MockClockState {
  enabled: boolean
  /** ISO 8601 string with Asia/Jakarta offset, e.g. 2026-11-01T20:15:00+07:00 */
  simulatedIso: string | null
  /** Wall-clock performance timestamp when the mock time was set (ms) */
  setAtTimestamp: number
  /** Whether the simulated clock progresses in real-time second-by-second */
  ticking: boolean
}

export interface MockClockPreset {
  id: string
  label: string
  sublabel: string
  iso: string
  description: string
}

export const DEV_CLOCK_PRESETS: MockClockPreset[] = [
  {
    id: 'thu_shift3_in',
    label: 'Kamis 19:45 WIB',
    sublabel: 'Masuk Shift III Kamis Malam',
    iso: '2026-11-05T19:45:00+07:00',
    description: 'Jendela check-in Shift III Kamis malam (19.30–20.00 WIB). Mulai dinas malam lintas hari.',
  },
  {
    id: 'fri_shift3_before_out',
    label: 'Jumat 07:15 WIB (H+1)',
    sublabel: 'Sebelum Checkout Shift III',
    iso: '2026-11-06T07:15:00+07:00',
    description: '15 menit sebelum checkout Shift III Kamis dibuka (07.30 WIB). Tombol disabled menunggu jadwal.',
  },
  {
    id: 'fri_shift3_out_exact',
    label: 'Jumat 07:30 WIB (H+1)',
    sublabel: 'Awal Checkout Shift III',
    iso: '2026-11-06T07:30:00+07:00',
    description: 'Tepat awal dibukanya checkout Shift III Kamis (07.30 WIB). Tombol check-out aktif.',
  },
  {
    id: 'fri_shift3_out',
    label: 'Jumat 07:45 WIB (H+1)',
    sublabel: 'Checkout Shift III Kamis Malam',
    iso: '2026-11-06T07:45:00+07:00',
    description: 'Jendela checkout Shift III Kamis malam (07.30–08.00 WIB H+1). Menyelesaikan shift semalam.',
  },
  {
    id: 'fri_shift3_out_end',
    label: 'Jumat 08:00 WIB (H+1)',
    sublabel: 'Batas Akhir Checkout Shift III',
    iso: '2026-11-06T08:00:00+07:00',
    description: 'Tepat batas akhir checkout Shift III Kamis (08.00 WIB). Tombol check-out masih aktif.',
  },
  {
    id: 'fri_shift3_after_out',
    label: 'Jumat 08:15 WIB (H+1)',
    sublabel: 'Setelah Checkout Shift III Ditutup',
    iso: '2026-11-06T08:15:00+07:00',
    description: 'Setelah jendela checkout Shift III Kamis ditutup (> 08.00 WIB). Status window_closed.',
  },
  {
    id: 'fri_shift1_in',
    label: 'Jumat 07:15 WIB',
    sublabel: 'Masuk Shift I (Reguler & Panjang)',
    iso: '2026-11-06T07:15:00+07:00',
    description: 'Jendela check-in Shift I Jumat (07.00–07.30 WIB). Kedua varian pagi aktif.',
  },
  {
    id: 'fri_shift1_reg_out',
    label: 'Jumat 16:15 WIB',
    sublabel: 'Pulang Shift I Reguler',
    iso: '2026-11-06T16:15:00+07:00',
    description: 'Jendela pulang Shift I Reguler Jumat (16.00–16.30 WIB).',
  },
  {
    id: 'fri_shift2_in',
    label: 'Jumat 19:15 WIB',
    sublabel: 'Masuk Shift II Malam / Pulang Shift I Panjang',
    iso: '2026-11-06T19:15:00+07:00',
    description: 'Jendela masuk Shift II Malam (19.00–19.30 WIB) & batas akhir pulang Shift I Panjang.',
  },
  {
    id: 'sat_shift2_out',
    label: 'Sabtu 07:15 WIB (H+1)',
    sublabel: 'Checkout Shift II Malam dari Jumat',
    iso: '2026-11-07T07:15:00+07:00',
    description: 'Jendela checkout Shift II Malam Jumat (07.00–07.30 WIB H+1).',
  },
  {
    id: 'sun_shift2_in',
    label: 'Minggu 20:15 WIB',
    sublabel: 'Check-in Shift II Minggu',
    iso: '2026-11-01T20:15:00+07:00',
    description: 'Jendela check-in Shift II (20.00–20.30 WIB). Tombol "Ambil Foto & Absen Masuk" aktif.',
  },
  {
    id: 'mon_shift2_out',
    label: 'Senin 08:15 WIB',
    sublabel: 'Checkout Shift II dari Minggu',
    iso: '2026-11-02T08:15:00+07:00',
    description: 'Jendela checkout Shift II (08.00–08.30 WIB H+1). Tombol "Ambil Foto & Absen Pulang" aktif.',
  },
  {
    id: 'mon_shift2_out_exact',
    label: 'Senin 08:00 WIB',
    sublabel: 'Buka Checkout Shift II',
    iso: '2026-11-02T08:00:00+07:00',
    description: 'Waktu persis jendela checkout Shift II dibuka (08.00 WIB H+1).',
  },
  {
    id: 'mon_shift2_before_out',
    label: 'Senin 07:45 WIB',
    sublabel: 'Sebelum Jendela Checkout',
    iso: '2026-11-02T07:45:00+07:00',
    description: '15 menit sebelum jendela checkout dibuka. Tombol disabled: "Pulang pukul 08.00 WIB".',
  },
  {
    id: 'sun_shift2_before_in',
    label: 'Minggu 19:45 WIB',
    sublabel: 'Sebelum Jendela Check-in',
    iso: '2026-11-01T19:45:00+07:00',
    description: '15 menit sebelum check-in Shift II dibuka. Tombol disabled: "Dibuka pukul 20.00 WIB".',
  },
]

// In-memory cache for ultra-fast repeated calls
let cachedState: MockClockState | null = null
const listeners = new Set<() => void>()

function isDev(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.DEV === 'boolean') {
      return import.meta.env.DEV
    }
    const proc = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process
    return typeof proc !== 'undefined' && proc.env?.NODE_ENV !== 'production'
  } catch {
    return false
  }
}

function loadState(): MockClockState {
  if (!isDev()) {
    return { enabled: false, simulatedIso: null, setAtTimestamp: 0, ticking: false }
  }

  if (cachedState) return cachedState

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MockClockState>
      if (parsed.enabled && parsed.simulatedIso) {
        cachedState = {
          enabled: true,
          simulatedIso: parsed.simulatedIso,
          setAtTimestamp: typeof parsed.setAtTimestamp === 'number' ? parsed.setAtTimestamp : Date.now(),
          ticking: Boolean(parsed.ticking),
        }
        return cachedState
      }
    }
  } catch {
    // Session storage unavailable or corrupt
  }

  cachedState = { enabled: false, simulatedIso: null, setAtTimestamp: 0, ticking: false }
  return cachedState
}

function saveState(state: MockClockState): void {
  cachedState = state
  if (!isDev()) return

  try {
    if (state.enabled && state.simulatedIso) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Session storage error ignored
  }

  // Notify all subscribers
  listeners.forEach(fn => {
    try {
      fn()
    } catch (e) {
      console.warn('Error in mock clock listener:', e)
    }
  })

  // Also dispatch window custom event for decoupled UI updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sipaten_mock_clock_changed', { detail: state }))
  }
}

/**
 * Returns true if the mock clock is currently active (only ever true in DEV).
 */
export function isMockClockActive(): boolean {
  if (!isDev()) return false
  const state = loadState()
  return Boolean(state.enabled && state.simulatedIso)
}

/**
 * Core time provider for the application.
 * - In production: strictly returns new Date().
 * - In development: returns the simulated date if mock clock is enabled, otherwise new Date().
 */
export function getEffectiveNow(): Date {
  if (!isDev()) return new Date()

  const state = loadState()
  if (!state.enabled || !state.simulatedIso) {
    return new Date()
  }

  const baseMs = new Date(state.simulatedIso).getTime()
  if (Number.isNaN(baseMs)) {
    return new Date()
  }

  if (!state.ticking) {
    return new Date(baseMs)
  }

  const elapsedMs = Math.max(0, Date.now() - state.setAtTimestamp)
  return new Date(baseMs + elapsedMs)
}

/**
 * Returns current effective time zoned to Asia/Jakarta.
 */
export function getEffectiveNowJakarta(): Date {
  return toZonedTime(getEffectiveNow(), TIMEZONE)
}

/**
 * Returns current effective date string in Asia/Jakarta (YYYY-MM-DD).
 */
export function getEffectiveTodayJakarta(): string {
  return formatInTimeZone(getEffectiveNow(), TIMEZONE, 'yyyy-MM-dd')
}

/**
 * Enables mock clock with the specified ISO string or Date.
 * Strictly a no-op in production.
 */
export function setMockClock(
  dateOrIso: string | Date,
  options: { ticking?: boolean } = {}
): void {
  if (!isDev()) {
    console.warn('Mock clock cannot be activated in production build.')
    return
  }

  let isoStr: string
  if (typeof dateOrIso === 'string') {
    isoStr = dateOrIso
  } else {
    isoStr = formatInTimeZone(dateOrIso, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX")
  }

  saveState({
    enabled: true,
    simulatedIso: isoStr,
    setAtTimestamp: Date.now(),
    ticking: options.ticking ?? false,
  })
}

/**
 * Disables the mock clock and returns the application to real system time.
 */
export function clearMockClock(): void {
  saveState({
    enabled: false,
    simulatedIso: null,
    setAtTimestamp: 0,
    ticking: false,
  })
}

/**
 * Returns current mock clock configuration state.
 */
export function getMockClockState(): MockClockState {
  return loadState()
}

/**
 * Subscribe to mock clock changes (useful for React component re-rendering).
 */
export function subscribeToMockClock(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}
