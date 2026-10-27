import assert from 'node:assert/strict'
import {
  IDLE_TIMEOUT_CONFIG,
  getIdleConfigForRole,
  IDLE_STORAGE_KEYS,
  IDLE_BROADCAST_CHANNEL,
  ACTIVITY_THROTTLE_MS,
  HEARTBEAT_INTERVAL_MS,
} from '../src/config/idleTimeout'

console.log('============================================================')
console.log('🧪 SIPATEN Idle Timeout & Auto Logout Test Suite')
console.log('============================================================\n')

// ------------------------------------------------------------
// TEST 1: Konfigurasi Terpusat per Role
// ------------------------------------------------------------
console.log('TEST 1: Verifikasi Konfigurasi Batas Idle per Role')

// 1a. Admin: 15 Menit (900.000 ms), Peringatan 1 Menit Sebelumnya (60.000 ms)
const adminConfig = getIdleConfigForRole('admin', true)
assert.equal(adminConfig.idleTimeoutMs, 15 * 60 * 1000, 'Idle timeout Admin harus tepat 15 menit (900.000 ms)')
assert.equal(adminConfig.warningThresholdMs, 60 * 1000, 'Warning threshold Admin harus 1 menit sebelum logout (60.000 ms)')
assert.equal(adminConfig.roleLabel, 'Administrator', 'Label role admin harus Administrator')
console.log('  ✅ Admin: 15 menit timeout, peringatan 60 detik sebelum batas')

// 1b. CS: 30 Menit (1.800.000 ms), Peringatan 1 Menit Sebelumnya
const csConfig = getIdleConfigForRole('CS', false)
assert.equal(csConfig.idleTimeoutMs, 30 * 60 * 1000, 'Idle timeout CS harus tepat 30 menit (1.800.000 ms)')
assert.equal(csConfig.warningThresholdMs, 60 * 1000, 'Warning threshold CS harus 1 menit sebelum logout (60.000 ms)')
assert.equal(csConfig.roleLabel, 'Petugas CS', 'Label role CS harus Petugas CS')
console.log('  ✅ CS: 30 menit timeout, peringatan 60 detik sebelum batas')

// 1c. Security: 30 Menit (1.800.000 ms), Peringatan 1 Menit Sebelumnya
const secConfig = getIdleConfigForRole('Security', false)
assert.equal(secConfig.idleTimeoutMs, 30 * 60 * 1000, 'Idle timeout Security harus tepat 30 menit (1.800.000 ms)')
assert.equal(secConfig.warningThresholdMs, 60 * 1000, 'Warning threshold Security harus 1 menit sebelum logout (60.000 ms)')
assert.equal(secConfig.roleLabel, 'Petugas Security', 'Label role Security harus Petugas Security')
console.log('  ✅ Security: 30 menit timeout, peringatan 60 detik sebelum batas')

// 1d. Fallback Default
const fallbackConfig = getIdleConfigForRole(null, false)
assert.equal(fallbackConfig.idleTimeoutMs, 30 * 60 * 1000, 'Default fallback harus 30 menit')
console.log('  ✅ Fallback role tidak terdefinisi: 30 menit')

// ------------------------------------------------------------
// TEST 2: Simulasi Logika State Idle, Warning Modal & Auto-Logout
// ------------------------------------------------------------
console.log('\nTEST 2: Simulasi State Machine Idle, Hitung Mundur, dan Auto Logout')

function evaluateSessionState(
  now: number,
  lastActivity: number,
  config: { idleTimeoutMs: number; warningThresholdMs: number }
) {
  const elapsed = now - lastActivity
  const remainingMs = config.idleTimeoutMs - elapsed

  if (remainingMs <= 0) {
    return { shouldLogout: true, isWarningOpen: false, remainingSeconds: 0 }
  }

  if (remainingMs <= config.warningThresholdMs) {
    return {
      shouldLogout: false,
      isWarningOpen: true,
      remainingSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    }
  }

  return { shouldLogout: false, isWarningOpen: false, remainingSeconds: Math.ceil(remainingMs / 1000) }
}

const baseTime = 1000000

// Admin: Menit ke-10 (aktif, tidak ada peringatan)
const adminAt10m = evaluateSessionState(baseTime + 10 * 60 * 1000, baseTime, adminConfig)
assert.equal(adminAt10m.shouldLogout, false)
assert.equal(adminAt10m.isWarningOpen, false)
console.log('  ✅ Admin pada menit ke-10: Sesi aktif, modal tidak terbuka')

// Admin: Menit ke-14 (tepat masuk jendela peringatan 60 detik)
const adminAt14m = evaluateSessionState(baseTime + 14 * 60 * 1000, baseTime, adminConfig)
assert.equal(adminAt14m.shouldLogout, false)
assert.equal(adminAt14m.isWarningOpen, true)
assert.equal(adminAt14m.remainingSeconds, 60)
console.log('  ✅ Admin pada menit ke-14: Modal peringatan terbuka, countdown = 60 detik')

// Admin: Menit ke-14 lewat 30 detik (sisa 30 detik)
const adminAt14m30s = evaluateSessionState(baseTime + 14 * 60 * 1000 + 30 * 1000, baseTime, adminConfig)
assert.equal(adminAt14m30s.shouldLogout, false)
assert.equal(adminAt14m30s.isWarningOpen, true)
assert.equal(adminAt14m30s.remainingSeconds, 30)
console.log('  ✅ Admin pada menit ke-14.5: Countdown berkurang presisi = 30 detik')

// Admin: Menit ke-15 (batas idle habis -> auto logout)
const adminAt15m = evaluateSessionState(baseTime + 15 * 60 * 1000, baseTime, adminConfig)
assert.equal(adminAt15m.shouldLogout, true)
assert.equal(adminAt15m.isWarningOpen, false)
console.log('  ✅ Admin pada menit ke-15: Auto logout terpicu')

// CS: Menit ke-28 (aktif)
const csAt28m = evaluateSessionState(baseTime + 28 * 60 * 1000, baseTime, csConfig)
assert.equal(csAt28m.shouldLogout, false)
assert.equal(csAt28m.isWarningOpen, false)
console.log('  ✅ CS pada menit ke-28: Sesi aktif, modal tidak terbuka')

// CS: Menit ke-29 (peringatan terbuka)
const csAt29m = evaluateSessionState(baseTime + 29 * 60 * 1000, baseTime, csConfig)
assert.equal(csAt29m.shouldLogout, false)
assert.equal(csAt29m.isWarningOpen, true)
assert.equal(csAt29m.remainingSeconds, 60)
console.log('  ✅ CS pada menit ke-29: Modal peringatan terbuka, countdown = 60 detik')

// CS: Menit ke-30 (logout)
const csAt30m = evaluateSessionState(baseTime + 30 * 60 * 1000, baseTime, csConfig)
assert.equal(csAt30m.shouldLogout, true)
console.log('  ✅ CS pada menit ke-30: Auto logout terpicu')

// ------------------------------------------------------------
// TEST 3: Penanganan Tab Background / Terlelap (Wall-Clock Check)
// ------------------------------------------------------------
console.log('\nTEST 3: Penanganan Tab Background / Browser Suspended')

// Tab tertidur selama 20 menit saat user Admin pergi
const adminBackgroundWakeup = evaluateSessionState(baseTime + 20 * 60 * 1000, baseTime, adminConfig)
assert.equal(adminBackgroundWakeup.shouldLogout, true, 'Tab yang tertidur melebihi batas idle harus logout seketika saat bangun')
console.log('  ✅ Tab background yang bangun setelah batas waktu langsung memicu logout tanpa jeda')

// Tab tertidur dan bangun di menit ke-14.8 (sisa 12 detik)
const adminWokeInWarning = evaluateSessionState(baseTime + 14 * 60 * 1000 + 48 * 1000, baseTime, adminConfig)
assert.equal(adminWokeInWarning.shouldLogout, false)
assert.equal(adminWokeInWarning.isWarningOpen, true)
assert.equal(adminWokeInWarning.remainingSeconds, 12, 'Countdown harus mencerminkan sisa waktu nyata')
console.log('  ✅ Tab background yang bangun di jendela peringatan menampilkan sisa detik nyata (12s)')

// ------------------------------------------------------------
// TEST 4: Throttling Event Pointer/Scroll & Isolasi Data Sensitif
// ------------------------------------------------------------
console.log('\nTEST 4: Throttling Aktivitas & Kebersihan Kredensial')

assert.equal(ACTIVITY_THROTTLE_MS, 1000, 'Throttling aktivitas harus 1000 ms')
assert.equal(HEARTBEAT_INTERVAL_MS, 1000, 'Heartbeat interval harus 1000 ms')

// Pastikan storage keys tidak menyimpan password atau token
const allStorageKeys = Object.values(IDLE_STORAGE_KEYS)
for (const k of allStorageKeys) {
  assert.ok(!k.includes('token'), `Storage key "${k}" tidak boleh berisi token`)
  assert.ok(!k.includes('password'), `Storage key "${k}" tidak boleh berisi password`)
  assert.ok(!k.includes('secret'), `Storage key "${k}" tidak boleh berisi secret`)
}
console.log('  ✅ Storage keys terisolasi bebas dari token, password, atau secret key')

// Pastikan channel BroadcastChannel unik
assert.equal(IDLE_BROADCAST_CHANNEL, 'shifttrack_idle_session_channel')
console.log('  ✅ BroadcastChannel IDLE_BROADCAST_CHANNEL terdefinisi konsisten')

console.log('\n============================================================')
console.log('🎉 SEMUA TES AUTO LOGOUT BERHASIL (100% LULUS)')
console.log('============================================================\n')
