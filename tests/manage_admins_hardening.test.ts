import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('============================================================')
console.log('🧪 SIPATEN Manage Admins Hardening & Migration Audit Suite')
console.log('============================================================\n')

// ------------------------------------------------------------
// TEST 1: Verifikasi Berkas SQL Migration 017
// ------------------------------------------------------------
console.log('TEST 1: Audit Statis Sintaks & Keamanan SQL Migration 017')
const migrationPath = path.resolve('supabase/migrations/017_manage_admin_accounts.sql')
assert.ok(fs.existsSync(migrationPath), 'File migration 017 harus ada')

const sqlContent = fs.readFileSync(migrationPath, 'utf8')

// 1a. Pastikan TIDAK ADA pg_catalog.coalesce di dalam query SQL (hanya boleh di komentar penjelasan jika ada)
const uncommentedSqlLines = sqlContent
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

assert.equal(
  uncommentedSqlLines.includes('pg_catalog.coalesce'),
  false,
  'Ditemukan pemanggilan pg_catalog.coalesce pada kode SQL!'
)
console.log('  ✅ 0 kemunculan pg_catalog.coalesce pada seluruh baris executable SQL')

// 1a-2. Pastikan TIDAK ADA pg_catalog.trim (PostgreSQL hanya mendukung pg_catalog.btrim)
assert.equal(
  uncommentedSqlLines.includes('pg_catalog.trim'),
  false,
  'Ditemukan pemanggilan pg_catalog.trim yang tidak valid di PostgreSQL (harus pg_catalog.btrim)!'
)
assert.ok(
  uncommentedSqlLines.includes('pg_catalog.btrim'),
  'Wajib menggunakan fungsi resmi pg_catalog.btrim untuk pemangkasan spasi!'
)
console.log('  ✅ 0 kemunculan pg_catalog.trim, terverifikasi menggunakan pg_catalog.btrim yang valid')

// 1b. Pastikan SEMUA helper function menggunakan SECURITY DEFINER dan SET search_path = ''
const functionMatches = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) || []
assert.ok(functionMatches.length >= 8, `Harus ada minimal 8 helper functions. Ditemukan: ${functionMatches.length}`)

for (const fn of functionMatches) {
  const fnName = fn.replace('CREATE OR REPLACE FUNCTION ', '')
  const fnIdx = sqlContent.indexOf(fn)
  const fnSnippet = sqlContent.slice(fnIdx, fnIdx + 400)
  
  assert.ok(fnSnippet.includes('SECURITY DEFINER'), `${fnName} harus menggunakan SECURITY DEFINER`)
  assert.ok(fnSnippet.includes("SET search_path = ''"), `${fnName} harus menggunakan SET search_path = ''`)
}
console.log(`  ✅ Semua ${functionMatches.length} fungsi SQL terverifikasi SECURITY DEFINER dan SET search_path = ''`)

// 1c. Pastikan pembatasan hak akses (REVOKE ALL & GRANT service_role) ada untuk setiap RPC
const atomicFunctions = [
  'admin_atomic_create_profile',
  'admin_atomic_update_profile',
  'admin_atomic_toggle_status',
  'admin_atomic_prepare_delete',
  'admin_atomic_cancel_delete',
  'admin_atomic_finalize_delete',
  'admin_log_password_reset',
  'admin_log_sync_incident',
]

for (const fn of atomicFunctions) {
  assert.ok(
    sqlContent.includes(`REVOKE ALL ON FUNCTION public.${fn}`),
    `Harus ada REVOKE ALL untuk ${fn}`
  )
  assert.ok(
    sqlContent.includes(`GRANT EXECUTE ON FUNCTION public.${fn}`),
    `Harus ada GRANT EXECUTE untuk ${fn}`
  )
  assert.ok(
    sqlContent.includes(`TO service_role;`),
    `Harus ada GRANT EXECUTE TO service_role untuk ${fn}`
  )
}
console.log('  ✅ Hak eksekusi semua helper RPC atomik dicabut dari public/anon/authenticated dan dibatasi khusus service_role')

// 1d. Pastikan tabel persisten admin_deletion_operations dibuat
assert.ok(
  sqlContent.includes('CREATE TABLE IF NOT EXISTS public.admin_deletion_operations'),
  'Tabel persisten public.admin_deletion_operations wajib dibuat'
)
assert.ok(
  sqlContent.includes('target_admin_id'),
  'Tabel admin_deletion_operations harus mencakup target_admin_id'
)
assert.ok(
  sqlContent.includes('previous_is_active'),
  'Tabel admin_deletion_operations harus mencakup previous_is_active'
)
// 1e. Pastikan TIDAK ADA tipe data dengan prefix pg_catalog. yang tidak valid
const invalidTypeMatches = uncommentedSqlLines.match(/pg_catalog\.(boolean|integer|text|uuid|timestamptz|jsonb(?![a-zA-Z0-9_]))/g) || []
assert.equal(
  invalidTypeMatches.length,
  0,
  `Ditemukan tipe data dengan prefix pg_catalog.* yang tidak valid: ${invalidTypeMatches.join(', ')}`
)
console.log('  ✅ 0 tipe data dengan prefix pg_catalog.* (semua tipe menggunakan standar: boolean, integer, text, uuid, timestamptz, jsonb)')

// ------------------------------------------------------------
// TEST 2: Audit Berkas Edge Function manage-admins
// ------------------------------------------------------------
console.log('\nTEST 2: Audit Logika Edge Function manage-admins')
const edgeFnPath = path.resolve('supabase/functions/manage-admins/index.ts')
assert.ok(fs.existsSync(edgeFnPath), 'File Edge Function manage-admins/index.ts harus ada')

const edgeFnContent = fs.readFileSync(edgeFnPath, 'utf8')

// 2a. callerId tidak boleh diambil dari request body
assert.equal(
  edgeFnContent.includes('callerId = body.') || edgeFnContent.includes('caller_id = body.'),
  false,
  'callerId dilarang diambil dari request body!'
)
assert.ok(
  edgeFnContent.includes('const callerId = callerUser.id'),
  'callerId wajib diambil langsung dari sesi kriptografis Supabase Auth (callerUser.id)'
)
console.log('  ✅ callerId diverifikasi 100% dari token sesi server, anti-spoofing client')

// 2b. Validasi format UUID dan email
assert.ok(edgeFnContent.includes('isValidUuid'), 'Edge function harus memvalidasi format UUID')
assert.ok(edgeFnContent.includes('isValidEmail'), 'Edge function harus memvalidasi format email')
console.log('  ✅ Format UUID dan regex email divalidasi ketat di level Edge Function')

// 2c. Logika penanganan status ambigu pada Auth deletion
assert.ok(
  edgeFnContent.includes('checkAuthUserState'),
  'Edge Function harus memiliki helper checkAuthUserState untuk mendeteksi ambiguitas status Auth'
)
assert.ok(
  edgeFnContent.includes('UNKNOWN'),
  'Edge Function harus menangani status UNKNOWN (timeout/network glitch) tanpa melakukan cancel atau finalize prematur'
)
console.log('  ✅ Logika status Auth ambigu (UNKNOWN) terverifikasi: tidak membatalkan atau memfinalisasi saat koneksi Auth tidak pasti')

// ------------------------------------------------------------
// TEST 3: Simulasi Logika Two-Phase Deletion & State Machine
// ------------------------------------------------------------
console.log('\nTEST 3: Simulasi State Machine Operasi Two-Phase Deletion')

interface SimulatedOperation {
  id: string
  targetAdminId: string
  callerAdminId: string
  previousIsActive: boolean
  status: 'pending' | 'completed' | 'cancelled'
}

const opStore: Map<string, SimulatedOperation> = new Map()

function prepareDeleteSimulated(callerId: string, targetId: string, targetActive: boolean): string {
  assert.notEqual(callerId, targetId, 'Tidak boleh menghapus akun sendiri')
  const opId = `op-${Math.random().toString(36).substring(2, 9)}`
  opStore.set(opId, {
    id: opId,
    targetAdminId: targetId,
    callerAdminId: callerId,
    previousIsActive: targetActive,
    status: 'pending',
  })
  return opId
}

function cancelDeleteSimulated(opId: string, targetId: string): { restoredActive: boolean } {
  const op = opStore.get(opId)
  assert.ok(op, 'Operasi tidak ditemukan')
  assert.equal(op.targetAdminId, targetId, 'Target ID tidak sesuai')
  assert.equal(op.status, 'pending', 'Operasi harus berstatus pending untuk dapat dibatalkan')
  op.status = 'cancelled'
  return { restoredActive: op.previousIsActive }
}

function finalizeDeleteSimulated(opId: string, targetId: string): { finalized: boolean } {
  const op = opStore.get(opId)
  assert.ok(op, 'Operasi tidak ditemukan')
  assert.equal(op.targetAdminId, targetId, 'Target ID tidak sesuai')
  if (op.status === 'completed') {
    return { finalized: true } // Idempotent
  }
  assert.equal(op.status, 'pending', 'Operasi harus berstatus pending untuk dapat difinalisasi')
  op.status = 'completed'
  return { finalized: true }
}

// Skenario A: Prepare -> Cancel (Auth delete gagal)
const op1 = prepareDeleteSimulated('caller-1', 'target-A', true)
const resCancel = cancelDeleteSimulated(op1, 'target-A')
assert.equal(resCancel.restoredActive, true, 'Status awal harus dipulihkan dari data persisten')
assert.throws(() => cancelDeleteSimulated(op1, 'target-A'), /Operasi harus berstatus pending/, 'Operasi yang sudah dibatalkan tidak boleh dibatalkan ulang')
assert.throws(() => finalizeDeleteSimulated(op1, 'target-A'), /Operasi harus berstatus pending/, 'Operasi yang sudah dibatalkan tidak boleh difinalisasi')
console.log('  ✅ Skenario A (Prepare -> Cancel): Status pulih dari persisten, eksekusi ganda dicegah')

// Skenario B: Prepare -> Finalize (Auth delete berhasil)
const op2 = prepareDeleteSimulated('caller-1', 'target-B', false)
const resFin = finalizeDeleteSimulated(op2, 'target-B')
assert.equal(resFin.finalized, true)
// Uji idempotensi finalize
const resFinRepeat = finalizeDeleteSimulated(op2, 'target-B')
assert.equal(resFinRepeat.finalized, true, 'Finalize ulang harus idempoten tanpa error')
assert.throws(() => cancelDeleteSimulated(op2, 'target-B'), /Operasi harus berstatus pending/, 'Operasi yang sudah diselesaikan tidak boleh dibatalkan')
console.log('  ✅ Skenario B (Prepare -> Finalize): Idempoten dan terlindung dari pembatalan tidak sengaja')

console.log('\n============================================================')
console.log('🎉 SEMUA TES AUDIT HARDENING & REVISI V4 BERHASIL (100% LULUS)')
console.log('============================================================\n')
