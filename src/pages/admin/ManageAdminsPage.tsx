// ============================================================
// SIPATEN — Halaman Kelola Administrator
// Manajemen Akun, Profil, Autentikasi, dan Hak Akses Admin
// ============================================================

import React, { useEffect, useState, useMemo } from 'react'
import {
  ShieldCheck,
  UserPlus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  X,
  KeyRound,
  Copy,
  Check,
  Eye,
  EyeOff,
  User,
  Mail,
  Calendar,
  Lock,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { AdminProfile } from '../../types/attendance'
import { cn } from '../../lib/utils'
import { formatJakartaDateTime } from '../../lib/scheduleEngine'
import StatCard from '../../components/admin/StatCard'

interface CreatedAdminCredentials {
  fullName: string
  email: string
  password: string
}

export default function ManageAdminsPage() {
  const { user, profile: currentProfile } = useAuth()
  const [admins, setAdmins] = useState<AdminProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL')

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<AdminProfile | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Form Fields
  const [formFullName, setFormFullName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formIsActive, setFormIsActive] = useState(true)

  // Credentials Modal for newly created admin
  const [createdCredentials, setCreatedCredentials] = useState<CreatedAdminCredentials | null>(null)
  const [copiedSuccess, setCopiedSuccess] = useState(false)

  // Reset Password Modal State
  const [resetModalAdmin, setResetModalAdmin] = useState<AdminProfile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<AdminProfile | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Reconciliation state
  const [isReconciling, setIsReconciling] = useState(false)

  useEffect(() => {
    fetchAdmins()
  }, [])

  async function handleReconcile() {
    setIsReconciling(true)
    setErrorMsg(null)
    setSuccessBanner(null)
    try {
      const res = await callManageAdminsApi({ action: 'reconcile' })
      setSuccessBanner(res?.message || 'Rekonsiliasi data administrator selesai.')
      setTimeout(() => setSuccessBanner(null), 5000)
      await fetchAdmins()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menjalankan rekonsiliasi data.'
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(null), 6000)
    } finally {
      setIsReconciling(false)
    }
  }

  async function fetchAdmins() {
    setIsLoading(true)
    setErrorMsg(null)

    try {
      const { data, error } = await supabase
        .from('admin_profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const rawList = (data as AdminProfile[]) || []
      // Fallback for current user email if column was null before migration
      const enriched = rawList.map((adm) => {
        if (!adm.email && user && adm.id === user.id) {
          return { ...adm, email: user.email || '' }
        }
        return adm
      })

      setAdmins(enriched)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat daftar administrator.'
      setErrorMsg(msg)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate statistics
  const totalAdmins = admins.length
  const activeAdmins = admins.filter((a) => a.is_active !== false).length
  const inactiveAdmins = admins.filter((a) => a.is_active === false).length

  function openAddModal() {
    setEditingAdmin(null)
    setFormFullName('')
    setFormEmail('')
    setFormPassword('')
    setShowPassword(false)
    setFormIsActive(true)
    setFormError(null)
    setIsModalOpen(true)
  }

  function openEditModal(adm: AdminProfile) {
    setEditingAdmin(adm)
    setFormFullName(adm.full_name)
    setFormEmail(adm.email || '')
    setFormPassword('')
    setFormIsActive(adm.is_active !== false)
    setFormError(null)
    setIsModalOpen(true)
  }

  /**
   * Helper untuk memanggil Supabase Edge Function 'manage-admins' secara aman.
   * Menangani parsing error HTTP, status relay gateway, dan JSON response secara akurat.
   * Menjamin tidak ada pesan sukses yang muncul jika operasi gagal serta memberikan
   * pesan diagnostik yang aman dan informatif jika fungsi belum di-deploy.
   */
  async function callManageAdminsApi(payload: Record<string, unknown>) {
    let res: { data: unknown; error: unknown }
    try {
      res = await supabase.functions.invoke('manage-admins', {
        body: payload,
      })
    } catch (invokeErr: unknown) {
      const invokeMsg = invokeErr instanceof Error ? invokeErr.message : String(invokeErr)
      throw new Error(
        `Gagal menghubungi Edge Function 'manage-admins': ${invokeMsg}. Pastikan fungsi telah di-deploy ke Supabase.`
      )
    }

    const { data, error: fnError } = res as {
      data: { success?: boolean; error?: string; message?: string; warning?: boolean; [key: string]: unknown } | null
      error: { name?: string; message?: string; context?: unknown } | null
    }

    if (fnError) {
      let resolvedMsg = fnError.message || 'Terjadi kesalahan saat menghubungi server Edge Function.'
      let httpStatus: number | null = null

      try {
        if (fnError.context && typeof fnError.context === 'object') {
          const ctx = fnError.context as {
            status?: number
            json?: () => Promise<{ error?: string; message?: string; code?: string }>
            text?: () => Promise<string>
          }
          if (typeof ctx.status === 'number') {
            httpStatus = ctx.status
          }
          if (typeof ctx.json === 'function') {
            const bodyJson = await ctx.json().catch(() => null)
            if (bodyJson) {
              if (bodyJson.error) {
                resolvedMsg = bodyJson.error
              } else if (bodyJson.message) {
                resolvedMsg = bodyJson.message
              }
            }
          } else if (typeof ctx.text === 'function') {
            const bodyText = await ctx.text().catch(() => '')
            if (bodyText && bodyText.length < 200) {
              resolvedMsg = bodyText
            }
          }
        }
      } catch {
        // Abaikan kegagalan ekstraksi context
      }

      // Deteksi kegagalan jaringan atau Edge Function belum di-deploy (404 NOT_FOUND / FunctionsFetchError)
      if (
        httpStatus === 404 ||
        resolvedMsg.includes('Requested function was not found') ||
        resolvedMsg.includes('Failed to send a request to the Edge Function') ||
        fnError.name === 'FunctionsFetchError'
      ) {
        resolvedMsg =
          "Server Edge Function 'manage-admins' belum aktif atau belum di-deploy ke Supabase (404 / Fetch Error). " +
          "Silakan deploy fungsi terlebih dahulu via terminal proyek: 'npx supabase functions deploy manage-admins --no-verify-jwt'."
      }

      throw new Error(resolvedMsg)
    }

    if (!data) {
      throw new Error('Respons tidak valid dari server Edge Function.')
    }

    if (data.success === false) {
      throw new Error(data.error || data.message || 'Operasi gagal diproses.')
    }

    return data
  }

  async function handleSaveAdmin(e: React.FormEvent) {
    e.preventDefault()

    const cleanName = formFullName.trim().replace(/\s+/g, ' ')
    const cleanEmail = formEmail.trim().toLowerCase()

    if (!cleanName) {
      setFormError('Nama lengkap administrator wajib diisi.')
      return
    }

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setFormError('Alamat email tidak valid.')
      return
    }

    if (!editingAdmin) {
      if (!formPassword || formPassword.length < 6) {
        setFormError('Kata sandi awal minimal 6 karakter.')
        return
      }
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      if (editingAdmin) {
        // Edit existing admin via Supabase Edge Function
        const res = await callManageAdminsApi({
          action: 'update',
          admin_id: editingAdmin.id,
          full_name: cleanName,
          email: cleanEmail,
          is_active: formIsActive,
        })

        setSuccessBanner(res?.message || `Data administrator "${cleanName}" berhasil diperbarui.`)
        setTimeout(() => setSuccessBanner(null), 4000)
        setIsModalOpen(false)
        await fetchAdmins()
      } else {
        // Create new admin account via Supabase Edge Function
        await callManageAdminsApi({
          action: 'create',
          full_name: cleanName,
          email: cleanEmail,
          password: formPassword,
          is_active: formIsActive,
        })

        // Store credentials to show copy modal
        setCreatedCredentials({
          fullName: cleanName,
          email: cleanEmail,
          password: formPassword,
        })

        setIsModalOpen(false)
        await fetchAdmins()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan data administrator.'
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(adm: AdminProfile) {
    if (user && adm.id === user.id) {
      setErrorMsg('Anda tidak dapat menonaktifkan akun Anda sendiri saat sedang login.')
      setTimeout(() => setErrorMsg(null), 4000)
      return
    }

    const currentActive = adm.is_active !== false
    if (currentActive && activeAdmins <= 1) {
      setErrorMsg('Akses ditolak: Minimal harus ada satu Administrator yang aktif di sistem.')
      setTimeout(() => setErrorMsg(null), 4000)
      return
    }

    try {
      const res = await callManageAdminsApi({
        action: 'toggle-status',
        admin_id: adm.id,
      })

      setSuccessBanner(res?.message || `Status administrator "${adm.full_name}" berhasil diubah.`)
      setTimeout(() => setSuccessBanner(null), 4000)
      await fetchAdmins()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status.'
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(null), 5000)
    }
  }

  function openResetModal(adm: AdminProfile) {
    setResetModalAdmin(adm)
    setNewPassword('')
    setShowResetPassword(false)
    setResetError(null)
  }

  async function handleResetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!resetModalAdmin) return

    if (!newPassword || newPassword.length < 6) {
      setResetError('Kata sandi baru minimal 6 karakter.')
      return
    }

    setIsResetting(true)
    setResetError(null)

    try {
      const res = await callManageAdminsApi({
        action: 'reset-password',
        admin_id: resetModalAdmin.id,
        password: newPassword,
      })

      if (res?.warning) {
        setErrorMsg(res?.error || res?.message || 'Kata sandi berhasil diperbarui, namun pencatatan riwayat audit mengalami kendala.')
      } else {
        setSuccessBanner(res?.message || `Kata sandi login untuk "${resetModalAdmin.full_name}" berhasil diperbarui.`)
        setTimeout(() => setSuccessBanner(null), 5000)
      }
      setResetModalAdmin(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mereset kata sandi.'
      setResetError(msg)
    } finally {
      setIsResetting(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return

    if (user && deleteTarget.id === user.id) {
      setErrorMsg('Anda tidak dapat menghapus akun Anda sendiri saat sedang masuk.')
      setDeleteTarget(null)
      return
    }

    if (activeAdmins <= 1 && deleteTarget.is_active !== false) {
      setErrorMsg('Akses ditolak: Minimal harus ada satu Administrator aktif di sistem.')
      setDeleteTarget(null)
      return
    }

    setIsDeleting(true)

    try {
      const res = await callManageAdminsApi({
        action: 'delete',
        admin_id: deleteTarget.id,
      })

      setSuccessBanner(res?.message || `Administrator "${deleteTarget.full_name}" berhasil dihapus.`)
      setTimeout(() => setSuccessBanner(null), 5000)
      setDeleteTarget(null)
      await fetchAdmins()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus administrator.'
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(null), 5000)
    } finally {
      setIsDeleting(false)
    }
  }

  function copyCredentialsToClipboard() {
    if (!createdCredentials) return
    const text = `[SIPATEN — Kredensial Administrator Baru]\nNama: ${createdCredentials.fullName}\nEmail Login: ${createdCredentials.email}\nKata Sandi: ${createdCredentials.password}\nRole: Administrator\nPortal Login: ${window.location.origin}/login\n\nHarap simpan data ini di tempat yang aman.`
    navigator.clipboard.writeText(text)
    setCopiedSuccess(true)
    setTimeout(() => setCopiedSuccess(false), 2500)
  }

  // Filtered admin records
  const filteredAdmins = useMemo(() => {
    return admins.filter((adm) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const matchName = adm.full_name.toLowerCase().includes(query)
        const matchEmail = (adm.email || '').toLowerCase().includes(query)
        if (!matchName && !matchEmail) return false
      }
      if (statusFilter === 'active' && adm.is_active === false) return false
      if (statusFilter === 'inactive' && adm.is_active !== false) return false
      return true
    })
  }, [admins, searchQuery, statusFilter])

  return (
    <div className="space-y-6 animate-fade-in w-full pb-10">
      {/* ─── Header Card ─── */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">
            <span>Sistem & Konfigurasi</span>
            <span>/</span>
            <span className="text-neutral-900 font-bold">Kelola Admin</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
                Kelola Administrator
              </h1>
              <p className="text-xs text-neutral-500 mt-0.5">
                Manajemen akun, profil, dan hak akses pengelolaan sistem SIPATEN
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleReconcile}
            disabled={isReconciling || isLoading}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 rounded-xl border border-neutral-200 text-xs font-medium transition-colors disabled:opacity-50"
            title="Periksa dan selaraskan konsistensi data akun Auth & Database"
          >
            <RefreshCw size={14} className={cn(isReconciling && 'animate-spin text-neutral-900')} />
            <span className="hidden sm:inline">{isReconciling ? 'Menyelaraskan...' : 'Rekonsiliasi'}</span>
          </button>
          <button
            type="button"
            onClick={fetchAdmins}
            disabled={isLoading}
            className="p-2.5 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 rounded-xl border border-neutral-200 transition-colors disabled:opacity-50"
            title="Muat ulang data"
          >
            <RefreshCw size={15} className={cn(isLoading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <UserPlus size={15} />
            <span>Tambah Admin</span>
          </button>
        </div>
      </div>

      {/* ─── Feedback Banners ─── */}
      {successBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-800 flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-800 flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-600 hover:text-rose-800"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ─── Summary Stat Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Administrator"
          value={totalAdmins}
          icon={ShieldCheck}
          subtitle="Akun pengelola terdaftar"
        />
        <StatCard
          title="Admin Aktif"
          value={activeAdmins}
          icon={CheckCircle2}
          subtitle="Dapat login & kelola data"
        />
        <StatCard
          title="Admin Nonaktif"
          value={inactiveAdmins}
          icon={XCircle}
          subtitle="Akses dinonaktifkan"
        />
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 flex flex-col justify-between shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-start justify-between">
            <div className="overflow-hidden pr-2">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Akun Anda Saat Ini
              </p>
              <p className="text-sm font-bold text-neutral-900 mt-1 truncate">
                {currentProfile?.full_name || 'Administrator'}
              </p>
              <p className="text-xs text-neutral-500 font-mono truncate mt-0.5">
                {currentProfile?.email || user?.email || 'admin@sipaten'}
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
              <User size={18} />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Sesi Sedang Aktif
            </span>
          </div>
        </div>
      </div>

      {/* ─── Search & Filter Toolbar ─── */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Cari administrator berdasarkan nama atau email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              statusFilter === 'ALL'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            )}
          >
            Semua ({totalAdmins})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              statusFilter === 'active'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            )}
          >
            Aktif ({activeAdmins})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('inactive')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              statusFilter === 'inactive'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            )}
          >
            Nonaktif ({inactiveAdmins})
          </button>
        </div>
      </div>

      {/* ─── Table Container ─── */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-neutral-900" />
            <h2 className="text-sm font-bold text-neutral-900">
              Daftar Akun Administrator
            </h2>
          </div>
          <span className="text-xs text-neutral-500 font-medium">
            Menampilkan {filteredAdmins.length} dari {totalAdmins} administrator
          </span>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-xs text-neutral-400">
            <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Memuat daftar administrator...
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
              <ShieldCheck size={22} />
            </div>
            <div className="text-sm font-semibold text-neutral-800">
              Tidak Ada Administrator Ditemukan
            </div>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              {searchQuery || statusFilter !== 'ALL'
                ? 'Tidak ada akun administrator yang sesuai dengan kriteria filter atau pencarian Anda.'
                : 'Belum ada data administrator lain yang terdaftar dalam sistem.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-600 font-semibold tracking-wider uppercase text-[11px]">
                  <th className="py-3 px-4">Administrator</th>
                  <th className="py-3 px-4">Email Login</th>
                  <th className="py-3 px-4 text-center">Status Akun</th>
                  <th className="py-3 px-4">Tanggal Dibuat</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredAdmins.map((adm) => {
                  const isCurrent = Boolean(user && adm.id === user.id)
                  const isActive = adm.is_active !== false

                  return (
                    <tr
                      key={adm.id}
                      className={cn(
                        'hover:bg-neutral-50/80 transition-colors',
                        isCurrent && 'bg-neutral-50/40'
                      )}
                    >
                      {/* Administrator Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-xs flex-shrink-0 shadow-xs">
                            {adm.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-neutral-900">
                                {adm.full_name}
                              </span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-neutral-900 text-white tracking-wide">
                                  Anda
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                              ID: {adm.id.substring(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-neutral-700">
                          <Mail size={13} className="text-neutral-400 flex-shrink-0" />
                          <span>{adm.email || <span className="italic text-neutral-400">Tidak tersedia</span>}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(adm)}
                          disabled={isCurrent}
                          title={
                            isCurrent
                              ? 'Anda tidak dapat menonaktifkan akun sendiri'
                              : `Klik untuk ${isActive ? 'menonaktifkan' : 'mengaktifkan'}`
                          }
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all',
                            isCurrent && 'cursor-default',
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-neutral-100 text-neutral-600 border border-neutral-300 hover:bg-neutral-200'
                          )}
                        >
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              isActive ? 'bg-emerald-600' : 'bg-neutral-400'
                            )}
                          />
                          <span>{isActive ? 'Aktif' : 'Nonaktif'}</span>
                        </button>
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-neutral-600">
                          <Calendar size={13} className="text-neutral-400 flex-shrink-0" />
                          <span>
                            {adm.created_at
                              ? formatJakartaDateTime(adm.created_at)
                              : '-'}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => openEditModal(adm)}
                            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                            title="Edit data administrator"
                          >
                            <Edit2 size={15} />
                          </button>

                          {/* Reset password button */}
                          <button
                            type="button"
                            onClick={() => openResetModal(adm)}
                            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                            title="Reset kata sandi"
                          >
                            <KeyRound size={15} />
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(adm)}
                            disabled={isCurrent}
                            className={cn(
                              'p-1.5 rounded-lg transition-colors',
                              isCurrent
                                ? 'text-neutral-300 cursor-not-allowed'
                                : 'text-neutral-400 hover:text-rose-600 hover:bg-rose-50'
                            )}
                            title={
                              isCurrent
                                ? 'Akun yang sedang login tidak dapat dihapus'
                                : 'Hapus akun administrator'
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── MODAL: Tambah / Edit Admin ─── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setIsModalOpen(false)
          }}
        >
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-fade-in my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
                  {editingAdmin ? <Edit2 size={16} /> : <UserPlus size={16} />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    {editingAdmin ? 'Edit Administrator' : 'Tambah Administrator Baru'}
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    {editingAdmin
                      ? 'Perbarui nama, email, atau status akun administrator'
                      : 'Buat akun administrator baru beserta akses autentikasi'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                <X size={17} />
              </button>
            </div>

            {/* Error in modal */}
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle size={15} className="text-rose-600 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveAdmin} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5">
                  <User size={13} className="text-neutral-500" />
                  <span>Nama Lengkap Administrator</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100/60 focus:bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5">
                  <Mail size={13} className="text-neutral-500" />
                  <span>Alamat Email Login</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@dishub.go.id"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100/60 focus:bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all font-mono"
                />
                <p className="text-[10px] text-neutral-400">
                  Digunakan untuk masuk ke sistem SIPATEN.
                </p>
              </div>

              {/* Password (only on add) */}
              {!editingAdmin && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5">
                    <Lock size={13} className="text-neutral-500" />
                    <span>Kata Sandi Awal</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Minimal 6 karakter"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 bg-neutral-50 hover:bg-neutral-100/60 focus:bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-1"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-400">
                    Kredensial dapat disalin setelah akun berhasil dibuat.
                  </p>
                </div>
              )}

              {/* Status Switch */}
              <div className="pt-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                  <div>
                    <div className="text-xs font-semibold text-neutral-900">
                      Status Akun Aktif
                    </div>
                    <p className="text-[10px] text-neutral-500">
                      {editingAdmin && user && editingAdmin.id === user.id
                        ? 'Anda tidak dapat menonaktifkan akun sendiri saat sedang login'
                        : 'Admin aktif dapat masuk dan mengelola sistem'}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      disabled={Boolean(editingAdmin && user && editingAdmin.id === user.id)}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900 peer-disabled:opacity-50"></div>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{editingAdmin ? 'Simpan Perubahan' : 'Buat Akun Admin'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Kredensial Baru Dibuat ─── */}
      {createdCredentials && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-fade-in">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Akun Administrator Berhasil Dibuat!
                </h3>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  Harap salin informasi kredensial berikut dan berikan kepada administrator terkait.
                </p>
              </div>
            </div>

            {/* Credential Box */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center py-1 border-b border-neutral-200/60">
                <span className="text-neutral-500 font-sans">Nama Lengkap:</span>
                <span className="font-bold text-neutral-900">{createdCredentials.fullName}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-neutral-200/60">
                <span className="text-neutral-500 font-sans">Email Login:</span>
                <span className="font-bold text-neutral-900">{createdCredentials.email}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-neutral-200/60">
                <span className="text-neutral-500 font-sans">Kata Sandi:</span>
                <span className="font-bold text-neutral-900">{createdCredentials.password}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-neutral-500 font-sans">Role:</span>
                <span className="font-bold text-neutral-900 font-sans px-2 py-0.5 rounded bg-neutral-200 text-[10px]">
                  Administrator
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={copyCredentialsToClipboard}
                className={cn(
                  'flex-1 py-2.5 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-2',
                  copiedSuccess
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-neutral-50 text-neutral-900 border-neutral-300'
                )}
              >
                {copiedSuccess ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedSuccess ? 'Tersalin ke Clipboard!' : 'Salin Kredensial'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="py-2.5 px-5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-colors"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Reset Password ─── */}
      {resetModalAdmin && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isResetting) setResetModalAdmin(null)
          }}
        >
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
                  <KeyRound size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Reset Kata Sandi Administrator
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Untuk {resetModalAdmin.full_name} ({resetModalAdmin.email || 'Email tidak tercatat'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalAdmin(null)}
                disabled={isResetting}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                <X size={17} />
              </button>
            </div>

            {resetError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle size={15} className="text-rose-600 flex-shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5">
                  <Lock size={13} className="text-neutral-500" />
                  <span>Kata Sandi Baru</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    placeholder="Minimal 6 karakter"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 bg-neutral-50 hover:bg-neutral-100/60 focus:bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-1"
                  >
                    {showResetPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[10px] text-neutral-400">
                  Setelah disimpan, administrator dapat masuk menggunakan kata sandi baru ini.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setResetModalAdmin(null)}
                  disabled={isResetting}
                  className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="flex-1 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isResetting && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>Simpan Kata Sandi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Konfirmasi Hapus Admin ─── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setDeleteTarget(null)
          }}
        >
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-sm w-full p-6 space-y-5 animate-fade-in">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-700 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 leading-snug">
                  Hapus Akun Administrator?
                </h3>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  Apakah Anda yakin ingin menghapus akun administrator{' '}
                  <span className="font-semibold text-neutral-900">
                    "{deleteTarget.full_name}"
                  </span>{' '}
                  ({deleteTarget.email || 'Email tidak tercatat'})?
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-[11px] text-neutral-600 space-y-1.5">
              <p className="font-semibold text-neutral-900">Catatan Keamanan & Audit:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Akun autentikasi dan profil admin akan dihapus permanen.</li>
                <li>Riwayat tindakan dan catatan audit log tetap dipertahankan untuk akuntabilitas sistem.</li>
              </ul>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>Ya, Hapus Akun</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
