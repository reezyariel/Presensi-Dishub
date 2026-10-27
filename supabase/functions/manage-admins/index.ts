// ============================================================
// Supabase Edge Function: manage-admins (v4 Hardened)
// Manajemen Akun Administrator SIPATEN via Supabase Auth Admin API
// Runtime: Deno / Supabase Edge Functions
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  action?: 'create' | 'update' | 'toggle-status' | 'reset-password' | 'delete' | 'reconcile'
  admin_id?: string
  full_name?: string
  email?: string
  password?: string
  is_active?: boolean
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id.trim())
}

function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false
  const trimmed = email.trim()
  return trimmed.length >= 5 && trimmed.length <= 255 && EMAIL_REGEX.test(trimmed)
}

function sanitizeName(name: unknown): string {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
}

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface AuthUserState {
  status: 'EXISTS' | 'NOT_FOUND' | 'UNKNOWN'
  user?: unknown
  error?: string
}

/**
 * Memeriksa status keberadaan akun di Supabase Auth secara deterministik.
 * Membedakan antara:
 * 1. EXISTS: Akun pasti ada di GoTrue.
 * 2. NOT_FOUND: Akun pasti sudah tidak ada (404).
 * 3. UNKNOWN: Status tidak diketahui akibat timeout, network glitch, atau 5xx.
 */
async function checkAuthUserState(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string
): Promise<AuthUserState> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)

    if (!error && data?.user) {
      return { status: 'EXISTS', user: data.user }
    }

    if (error) {
      const msg = (error.message || '').toLowerCase()
      const httpStatus = (error as { status?: number }).status

      // GoTrue error 404 / user not found
      if (httpStatus === 404 || msg.includes('user not found') || msg.includes('not found')) {
        return { status: 'NOT_FOUND' }
      }

      // Kendala jaringan, timeout, rate-limiting, atau internal server error
      return { status: 'UNKNOWN', error: error.message }
    }

    return { status: 'NOT_FOUND' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'UNKNOWN', error: msg }
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Metode HTTP tidak diizinkan. Gunakan POST.' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({
        success: false,
        error: 'Kredensial server Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) tidak ditemukan di environment.',
      }, 500)
    }

    // Client terpercaya dengan hak Service Role (hanya dieksekusi di server Deno Edge Function)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // 1. Verifikasi Autentikasi Pemanggil dari Header Authorization Bearer
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({
        success: false,
        error: 'Akses ditolak: Header Authorization Bearer diperlukan.',
      }, 401)
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return jsonResponse({
        success: false,
        error: 'Akses ditolak: Token autentikasi kosong.',
      }, 401)
    }

    // Ambil identitas pemanggil dari Supabase Auth secara kriptografis (anti-spoofing)
    // caller_id SELALU diambil dari sesi server, BUKAN dari request body
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !userData?.user) {
      return jsonResponse({
        success: false,
        error: 'Akses ditolak: Sesi login tidak valid atau telah kedaluwarsa.',
      }, 401)
    }

    const callerUser = userData.user
    const callerId = callerUser.id

    if (!isValidUuid(callerId)) {
      return jsonResponse({
        success: false,
        error: 'Akses ditolak: Format identitas akun pemanggil tidak valid.',
      }, 403)
    }

    // 2. Verifikasi Pemanggil adalah Admin Aktif di public.admin_profiles
    // Semua admin berstatus setara (tanpa peran super admin)
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('admin_profiles')
      .select('id, full_name, email, is_active')
      .eq('id', callerId)
      .maybeSingle()

    if (profileErr) {
      return jsonResponse({
        success: false,
        error: `Gagal memverifikasi status admin pemanggil: ${profileErr.message}`,
      }, 500)
    }

    if (!callerProfile) {
      return jsonResponse({
        success: false,
        error: 'Akses ditolak: Akun Anda tidak terdaftar sebagai Administrator.',
      }, 403)
    }

    if (callerProfile.is_active === false) {
      return jsonResponse({
        success: false,
        error: 'Akses ditolak: Akun Administrator Anda telah dinonaktifkan.',
      }, 403)
    }

    // 3. Parsing Request Body
    const body: RequestBody = await req.json().catch(() => ({}))
    const action = body.action

    if (!action) {
      return jsonResponse({
        success: false,
        error: 'Parameter "action" wajib disertakan (create, update, toggle-status, reset-password, delete, reconcile).',
      }, 400)
    }

    // ============================================================
    // ACTION: CREATE
    // ============================================================
    if (action === 'create') {
      const cleanFullName = sanitizeName(body.full_name)
      const cleanEmail = (body.email || '').trim().toLowerCase()
      const rawPassword = typeof body.password === 'string' ? body.password : ''
      const isActive = body.is_active !== false

      if (!cleanFullName || cleanFullName.length < 2 || cleanFullName.length > 150) {
        return jsonResponse({ success: false, error: 'Nama lengkap administrator wajib diisi (antara 2 dan 150 karakter).' }, 400)
      }

      if (!isValidEmail(cleanEmail)) {
        return jsonResponse({ success: false, error: 'Format alamat email tidak valid.' }, 400)
      }

      if (rawPassword.length < 6 || rawPassword.length > 128) {
        return jsonResponse({ success: false, error: 'Kata sandi awal minimal 6 dan maksimal 128 karakter.' }, 400)
      }

      // Periksa apakah email sudah terdaftar di admin_profiles (case-insensitive & whitespace trimmed)
      const { data: existingAdmin, error: checkEmailErr } = await supabaseAdmin
        .from('admin_profiles')
        .select('id')
        .ilike('email', cleanEmail)
        .maybeSingle()

      if (checkEmailErr) {
        return jsonResponse({
          success: false,
          error: `Gagal memeriksa ketersediaan email: ${checkEmailErr.message}`,
        }, 500)
      }

      if (existingAdmin) {
        return jsonResponse({
          success: false,
          error: `Email "${cleanEmail}" sudah terdaftar sebagai Administrator.`,
        }, 400)
      }

      // Buat akun pengguna via Supabase Auth Admin API
      const { data: createdAuth, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: rawPassword,
        email_confirm: true,
        user_metadata: {
          full_name: cleanFullName,
          role: 'admin',
        },
      })

      if (createAuthErr || !createdAuth?.user) {
        const errorMsg = createAuthErr?.message || 'Gagal membuat akun autentikasi pada Supabase Auth.'
        return jsonResponse({ success: false, error: errorMsg }, 400)
      }

      const newAuthUser = createdAuth.user

      // Simpan data profil & catat audit log secara atomik via helper RPC khusus service_role
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('admin_atomic_create_profile', {
        p_caller_id: callerId,
        p_new_admin_id: newAuthUser.id,
        p_full_name: cleanFullName,
        p_email: cleanEmail,
        p_is_active: isActive,
      })

      if (rpcErr || (rpcRes && rpcRes.success === false)) {
        const failMessage = rpcRes?.message || rpcErr?.message || 'Gagal menyimpan profil administrator ke database.'

        // Rollback compensating transaction: Hapus akun auth jika insert profil database gagal
        const { error: deleteRollbackErr } = await supabaseAdmin.auth.admin.deleteUser(newAuthUser.id)
        if (deleteRollbackErr) {
          // Rekam insiden sinkronisasi kritis ke audit log agar tidak hilang jejak
          const { error: incErr } = await supabaseAdmin.rpc('admin_log_sync_incident', {
            p_caller_id: callerId,
            p_action: 'sync_failure_admin_create',
            p_reason: `KRITIS: Insert profil database gagal (${failMessage}) DAN rollback penghapusan akun Auth yatim gagal (${deleteRollbackErr.message}). ID Auth: ${newAuthUser.id}`,
            p_new_values: {
              orphan_auth_id: newAuthUser.id,
              email: cleanEmail,
              create_error: failMessage,
              delete_error: deleteRollbackErr.message,
            },
          }).catch((e: Error) => ({ error: e }))

          const incStatus = incErr ? ` Catatan insiden juga gagal disimpan: ${incErr.message || 'Error'}.` : ' Insiden telah dicatat ke audit log untuk rekonsiliasi.'
          return jsonResponse({
            success: false,
            error: `KRITIS: Profil database gagal disimpan (${failMessage}) DAN akun Auth yatim (${newAuthUser.id}) gagal dihapus (${deleteRollbackErr.message}).${incStatus}`,
          }, 500)
        }

        return jsonResponse({
          success: false,
          error: `${failMessage} (Akun Supabase Auth yang baru dibuat telah dibatalkan/dihapus kembali).`,
        }, 500)
      }

      return jsonResponse({
        success: true,
        data: {
          id: newAuthUser.id,
          email: cleanEmail,
          full_name: cleanFullName,
          is_active: isActive,
        },
        message: `Akun Administrator "${cleanFullName}" berhasil dibuat.`,
      }, 200)
    }

    // ============================================================
    // ACTION: UPDATE
    // ============================================================
    if (action === 'update') {
      const targetId = body.admin_id
      const cleanFullName = sanitizeName(body.full_name)
      const cleanEmail = (body.email || '').trim().toLowerCase()
      const targetActive = body.is_active !== false

      if (!isValidUuid(targetId)) {
        return jsonResponse({ success: false, error: 'Parameter "admin_id" tidak valid (format UUID diperlukan).' }, 400)
      }

      if (!cleanFullName || cleanFullName.length < 2 || cleanFullName.length > 150) {
        return jsonResponse({ success: false, error: 'Nama lengkap administrator tidak boleh kosong (2-150 karakter).' }, 400)
      }

      if (!isValidEmail(cleanEmail)) {
        return jsonResponse({ success: false, error: 'Format alamat email tidak valid.' }, 400)
      }

      // Ambil profil lama target
      const { data: oldProfile, error: oldErr } = await supabaseAdmin
        .from('admin_profiles')
        .select('*')
        .eq('id', targetId)
        .maybeSingle()

      if (oldErr || !oldProfile) {
        return jsonResponse({ success: false, error: 'Data profil administrator tidak ditemukan.' }, 404)
      }

      // Proteksi: Mencegah admin menonaktifkan akunnya sendiri saat sedang login
      if (targetActive === false && targetId === callerId) {
        return jsonResponse({
          success: false,
          error: 'Akses ditolak: Anda tidak dapat menonaktifkan akun Anda sendiri saat sedang masuk.',
        }, 400)
      }

      const emailChanged = cleanEmail !== (oldProfile.email || '').toLowerCase().trim()
      const nameChanged = cleanFullName !== (oldProfile.full_name || '').trim()

      // 1. Sinkronisasi ke Supabase Auth TERLEBIH DAHULU jika ada perubahan email atau metadata
      if (emailChanged || nameChanged) {
        const authUpdates: { email?: string; user_metadata?: Record<string, unknown> } = {}
        if (emailChanged) {
          authUpdates.email = cleanEmail
        }
        authUpdates.user_metadata = {
          full_name: cleanFullName,
          role: 'admin',
        }

        const { error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, authUpdates)
        if (authUpdateErr) {
          return jsonResponse({
            success: false,
            error: `Gagal memperbarui akun autentikasi pada Supabase Auth: ${authUpdateErr.message}`,
          }, 400)
        }
      }

      // 2. Update profil di database via atomic RPC (dengan advisory lock anti-race condition)
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('admin_atomic_update_profile', {
        p_caller_id: callerId,
        p_target_id: targetId,
        p_full_name: cleanFullName,
        p_email: cleanEmail,
        p_is_active: targetActive,
      })

      if (rpcErr || (rpcRes && rpcRes.success === false)) {
        const failMessage = rpcRes?.message || rpcErr?.message || 'Gagal memperbarui profil administrator di database.'

        // Rollback compensating transaction di Supabase Auth jika update database gagal
        if (emailChanged || nameChanged) {
          const { error: rollbackErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
            email: oldProfile.email,
            user_metadata: {
              full_name: oldProfile.full_name,
              role: 'admin',
            },
          })

          if (rollbackErr) {
            // Rollback GAGAL: laporkan secara transparan bahwa data TIDAK SINKRON
            const { error: incErr } = await supabaseAdmin.rpc('admin_log_sync_incident', {
              p_caller_id: callerId,
              p_action: 'sync_failure_admin_update',
              p_reason: `KRITIS: Pembaruan database gagal (${failMessage}) DAN pembatalan pada Supabase Auth juga gagal (${rollbackErr.message}). Akun Auth (${cleanEmail}) dan database (${oldProfile.email}) TIDAK SINKRON.`,
              p_new_values: {
                target_id: targetId,
                auth_email_stuck: cleanEmail,
                db_email_expected: oldProfile.email,
                auth_error: rollbackErr.message,
              },
            }).catch((e: Error) => ({ error: e }))

            const incStatus = incErr ? ` Pencatatan log insiden juga gagal: ${incErr.message || 'Error'}.` : ' Insiden telah dicatat ke log audit.'
            return jsonResponse({
              success: false,
              error: `KRITIS: Pembaruan database gagal (${failMessage}) DAN pembatalan pada Supabase Auth juga gagal (${rollbackErr.message}). Data akun Auth dan database saat ini TIDAK SINKRON.${incStatus} Silakan gunakan fitur Rekonsiliasi.`,
            }, 500)
          }

          // Rollback BERHASIL: nyatakan secara transparan
          return jsonResponse({
            success: false,
            error: `Pembaruan profil database gagal: ${failMessage}. Perubahan pada Supabase Auth telah berhasil dibatalkan kembali ke data awal.`,
          }, 400)
        }

        return jsonResponse({
          success: false,
          error: failMessage,
        }, 400)
      }

      return jsonResponse({
        success: true,
        data: {
          id: targetId,
          full_name: cleanFullName,
          email: cleanEmail,
          is_active: targetActive,
        },
        message: `Data Administrator "${cleanFullName}" berhasil diperbarui.`,
      }, 200)
    }

    // ============================================================
    // ACTION: TOGGLE STATUS
    // ============================================================
    if (action === 'toggle-status') {
      const targetId = body.admin_id
      if (!isValidUuid(targetId)) {
        return jsonResponse({ success: false, error: 'Parameter "admin_id" tidak valid (format UUID diperlukan).' }, 400)
      }

      // Proteksi: Mencegah menonaktifkan akun sendiri
      if (targetId === callerId) {
        return jsonResponse({
          success: false,
          error: 'Akses ditolak: Anda tidak dapat menonaktifkan akun Anda sendiri saat sedang login.',
        }, 400)
      }

      // Eksekusi toggle atomik di database dengan advisory lock (anti-race condition)
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('admin_atomic_toggle_status', {
        p_caller_id: callerId,
        p_target_id: targetId,
      })

      if (rpcErr || (rpcRes && rpcRes.success === false)) {
        const failMessage = rpcRes?.message || rpcErr?.message || 'Gagal mengubah status administrator.'
        return jsonResponse({ success: false, error: failMessage }, 400)
      }

      return jsonResponse({
        success: true,
        is_active: rpcRes.is_active,
        message: rpcRes.message || 'Status administrator berhasil diubah.',
      }, 200)
    }

    // ============================================================
    // ACTION: RESET PASSWORD
    // ============================================================
    if (action === 'reset-password') {
      const targetId = body.admin_id
      const newPassword = typeof body.password === 'string' ? body.password : ''

      if (!isValidUuid(targetId)) {
        return jsonResponse({ success: false, error: 'Parameter "admin_id" tidak valid (format UUID diperlukan).' }, 400)
      }

      if (newPassword.length < 6 || newPassword.length > 128) {
        return jsonResponse({ success: false, error: 'Kata sandi baru minimal 6 dan maksimal 128 karakter.' }, 400)
      }

      const { data: targetProfile, error: targetErr } = await supabaseAdmin
        .from('admin_profiles')
        .select('id, full_name, email')
        .eq('id', targetId)
        .maybeSingle()

      if (targetErr || !targetProfile) {
        return jsonResponse({ success: false, error: 'Data profil administrator tidak ditemukan.' }, 404)
      }

      // Perbarui password langsung via Supabase Auth Admin API
      const { error: resetAuthErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
        password: newPassword,
      })

      if (resetAuthErr) {
        return jsonResponse({
          success: false,
          error: `Gagal mereset kata sandi pada Supabase Auth: ${resetAuthErr.message}`,
        }, 400)
      }

      // Catat audit log peresetan password via helper service_role
      const { error: logErr } = await supabaseAdmin.rpc('admin_log_password_reset', {
        p_caller_id: callerId,
        p_target_id: targetId,
      })

      if (logErr) {
        // Catat kegagalan log ke insiden sinkronisasi agar tidak hilang
        const { error: incErr } = await supabaseAdmin.rpc('admin_log_sync_incident', {
          p_caller_id: callerId,
          p_action: 'sync_failure_reset_password_log',
          p_reason: `Kata sandi berhasil diperbarui di Auth untuk ${targetProfile.full_name}, namun pencatatan audit log reguler gagal (${logErr.message}).`,
          p_new_values: { target_id: targetId, error: logErr.message },
        }).catch((e: Error) => ({ error: e }))

        const incStatus = incErr ? ` Catatan insiden juga gagal disimpan: ${incErr.message || 'Error'}.` : ' Catatan insiden telah disimpan ke sistem audit.'
        return jsonResponse({
          success: false,
          warning: true,
          error: `Kata sandi di Supabase Auth berhasil diperbarui, namun pencatatan riwayat audit reguler mengalami kegagalan (${logErr.message}).${incStatus}`,
        }, 500)
      }

      return jsonResponse({
        success: true,
        message: `Kata sandi login untuk Administrator "${targetProfile.full_name}" berhasil diperbarui.`,
      }, 200)
    }

    // ============================================================
    // ACTION: DELETE (TWO-PHASE DENGAN OPERATION ID PERSISTEN)
    // Melindungi integritas referensi historis attendance_audit_logs & attendance_settings
    // ============================================================
    if (action === 'delete') {
      const targetId = body.admin_id
      if (!isValidUuid(targetId)) {
        return jsonResponse({ success: false, error: 'Parameter "admin_id" tidak valid (format UUID diperlukan).' }, 400)
      }

      // Proteksi: Mencegah admin menghapus akunnya sendiri
      if (targetId === callerId) {
        return jsonResponse({
          success: false,
          error: 'Akses ditolak: Anda tidak dapat menghapus akun Anda sendiri saat sedang masuk.',
        }, 400)
      }

      // 1. Phase 1: Prepare Delete
      //    - Mengambil advisory lock
      //    - Memverifikasi admin aktif terakhir
      //    - Menyimpan rekaman operasi 'pending' dengan operation_id persisten
      //    - Menonaktifkan profil sementara (reservasi)
      //    - TIDAK menyentuh atau men-NULL-kan FK audit log!
      const { data: prepRes, error: prepErr } = await supabaseAdmin.rpc('admin_atomic_prepare_delete', {
        p_caller_id: callerId,
        p_target_id: targetId,
      })

      if (prepErr || (prepRes && prepRes.success === false)) {
        const failMessage = prepRes?.message || prepErr?.message || 'Gagal mempersiapkan penghapusan administrator.'
        return jsonResponse({ success: false, error: failMessage }, 400)
      }

      const operationId = prepRes.operation_id
      const targetFullName = prepRes.full_name || 'Administrator'

      if (!isValidUuid(operationId)) {
        return jsonResponse({
          success: false,
          error: 'Respons database tidak valid: ID operasi penghapusan tidak ditemukan.',
        }, 500)
      }

      // 2. Hapus akun dari Supabase Auth via Auth Admin API
      const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(targetId)

      // 3. Evaluasi status autentikasi sebenarnya (menghindari salah tafsir atas timeout / network glitch)
      let authState: AuthUserState
      if (!deleteAuthErr) {
        authState = { status: 'NOT_FOUND' }
      } else {
        authState = await checkAuthUserState(supabaseAdmin, targetId)
      }

      // KASUS 3A: Auth user MASIH ADA (penghapusan pasti gagal di Auth)
      if (authState.status === 'EXISTS') {
        const { error: cancelErr } = await supabaseAdmin.rpc('admin_atomic_cancel_delete', {
          p_caller_id: callerId,
          p_operation_id: operationId,
          p_error_reason: deleteAuthErr?.message || 'Penghapusan pada Supabase Auth gagal',
          p_target_id: targetId,
        })

        if (cancelErr) {
          const { error: incErr } = await supabaseAdmin.rpc('admin_log_sync_incident', {
            p_caller_id: callerId,
            p_action: 'sync_failure_admin_delete_cancel',
            p_reason: `KRITIS: Penghapusan Auth gagal (${deleteAuthErr?.message}) DAN pemulihan pembatalan database gagal (${cancelErr.message}). ID Admin: ${targetId}, ID Operasi: ${operationId}`,
            p_new_values: { target_id: targetId, operation_id: operationId, auth_error: deleteAuthErr?.message, cancel_error: cancelErr.message },
          }).catch((e: Error) => ({ error: e }))

          const incStatus = incErr ? ` Log insiden juga gagal dicatat: ${incErr.message || 'Error'}.` : ' Insiden telah dicatat ke log audit.'
          return jsonResponse({
            success: false,
            error: `KRITIS: Akun Auth gagal dihapus (${deleteAuthErr?.message}) dan pembatalan status database mengalami kendala (${cancelErr.message}).${incStatus}`,
          }, 500)
        }

        return jsonResponse({
          success: false,
          error: `Gagal menghapus akun pada Supabase Auth (${deleteAuthErr?.message}). Penghapusan dibatalkan dan seluruh riwayat audit historis tetap utuh.`,
        }, 500)
      }

      // KASUS 3B: Status Auth TIDAK DAPAT DIPASTIKAN (karena timeout / gangguan koneksi / 5xx)
      // JANGAN BATALKAN DAN JANGAN FINALISASI! Tahan status sementara dan catat untuk rekonsiliasi.
      if (authState.status === 'UNKNOWN') {
        await supabaseAdmin.rpc('admin_log_sync_incident', {
          p_caller_id: callerId,
          p_action: 'sync_failure_admin_delete_ambiguous',
          p_reason: `Status penghapusan Auth ambigu akibat kendala jaringan/server (${authState.error || deleteAuthErr?.message}). Operasi (ID: ${operationId}) tetap pending untuk rekonsiliasi aman.`,
          p_new_values: { target_id: targetId, operation_id: operationId, error: authState.error || deleteAuthErr?.message },
        }).catch(() => {})

        return jsonResponse({
          success: false,
          partial_failure: true,
          operation_id: operationId,
          error: `Status penghapusan pada Supabase Auth belum dapat dipastikan akibat kendala jaringan atau server (${authState.error || deleteAuthErr?.message}). Akun dinonaktifkan sementara dan operasi dicatat (ID: ${operationId}). Silakan gunakan fitur Rekonsiliasi setelah koneksi stabil.`,
        }, 502)
      }

      // KASUS 3C: Auth user PASTI SUDAH TERHAPUS (authState.status === 'NOT_FOUND')
      // Lanjutkan ke Phase 2B: Finalize Delete
      const { data: finRes, error: finErr } = await supabaseAdmin.rpc('admin_atomic_finalize_delete', {
        p_caller_id: callerId,
        p_operation_id: operationId,
        p_target_id: targetId,
      })

      if (finErr || (finRes && finRes.success === false)) {
        const failMessage = finRes?.message || finErr?.message || 'Akun Auth telah dihapus, namun finalisasi penghapusan database mengalami kendala.'

        const { error: incErr } = await supabaseAdmin.rpc('admin_log_sync_incident', {
          p_caller_id: callerId,
          p_action: 'sync_failure_admin_finalize_delete',
          p_reason: `Akun Auth berhasil dihapus, namun finalisasi profil database gagal (${failMessage}). ID Admin: ${targetId}, ID Operasi: ${operationId}`,
          p_new_values: { target_id: targetId, operation_id: operationId, error: failMessage },
        }).catch((e: Error) => ({ error: e }))

        const incStatus = incErr ? ` Pencatatan log insiden juga gagal: ${incErr.message || 'Error'}.` : ' Insiden telah dicatat ke log audit.'
        return jsonResponse({
          success: false,
          partial_failure: true,
          operation_id: operationId,
          error: `Perhatian: Akun autentikasi telah dihapus, namun finalisasi database gagal (${failMessage}).${incStatus} Jalankan tombol Rekonsiliasi untuk menuntaskan pembersihan data.`,
        }, 500)
      }

      return jsonResponse({
        success: true,
        operation_id: operationId,
        message: `Akun Administrator "${targetFullName}" berhasil dihapus dari sistem.`,
      }, 200)
    }

    // ============================================================
    // ACTION: RECONCILE (REKONSILIASI KONSISTENSI AUTH & DATABASE)
    // Menangani operasi delete gantung, status ambigu, dan ketidaksinkronan email
    // ============================================================
    if (action === 'reconcile') {
      const issues: Array<{ id?: string; email?: string; issue: string; status: 'resolved' | 'warning' | 'info' }> = []
      let reconciledCount = 0

      // 1. Rekonsiliasi Operasi Penghapusan Dua Fase yang Menggantung (status = 'pending')
      const { data: pendingOps, error: pendingOpsErr } = await supabaseAdmin
        .from('admin_deletion_operations')
        .select('*')
        .eq('status', 'pending')

      if (!pendingOpsErr && pendingOps && pendingOps.length > 0) {
        for (const op of pendingOps) {
          const authState = await checkAuthUserState(supabaseAdmin, op.target_admin_id)

          if (authState.status === 'NOT_FOUND') {
            // Kasus A: Akun Auth terbukti SUDAH terhapus -> Finalisasi database
            const { data: finRes, error: finErr } = await supabaseAdmin.rpc('admin_atomic_finalize_delete', {
              p_caller_id: callerId,
              p_operation_id: op.id,
              p_target_id: op.target_admin_id,
            })

            if (!finErr && finRes?.success !== false) {
              reconciledCount++
              issues.push({
                id: op.target_admin_id,
                email: op.target_email || '-',
                issue: `Operasi penghapusan gantung untuk "${op.target_full_name}" berhasil difinalisasi (akun Auth terkonfirmasi telah dihapus).`,
                status: 'resolved',
              })
            } else {
              issues.push({
                id: op.target_admin_id,
                email: op.target_email || '-',
                issue: `Gagal menyelesaikan finalisasi gantung untuk "${op.target_full_name}": ${finErr?.message || finRes?.message}`,
                status: 'warning',
              })
            }
          } else if (authState.status === 'EXISTS') {
            // Kasus B: Akun Auth terbukti MASIH ADA -> Batalkan operasi dan pulihkan status awal
            const { data: cancelRes, error: cancelErr } = await supabaseAdmin.rpc('admin_atomic_cancel_delete', {
              p_caller_id: callerId,
              p_operation_id: op.id,
              p_error_reason: 'Rekonsiliasi: Dibatalkan karena operasi delete gantung dan akun Auth terkonfirmasi masih aktif.',
              p_target_id: op.target_admin_id,
            })

            if (!cancelErr && cancelRes?.success !== false) {
              reconciledCount++
              issues.push({
                id: op.target_admin_id,
                email: op.target_email || '-',
                issue: `Operasi penghapusan gantung untuk "${op.target_full_name}" berhasil dibatalkan dan status akun dipulihkan (akun Auth terkonfirmasi masih aktif).`,
                status: 'resolved',
              })
            } else {
              issues.push({
                id: op.target_admin_id,
                email: op.target_email || '-',
                issue: `Gagal membatalkan operasi delete gantung untuk "${op.target_full_name}": ${cancelErr?.message || cancelRes?.message}`,
                status: 'warning',
              })
            }
          } else {
            // Kasus C: Status Auth UNKNOWN (jaringan / server timeout)
            // JANGAN lakukan mutasi apapun agar tidak terjadi split-brain!
            issues.push({
              id: op.target_admin_id,
              email: op.target_email || '-',
              issue: `Status akun Supabase Auth untuk "${op.target_full_name}" belum dapat dipastikan (${authState.error || 'Timeout/Gangguan Server'}). Rekonsiliasi operasi ini ditunda untuk mencegah ketidaksinkronan data.`,
              status: 'warning',
            })
          }
        }
      }

      // 2. Periksa Konsistensi Semua Profil Database dengan Supabase Auth
      const { data: dbProfiles, error: fetchErr } = await supabaseAdmin
        .from('admin_profiles')
        .select('*')

      if (fetchErr) {
        return jsonResponse({ success: false, error: `Gagal membaca profil database: ${fetchErr.message}` }, 500)
      }

      for (const prof of dbProfiles || []) {
        const authState = await checkAuthUserState(supabaseAdmin, prof.id)

        if (authState.status === 'NOT_FOUND') {
          issues.push({
            id: prof.id,
            email: prof.email || '-',
            issue: `Profil "${prof.full_name}" (${prof.email || prof.id}) ada di database namun tidak ditemukan di Supabase Auth.`,
            status: 'warning',
          })
          continue
        }

        if (authState.status === 'EXISTS' && authState.user) {
          const authUser = authState.user as { email?: string }
          const authEmail = (authUser.email || '').toLowerCase().trim()
          const dbEmail = (prof.email || '').toLowerCase().trim()

          if (authEmail && dbEmail && authEmail !== dbEmail) {
            // Sinkronisasikan email database agar cocok dengan Auth
            const { error: syncEmailErr } = await supabaseAdmin
              .from('admin_profiles')
              .update({ email: authEmail, updated_at: new Date().toISOString() })
              .eq('id', prof.id)

            if (!syncEmailErr) {
              reconciledCount++
              issues.push({
                id: prof.id,
                email: dbEmail,
                issue: `Email database untuk "${prof.full_name}" diselaraskan dari "${dbEmail}" menjadi "${authEmail}".`,
                status: 'resolved',
              })
            }
          }
        }
      }

      return jsonResponse({
        success: true,
        total_checked: (dbProfiles || []).length,
        reconciled_count: reconciledCount,
        issues,
        message: `Rekonsiliasi selesai. Diperiksa: ${(dbProfiles || []).length} admin, diselaraskan: ${reconciledCount} masalah.${issues.length > 0 ? ` Ditemukan ${issues.length} catatan.` : ''}`,
      }, 200)
    }

    return jsonResponse({
      success: false,
      error: `Aksi "${action}" tidak dikenali.`,
    }, 400)

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan internal pada server Edge Function.'
    return jsonResponse({ success: false, error: errorMsg }, 500)
  }
})
