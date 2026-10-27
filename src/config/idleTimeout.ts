// ============================================================
// SIPATEN — Konfigurasi Terpusat Auto Logout Idle Timeout
// ============================================================

export interface IdleTimeoutRoleConfig {
  /** Total batas idle time sebelum logout otomatis (milidetik) */
  idleTimeoutMs: number
  /** Waktu munculnya modal peringatan sebelum batas idle tercapai (milidetik) */
  warningThresholdMs: number
  /** Label ramah peran untuk ditampilkan pada modal */
  roleLabel: string
}

/**
 * Konfigurasi batas waktu tidak aktif (idle timeout) per role:
 * - Admin: 15 menit (900.000 ms) — Peringatan di menit ke-14 (sisa 60 detik)
 * - CS: 30 menit (1.800.000 ms) — Peringatan di menit ke-29 (sisa 60 detik)
 * - Security: 30 menit (1.800.000 ms) — Peringatan di menit ke-29 (sisa 60 detik)
 */
export const IDLE_TIMEOUT_CONFIG: Record<string, IdleTimeoutRoleConfig> = {
  admin: {
    idleTimeoutMs: 15 * 60 * 1000, // 15 menit
    warningThresholdMs: 60 * 1000,  // 1 menit (60 detik)
    roleLabel: 'Administrator',
  },
  CS: {
    idleTimeoutMs: 30 * 60 * 1000, // 30 menit
    warningThresholdMs: 60 * 1000,  // 1 menit (60 detik)
    roleLabel: 'Petugas CS',
  },
  Security: {
    idleTimeoutMs: 30 * 60 * 1000, // 30 menit
    warningThresholdMs: 60 * 1000,  // 1 menit (60 detik)
    roleLabel: 'Petugas Security',
  },
  default: {
    idleTimeoutMs: 30 * 60 * 1000, // 30 menit
    warningThresholdMs: 60 * 1000,  // 1 menit (60 detik)
    roleLabel: 'Pengguna',
  },
}

/** Konstanta Storage & Cross-Tab Keys */
export const IDLE_STORAGE_KEYS = {
  LAST_ACTIVITY: 'shifttrack_last_activity_ts',
  ACTIVE_USER_ID: 'shifttrack_active_user_id',
  ACTIVE_USER_ROLE: 'shifttrack_active_user_role',
} as const

export const IDLE_BROADCAST_CHANNEL = 'shifttrack_idle_session_channel'

/** Throttling untuk event berintensitas tinggi (mouse move, scroll) */
export const ACTIVITY_THROTTLE_MS = 1000

/** Interval pengecekan heartbeat timer (milidetik) */
export const HEARTBEAT_INTERVAL_MS = 1000

/**
 * Mengambil konfigurasi idle timeout berdasarkan role dan status admin
 */
export function getIdleConfigForRole(
  role: string | null | undefined,
  isAdmin: boolean
): IdleTimeoutRoleConfig {
  if (isAdmin || role === 'admin') {
    return IDLE_TIMEOUT_CONFIG.admin
  }
  if (role === 'CS') {
    return IDLE_TIMEOUT_CONFIG.CS
  }
  if (role === 'Security') {
    return IDLE_TIMEOUT_CONFIG.Security
  }
  return IDLE_TIMEOUT_CONFIG.default
}
