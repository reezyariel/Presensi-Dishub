/**
 * SIPATEN — Shift Selection Auto-Select & Check-In Window Tests
 * Run with: npx tsx tests/shift_selection_autoselect.test.ts
 */

import {
  getSecurityAvailableOptions,
  getSecurityShiftCheckInStatus,
  getAutoSelectSecurityShift,
} from '../src/lib/scheduleEngine'

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

console.log('\n============================================================')
console.log('🕐  SIPATEN — Shift Selection Auto-Select Window Tests')
console.log('============================================================\n')

// Jakarta = UTC+7: construct a specific wall-clock time as UTC Date
function jktDateTime(dateStr: string, hh: number, mm: number): Date {
  const jakartaOffsetMs = 7 * 60 * 60 * 1000
  const [y, m, d] = dateStr.split('-').map(Number)
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0) - jakartaOffsetMs
  return new Date(utcMs)
}

const WEEKDAY = '2026-10-26' // Monday
const WEEKEND = '2026-11-01' // Saturday

console.log('TEST 1: getSecurityAvailableOptions — Weekday')
{
  const opts = getSecurityAvailableOptions(WEEKDAY)
  assert('Includes Shift I', opts.includes('Shift I'))
  assert('Includes Shift II', opts.includes('Shift II'))
  assert('Includes Shift III', opts.includes('Shift III'))
  assert('No Sesi Pagi', !opts.includes('Sesi Pagi'))
  assert('Length is 3', opts.length === 3)
}

console.log('\nTEST 2: getSecurityAvailableOptions — Weekend')
{
  const opts = getSecurityAvailableOptions(WEEKEND)
  assert('Includes Shift I', opts.includes('Shift I'))
  assert('Includes Shift II', opts.includes('Shift II'))
  assert('No Sesi Pagi', !opts.includes('Sesi Pagi'))
  assert('Length is 2', opts.length === 2)
}

console.log('\nTEST 3: Shift I — belum_dibuka at 06:00 WIB')
{
  const s = getSecurityShiftCheckInStatus('Shift I', WEEKDAY, jktDateTime(WEEKDAY, 6, 0))
  assert('windowStatus = belum_dibuka', s.windowStatus === 'belum_dibuka', `got ${s.windowStatus}`)
}

console.log('\nTEST 4: Shift I — tepat_waktu at 07:15 WIB')
{
  const s = getSecurityShiftCheckInStatus('Shift I', WEEKDAY, jktDateTime(WEEKDAY, 7, 15))
  assert('windowStatus = tepat_waktu', s.windowStatus === 'tepat_waktu', `got ${s.windowStatus}`)
}

console.log('\nTEST 5: Shift I — jendela_selesai at 10:00 WIB')
{
  const s = getSecurityShiftCheckInStatus('Shift I', WEEKDAY, jktDateTime(WEEKDAY, 10, 0))
  assert('windowStatus = jendela_selesai', s.windowStatus === 'jendela_selesai', `got ${s.windowStatus}`)
}

console.log('\nTEST 6: Shift II — belum_dibuka at 12:00 WIB')
{
  const s = getSecurityShiftCheckInStatus('Shift II', WEEKDAY, jktDateTime(WEEKDAY, 12, 0))
  assert('windowStatus = belum_dibuka', s.windowStatus === 'belum_dibuka', `got ${s.windowStatus}`)
}

console.log('\nTEST 7: Shift II — tepat_waktu at 16:15 WIB')
{
  const s = getSecurityShiftCheckInStatus('Shift II', WEEKDAY, jktDateTime(WEEKDAY, 16, 15))
  assert('windowStatus = tepat_waktu', s.windowStatus === 'tepat_waktu', `got ${s.windowStatus}`)
}

console.log('\nTEST 8: Shift III — tepat_waktu at 19:45 WIB')
{
  const s = getSecurityShiftCheckInStatus('Shift III', WEEKDAY, jktDateTime(WEEKDAY, 19, 45))
  assert('windowStatus = tepat_waktu', s.windowStatus === 'tepat_waktu', `got ${s.windowStatus}`)
}

console.log('\nTEST 9: Shift III — jendela_selesai at 20:30 WIB')
{
  const s = getSecurityShiftCheckInStatus('Shift III', WEEKDAY, jktDateTime(WEEKDAY, 20, 30))
  assert('windowStatus = jendela_selesai', s.windowStatus === 'jendela_selesai', `got ${s.windowStatus}`)
}

console.log('\nTEST 10: Shift III — past date workDate → jendela_selesai')
{
  const s = getSecurityShiftCheckInStatus('Shift III', '2026-10-25', jktDateTime(WEEKDAY, 8, 0))
  assert('windowStatus = jendela_selesai (past date)', s.windowStatus === 'jendela_selesai', `got ${s.windowStatus}`)
}

console.log('\nTEST 11: Auto-select Shift I at 07:10 WIB')
{
  const r = getAutoSelectSecurityShift(WEEKDAY, jktDateTime(WEEKDAY, 7, 10))
  assert('auto = Shift I', r === 'Shift I', `got ${r}`)
}

console.log('\nTEST 12: Auto-select Shift II at 16:10 WIB')
{
  const r = getAutoSelectSecurityShift(WEEKDAY, jktDateTime(WEEKDAY, 16, 10))
  assert('auto = Shift II', r === 'Shift II', `got ${r}`)
}

console.log('\nTEST 13: Auto-select Shift III at 19:50 WIB')
{
  const r = getAutoSelectSecurityShift(WEEKDAY, jktDateTime(WEEKDAY, 19, 50))
  assert('auto = Shift III', r === 'Shift III', `got ${r}`)
}

console.log('\nTEST 14: Auto-select — no window active at 13:00 → null')
{
  const r = getAutoSelectSecurityShift(WEEKDAY, jktDateTime(WEEKDAY, 13, 0))
  assert('auto = null', r === null, `got ${r}`)
}

console.log('\nTEST 15: Auto-select — 06:00 all belum_dibuka → null')
{
  const r = getAutoSelectSecurityShift(WEEKDAY, jktDateTime(WEEKDAY, 6, 0))
  assert('auto = null (all belum_dibuka)', r === null, `got ${r}`)
}

console.log('\nTEST 16: Auto-select — 22:00 all jendela_selesai → null')
{
  const r = getAutoSelectSecurityShift(WEEKDAY, jktDateTime(WEEKDAY, 22, 0))
  assert('auto = null (all closed)', r === null, `got ${r}`)
}

console.log('\nTEST 17: isOvernight — Shift I false')
{
  const s = getSecurityShiftCheckInStatus('Shift I', WEEKDAY, jktDateTime(WEEKDAY, 7, 15))
  assert('isOvernight = false', s.isOvernight === false)
}

console.log('\nTEST 18: isOvernight — Shift III true')
{
  const s = getSecurityShiftCheckInStatus('Shift III', WEEKDAY, jktDateTime(WEEKDAY, 19, 45))
  assert('isOvernight = true', s.isOvernight === true)
}

console.log('\nTEST 19: Sesi Pagi (weekend) — tepat_waktu at 08:10')
{
  const s = getSecurityShiftCheckInStatus('Sesi Pagi', WEEKEND, jktDateTime(WEEKEND, 8, 10))
  assert('windowStatus = tepat_waktu for Sesi Pagi', s.windowStatus === 'tepat_waktu', `got ${s.windowStatus}`)
}

console.log('\nTEST 20: Sesi Malam (weekend) — tepat_waktu at 20:10')
{
  const s = getSecurityShiftCheckInStatus('Sesi Malam', WEEKEND, jktDateTime(WEEKEND, 20, 10))
  assert('windowStatus = tepat_waktu for Sesi Malam', s.windowStatus === 'tepat_waktu', `got ${s.windowStatus}`)
}

console.log('\n============================================================')
if (failed === 0) {
  console.log(`🎉 SEMUA ${passed} TES AUTO-SELECT SHIFT BERHASIL!`)
} else {
  console.error(`💥 ${failed} TES GAGAL! (${passed} berhasil)`)
  process.exit(1)
}
console.log('============================================================\n')
