// ============================================================
// SIPATEN — Data Pegawai Admin Page (Enterprise Desktop Layout)
// Full Desktop Grid, Integrated Auth Account Provisioning,
// Real-time Credentials Modal, Password Reset, and Historical Data Protection
// ============================================================

import { useEffect, useState, useMemo } from 'react'
import {
  Users, UserPlus, Search, Edit2, Trash2, CheckCircle2,
  XCircle, AlertCircle, RefreshCw, X, Shield, Headphones, Clock,
  KeyRound, Copy, Check, Eye, EyeOff
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { EmployeeProfile, EmployeeRole, ShiftType } from '../../types/attendance'
import { cn, normalizeName } from '../../lib/utils'

interface CreatedCredentials {
  fullName: string
  employeeCode: string
  email: string
  password: string
  role: EmployeeRole
  defaultShift: string | null
}

export default function EmployeesPage() {
  const { profile } = useAuth()
  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<EmployeeRole | 'ALL'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL')

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Form Fields
  const [formFullName, setFormFullName] = useState('')
  const [formEmployeeCode, setFormEmployeeCode] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formRole, setFormRole] = useState<EmployeeRole>('CS')
  const [formDefaultShift, setFormDefaultShift] = useState<ShiftType | ''>('Shift I')
  const [formIsActive, setFormIsActive] = useState(true)
  const [formNotes, setFormNotes] = useState('')

  // New Account Credentials Modal
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null)
  const [copiedSuccess, setCopiedSuccess] = useState(false)

  // Reset Password Modal
  const [resetModalEmp, setResetModalEmp] = useState<EmployeeProfile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  // Delete / Deactivate Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<EmployeeProfile | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    fetchEmployees()
  }, [])

  async function fetchEmployees() {
    setIsLoading(true)
    setErrorMsg(null)

    try {
      const { data, error } = await supabase
        .from('employee_profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      setEmployees((data as EmployeeProfile[]) || [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data pegawai.'
      setErrorMsg(msg)
    } finally {
      setIsLoading(false)
    }
  }

  // Suggest next employee code based on role
  function generateSuggestedCode(role: EmployeeRole): string {
    const prefix = role === 'CS' ? 'CS' : 'SEC'
    const existingNums = employees
      .filter(e => e.employee_role === role && e.employee_code)
      .map(e => {
        const match = e.employee_code?.match(/\d+/)
        return match ? parseInt(match[0], 10) : 0
      })
    const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 0
    const nextNum = maxNum + 1
    return `${prefix}${String(nextNum).padStart(3, '0')}`
  }

  function openAddModal() {
    setEditingEmployee(null)
    const initialRole: EmployeeRole = 'CS'
    const suggestedCode = generateSuggestedCode(initialRole)
    setFormFullName('')
    setFormRole(initialRole)
    setFormEmployeeCode(suggestedCode)
    setFormEmail(`${suggestedCode.toLowerCase()}@SIPATEN.app`)
    setFormPassword('')
    setShowPassword(false)
    setFormDefaultShift('')
    setFormIsActive(true)
    setFormNotes('')
    setFormError(null)
    setIsModalOpen(true)
  }

  function handleRoleChange(newRole: EmployeeRole) {
    setFormRole(newRole)
    // Only auto-update code and email if user hasn't heavily customized them or when adding
    if (!editingEmployee) {
      const suggestedCode = generateSuggestedCode(newRole)
      setFormEmployeeCode(suggestedCode)
      setFormEmail(`${suggestedCode.toLowerCase()}@SIPATEN.app`)
      if (newRole === 'Security' && !formDefaultShift) {
        setFormDefaultShift('Shift I')
      }
    }
  }

  function openEditModal(emp: EmployeeProfile) {
    setEditingEmployee(emp)
    setFormFullName(emp.full_name)
    setFormEmployeeCode(emp.employee_code || '')
    setFormEmail(emp.email || '')
    setFormPassword('')
    setFormRole(emp.employee_role)
    setFormDefaultShift((emp.default_shift as ShiftType) || '')
    setFormIsActive(emp.is_active)
    setFormNotes(emp.notes || '')
    setFormError(null)
    setIsModalOpen(true)
  }

  async function handleSaveEmployee(e: React.FormEvent) {
    e.preventDefault()

    if (!formFullName.trim()) {
      setFormError('Nama lengkap pegawai wajib diisi.')
      return
    }

    if (!editingEmployee) {
      // Adding new employee with Supabase Auth Account
      if (!formEmployeeCode.trim()) {
        setFormError('ID Pegawai / NIK wajib diisi.')
        return
      }
      if (!formEmail.trim() || !formEmail.includes('@')) {
        setFormError('Alamat email login tidak valid.')
        return
      }
      if (!formPassword || formPassword.length < 6) {
        setFormError('Kata sandi awal minimal 6 karakter.')
        return
      }
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      if (editingEmployee) {
        // Update existing profile
        const normalized = normalizeName(formFullName)
        const payload = {
          full_name: formFullName.trim().replace(/\s+/g, ' '),
          normalized_name: normalized,
          employee_code: formEmployeeCode.trim().toUpperCase() || null,
          email: formEmail.trim().toLowerCase() || null,
          employee_role: formRole,
          default_shift: formRole === 'Security' ? (formDefaultShift || null) : null,
          is_active: formIsActive,
          notes: formNotes.trim() || null,
          updated_at: new Date().toISOString(),
        }

        const { error } = await supabase
          .from('employee_profiles')
          .update(payload)
          .eq('id', editingEmployee.id)

        if (error) throw error

        // Audit Log
        if (profile) {
          await supabase.from('attendance_audit_logs').insert({
            admin_id: profile.id,
            action: 'update_employee',
            reason: `Pembaruan data profil pegawai: ${payload.full_name}`,
            old_values: {
              full_name: editingEmployee.full_name,
              employee_role: editingEmployee.employee_role,
              employee_code: editingEmployee.employee_code,
              email: editingEmployee.email,
              default_shift: editingEmployee.default_shift,
              is_active: editingEmployee.is_active,
            },
            new_values: payload,
          })
        }

        setSuccessBanner(`Data pegawai "${payload.full_name}" berhasil diperbarui.`)
        setTimeout(() => setSuccessBanner(null), 4000)
        setIsModalOpen(false)
        await fetchEmployees()
      } else {
        // Create new employee WITH Auth Account via server RPC
        const { data, error } = await supabase.rpc('admin_create_employee', {
          p_full_name: formFullName.trim().replace(/\s+/g, ' '),
          p_employee_code: formEmployeeCode.trim().toUpperCase(),
          p_email: formEmail.trim().toLowerCase(),
          p_password: formPassword,
          p_role: formRole,
          p_default_shift: formRole === 'Security' ? (formDefaultShift || 'Shift I') : null,
          p_is_active: formIsActive,
          p_notes: formNotes.trim() || null,
        })

        if (error) throw error

        const res = data as { success?: boolean; message?: string }
        if (res && res.success === false) {
          throw new Error(res.message || 'Gagal membuat akun pegawai.')
        }

        // Store credentials to display modal
        setCreatedCredentials({
          fullName: formFullName.trim().replace(/\s+/g, ' '),
          employeeCode: formEmployeeCode.trim().toUpperCase(),
          email: formEmail.trim().toLowerCase(),
          password: formPassword,
          role: formRole,
          defaultShift: formRole === 'Security' ? (formDefaultShift || 'Shift I') : null,
        })

        setIsModalOpen(false)
        await fetchEmployees()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan data pegawai.'
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(emp: EmployeeProfile) {
    try {
      const nextStatus = !emp.is_active
      const { error } = await supabase
        .from('employee_profiles')
        .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', emp.id)

      if (error) throw error

      if (profile) {
        await supabase.from('attendance_audit_logs').insert({
          admin_id: profile.id,
          action: 'toggle_employee_status',
          reason: `Mengubah status presensi pegawai ${emp.full_name} menjadi ${nextStatus ? 'Aktif' : 'Nonaktif'}`,
          old_values: { is_active: emp.is_active },
          new_values: { is_active: nextStatus },
        })
      }

      setEmployees(prev =>
        prev.map(item => (item.id === emp.id ? { ...item, is_active: nextStatus } : item))
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui status.'
      setErrorMsg(msg)
    }
  }

  function openResetModal(emp: EmployeeProfile) {
    setResetModalEmp(emp)
    setNewPassword('')
    setShowResetPassword(false)
    setResetError(null)
  }

  async function handleResetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!resetModalEmp) return
    if (!newPassword || newPassword.length < 6) {
      setResetError('Kata sandi baru minimal 6 karakter.')
      return
    }

    setIsResetting(true)
    setResetError(null)

    try {
      const { data, error } = await supabase.rpc('admin_reset_employee_password', {
        p_employee_id: resetModalEmp.id,
        p_new_password: newPassword,
      })

      if (error) throw error

      const res = data as { success?: boolean; message?: string }
      if (res && res.success === false) {
        throw new Error(res.message || 'Gagal mereset kata sandi.')
      }

      setSuccessBanner(`Kata sandi login untuk "${resetModalEmp.full_name}" berhasil direset.`)
      setTimeout(() => setSuccessBanner(null), 5000)
      setResetModalEmp(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mereset kata sandi.'
      setResetError(msg)
    } finally {
      setIsResetting(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setIsDeleting(true)

    try {
      const { data, error } = await supabase.rpc('admin_delete_employee', {
        p_employee_id: deleteTarget.id,
      })

      if (error) throw error

      const res = data as { success?: boolean; message?: string }
      setSuccessBanner(res?.message || `Pegawai "${deleteTarget.full_name}" berhasil diproses.`)
      setTimeout(() => setSuccessBanner(null), 5000)

      setDeleteTarget(null)
      await fetchEmployees()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus data pegawai.'
      setErrorMsg(msg)
    } finally {
      setIsDeleting(false)
    }
  }

  function copyCredentialsToClipboard() {
    if (!createdCredentials) return
    const text = `[SIPATEN — Kredensial Akun Pegawai]\nNama: ${createdCredentials.fullName}\nID Pegawai: ${createdCredentials.employeeCode}\nEmail Login: ${createdCredentials.email}\nKata Sandi: ${createdCredentials.password}\nRole: ${createdCredentials.role}\n${createdCredentials.defaultShift ? `Shift: ${createdCredentials.defaultShift}\n` : ''}Login portal: ${window.location.origin}/login`
    navigator.clipboard.writeText(text)
    setCopiedSuccess(true)
    setTimeout(() => setCopiedSuccess(false), 2500)
  }

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const matchName = emp.full_name.toLowerCase().includes(query)
        const matchNorm = emp.normalized_name.toLowerCase().includes(query)
        const matchCode = emp.employee_code?.toLowerCase().includes(query) || false
        const matchEmail = emp.email?.toLowerCase().includes(query) || false
        if (!matchName && !matchNorm && !matchCode && !matchEmail) return false
      }
      if (roleFilter !== 'ALL' && emp.employee_role !== roleFilter) return false
      if (statusFilter === 'active' && !emp.is_active) return false
      if (statusFilter === 'inactive' && emp.is_active) return false
      return true
    })
  }, [employees, searchQuery, roleFilter, statusFilter])

  // Summary statistics
  const stats = useMemo(() => {
    const total = employees.length
    const csCount = employees.filter(e => e.employee_role === 'CS').length
    const secCount = employees.filter(e => e.employee_role === 'Security').length
    const activeCount = employees.filter(e => e.is_active).length
    const authLinkedCount = employees.filter(e => Boolean(e.auth_uid)).length
    return { total, csCount, secCount, activeCount, authLinkedCount }
  }, [employees])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-4 rounded-2xl bg-neutral-900 text-white flex items-center justify-between text-xs shadow-md border border-neutral-800 animate-slide-up">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-white flex-shrink-0" />
            <span className="font-medium">{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="p-1 rounded-lg text-neutral-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-neutral-100 border border-neutral-300 text-neutral-900 flex items-center justify-between text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={16} className="text-neutral-900 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={fetchEmployees} className="btn-secondary text-xs py-1 px-3">
            Coba Lagi
          </button>
        </div>
      )}

      {/* 1. Desktop Executive Stat Cards (4 Columns) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Pegawai */}
        <div className="card p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Total Pegawai</p>
            <p className="text-2xl font-extrabold text-neutral-900 font-mono mt-1">{stats.total}</p>
            <p className="text-[10px] text-neutral-400 mt-0.5">{stats.authLinkedCount} akun auth aktif</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-800 flex items-center justify-center flex-shrink-0">
            <Users size={20} />
          </div>
        </div>

        {/* Cleaning Service */}
        <div className="card p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Cleaning Service</p>
            <p className="text-2xl font-extrabold text-neutral-900 font-mono mt-1">{stats.csCount}</p>
            <p className="text-[10px] text-neutral-400 mt-0.5">Petugas kebersihan &amp; CS</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
            <Headphones size={20} />
          </div>
        </div>

        {/* Security */}
        <div className="card p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Security</p>
            <p className="text-2xl font-extrabold text-neutral-900 font-mono mt-1">{stats.secCount}</p>
            <p className="text-[10px] text-neutral-400 mt-0.5">Petugas 3 shift jaga</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-neutral-200/90 border border-neutral-300 text-neutral-900 flex items-center justify-center flex-shrink-0">
            <Shield size={20} />
          </div>
        </div>

        {/* Status Presensi Aktif */}
        <div className="card p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Status Aktif</p>
            <p className="text-2xl font-extrabold text-neutral-900 font-mono mt-1">{stats.activeCount}</p>
            <p className="text-[10px] text-neutral-400 mt-0.5">Dapat melakukan presensi</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-800 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* 2. Desktop Toolbar Card */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={15} />
            <input
              type="text"
              placeholder="Cari nama, ID pegawai (CS001), atau email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input pl-10 text-xs py-2.5"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filters & Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Filter Divisi */}
            <div className="flex items-center gap-1.5 bg-neutral-100/80 p-0.5 rounded-xl border border-neutral-200 text-xs">
              <span className="px-2 text-[10px] font-bold text-neutral-500 uppercase">Divisi:</span>
              <button
                onClick={() => setRoleFilter('ALL')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${roleFilter === 'ALL' ? 'bg-neutral-900 text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
              >
                Semua
              </button>
              <button
                onClick={() => setRoleFilter('CS')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${roleFilter === 'CS' ? 'bg-neutral-900 text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
              >
                CS
              </button>
              <button
                onClick={() => setRoleFilter('Security')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${roleFilter === 'Security' ? 'bg-neutral-900 text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
              >
                Security
              </button>
            </div>

            {/* Filter Status */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'ALL' | 'active' | 'inactive')}
              className="form-input text-xs py-2 w-32"
            >
              <option value="ALL">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>

            {/* Refresh */}
            <button
              onClick={fetchEmployees}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              title="Perbarui data"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Tambah Pegawai Button */}
            <button
              onClick={openAddModal}
              className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
            >
              <UserPlus size={14} />
              <span>Tambah Pegawai</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Wide Desktop Data Table */}
      <div className="card overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
              Daftar Pegawai & Akun Login Terdaftar
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 text-neutral-800 font-mono">
              {filteredEmployees.length} Pegawai
            </span>
          </div>
          <span className="text-xs text-neutral-500">
            Terhubung langsung dengan Supabase Auth & RLS
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-[11px] uppercase tracking-wider font-semibold">
                <th className="px-5 py-3.5 font-semibold">Pegawai & ID</th>
                <th className="px-4 py-3.5 font-semibold">Email Login</th>
                <th className="px-4 py-3.5 font-semibold">Divisi</th>
                <th className="px-4 py-3.5 font-semibold">Shift Bawaan</th>
                <th className="px-4 py-3.5 font-semibold text-center">Akun Auth</th>
                <th className="px-4 py-3.5 font-semibold text-center">Status</th>
                <th className="px-4 py-3.5 font-semibold">Catatan Administrasi</th>
                <th className="px-5 py-3.5 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-neutral-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Memuat daftar pegawai...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-neutral-400">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-2">
                      <Users size={24} />
                    </div>
                    <p className="font-semibold text-neutral-700 text-sm">Tidak ada data pegawai</p>
                    <p className="text-xs text-neutral-400 mt-1">
                      {searchQuery || roleFilter !== 'ALL' || statusFilter !== 'ALL'
                        ? 'Tidak ada pegawai yang cocok dengan filter yang dipilih.'
                        : 'Belum ada data pegawai. Klik "Tambah Pegawai" untuk membuat akun login baru.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-neutral-50/80 transition-colors">
                    {/* Pegawai & ID */}
                    <td className="px-5 py-3.5 font-semibold text-neutral-900">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-900 flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {emp.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-neutral-900 leading-snug">
                              {emp.full_name}
                            </span>
                            {emp.employee_code && (
                              <span className="px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[10px] font-mono font-bold text-neutral-800">
                                {emp.employee_code}
                              </span>
                            )}
                          </div>
                          <span className="block text-[10px] text-neutral-400 font-mono">
                            @{emp.normalized_name}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Email Login */}
                    <td className="px-4 py-3.5 font-mono text-[11px] text-neutral-600">
                      {emp.email || '-'}
                    </td>

                    {/* Divisi */}
                    <td className="px-4 py-3.5">
                      {emp.employee_role === 'CS' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-neutral-100 text-neutral-900 border border-neutral-200">
                          <Headphones size={13} />
                          Cleaning Service
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-neutral-900 text-white">
                          <Shield size={13} />
                          Security
                        </span>
                      )}
                    </td>

                    {/* Shift */}
                    <td className="px-4 py-3.5">
                      {emp.employee_role === 'Security' && emp.default_shift ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-800 bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-md font-medium">
                          <Clock size={12} className="text-neutral-500" />
                          {emp.default_shift}
                        </span>
                      ) : (
                        <span className="text-neutral-400 font-mono">-</span>
                      )}
                    </td>

                    {/* Akun Auth Terhubung */}
                    <td className="px-4 py-3.5 text-center">
                      {emp.auth_uid ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-900 bg-neutral-100 border border-neutral-300 px-2.5 py-0.5 rounded-full"
                          title={`Auth UID: ${emp.auth_uid}`}
                        >
                          <KeyRound size={11} />
                          <span>Terhubung</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-neutral-400 font-mono">Lokal</span>
                      )}
                    </td>

                    {/* Status Toggle */}
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => handleToggleStatus(emp)}
                        title="Klik untuk mengubah status aktif/nonaktif"
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border',
                          emp.is_active
                            ? 'bg-neutral-900 text-white border-neutral-900 hover:bg-black'
                            : 'bg-neutral-100 text-neutral-500 border-neutral-200 hover:bg-neutral-200'
                        )}
                      >
                        {emp.is_active ? (
                          <>
                            <CheckCircle2 size={12} />
                            <span>Aktif</span>
                          </>
                        ) : (
                          <>
                            <XCircle size={12} />
                            <span>Nonaktif</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Catatan */}
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-neutral-500 max-w-xs truncate block" title={emp.notes || ''}>
                        {emp.notes || '-'}
                      </span>
                    </td>

                    {/* Aksi */}
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openResetModal(emp)}
                          className="p-1.5 rounded-lg text-neutral-600 hover:text-black hover:bg-neutral-100 border border-transparent hover:border-neutral-200 transition-colors"
                          title="Reset Kata Sandi Login"
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 rounded-lg text-neutral-600 hover:text-black hover:bg-neutral-100 border border-transparent hover:border-neutral-200 transition-colors"
                          title="Ubah Data Pegawai"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(emp)}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100 border border-transparent hover:border-neutral-200 transition-colors"
                          title="Hapus Pegawai"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Tambah / Edit Pegawai */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl border border-neutral-200 max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="text-base font-bold text-neutral-900">
                  {editingEmployee ? 'Ubah Data Pegawai' : 'Tambah Pegawai & Akun Login'}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {editingEmployee
                    ? 'Perbarui informasi profil pegawai SIPATEN.'
                    : 'Membuat profil pegawai dan akun autentikasi Supabase secara instan.'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-neutral-100 border border-neutral-300 text-neutral-900 text-xs rounded-xl flex items-start gap-2">
                <AlertCircle size={16} className="text-neutral-900 flex-shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEmployee} className="space-y-4">
              {/* Nama Lengkap */}
              <div className="space-y-1.5">
                <label className="form-label text-xs">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Triza Nabila Ariely"
                  value={formFullName}
                  onChange={e => setFormFullName(e.target.value)}
                  className="form-input text-xs py-2.5"
                />
              </div>

              {/* Divisi / Role Selection */}
              <div className="space-y-1.5">
                <label className="form-label text-xs">Divisi / Penugasan *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRoleChange('CS')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${formRole === 'CS'
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                      }`}
                  >
                    <Headphones size={15} />
                    <span>Cleaning Service</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleChange('Security')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${formRole === 'Security'
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                      }`}
                  >
                    <Shield size={15} />
                    <span>Security</span>
                  </button>
                </div>
              </div>

              {/* ID Pegawai & Email Login */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="form-label text-xs">ID Pegawai / NIK *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: CS002 / SEC002"
                    value={formEmployeeCode}
                    onChange={e => setFormEmployeeCode(e.target.value)}
                    className="form-input text-xs py-2.5 font-mono uppercase"
                  />
                  <p className="text-[10px] text-neutral-400">Dapat dipakai saat login</p>
                </div>

                <div className="space-y-1.5">
                  <label className="form-label text-xs">Email Login *</label>
                  <input
                    type="email"
                    required
                    placeholder="pegawai@SIPATEN.app"
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    className="form-input text-xs py-2.5"
                  />
                  <p className="text-[10px] text-neutral-400">Akun autentikasi Supabase</p>
                </div>
              </div>

              {/* Password (Hanya saat Tambah Baru) */}
              {!editingEmployee && (
                <div className="space-y-1.5">
                  <label className="form-label text-xs">Kata Sandi Awal Akun *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Minimal 6 karakter"
                      value={formPassword}
                      onChange={e => setFormPassword(e.target.value)}
                      className="form-input text-xs py-2.5 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500">
                    Kredensial login dapat disalin setelah pegawai berhasil dibuat.
                  </p>
                </div>
              )}

              {/* Shift Default for Security */}
              {formRole === 'Security' && (
                <div className="space-y-1.5">
                  <label className="form-label text-xs">Shift Bawaan Security</label>
                  <select
                    value={formDefaultShift}
                    onChange={e => setFormDefaultShift(e.target.value as ShiftType)}
                    className="form-input text-xs py-2.5"
                  >
                    <option value="Shift I">Shift I (Pagi: 07.00 - 15.00)</option>
                    <option value="Shift II">Shift II (Siang: 15.00 - 23.00)</option>
                    <option value="Shift III">Shift III (Malam: 23.00 - 07.00)</option>
                  </select>
                </div>
              )}

              {/* Catatan Administrasi */}
              <div className="space-y-1.5">
                <label className="form-label text-xs">Catatan Administrasi</label>
                <textarea
                  rows={2}
                  placeholder="Catatan penempatan pos, kontak, atau informasi tambahan..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="form-input text-xs py-2 resize-none"
                />
              </div>

              {/* Checkbox Status Aktif */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={formIsActive}
                  onChange={e => setFormIsActive(e.target.checked)}
                  className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="isActiveCheck" className="text-xs font-medium text-neutral-800 cursor-pointer">
                  Pegawai Berstatus Aktif (Dapat Melakukan Absensi & Login)
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary text-xs py-2 px-4"
                >
                  {isSubmitting
                    ? 'Memproses Akun...'
                    : editingEmployee
                      ? 'Perbarui Data'
                      : 'Buat Akun & Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tampilkan Kredensial Baru Dibuat */}
      {createdCredentials && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl border border-neutral-200 max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-neutral-900 text-white flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-neutral-900">Akun Pegawai Berhasil Dibuat!</h3>
              <p className="text-xs text-neutral-500">
                Akun autentikasi Supabase dan profil pegawai telah aktif. Berikan kredensial berikut kepada pegawai:
              </p>
            </div>

            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200/60">
                <span className="text-neutral-500">Nama Pegawai</span>
                <span className="font-semibold text-neutral-900">{createdCredentials.fullName}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200/60">
                <span className="text-neutral-500">ID Pegawai (NIK)</span>
                <span className="font-mono font-bold text-neutral-900 bg-neutral-200/80 px-2 py-0.5 rounded">
                  {createdCredentials.employeeCode}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200/60">
                <span className="text-neutral-500">Email Login</span>
                <span className="font-mono text-neutral-800">{createdCredentials.email}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200/60">
                <span className="text-neutral-500">Kata Sandi</span>
                <span className="font-mono font-bold text-neutral-900 bg-neutral-900 text-white px-2 py-0.5 rounded">
                  {createdCredentials.password}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Divisi Portal</span>
                <span className="font-semibold text-neutral-900">{createdCredentials.role}</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={copyCredentialsToClipboard}
                className="w-full btn-primary text-xs py-2.5 flex items-center justify-center gap-2"
              >
                {copiedSuccess ? (
                  <>
                    <Check size={14} className="text-white" />
                    <span>Kredensial Berhasil Disalin!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Salin Kredensial Pegawai</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="w-full btn-secondary text-xs py-2.5 justify-center"
              >
                Selesai & Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reset Password Pegawai */}
      {resetModalEmp && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl border border-neutral-200 max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-neutral-900 border border-neutral-200 flex items-center justify-center mx-auto">
              <KeyRound size={22} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-neutral-900">Reset Kata Sandi Login</h3>
              <p className="text-xs text-neutral-500">
                Perbarui kata sandi login untuk pegawai <strong className="text-neutral-800">{resetModalEmp.full_name}</strong>.
              </p>
            </div>

            {resetError && (
              <div className="p-3 bg-neutral-100 border border-neutral-300 text-neutral-900 text-xs rounded-xl flex items-start gap-2">
                <AlertCircle size={16} className="text-neutral-900 flex-shrink-0 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="form-label text-xs">Kata Sandi Baru *</label>
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Minimal 6 karakter"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="form-input text-xs py-2.5 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                  >
                    {showResetPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalEmp(null)}
                  disabled={isResetting}
                  className="btn-secondary text-xs py-2.5 justify-center"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="btn-primary text-xs py-2.5 justify-center"
                >
                  {isResetting ? 'Menyimpan...' : 'Simpan Sandi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Deactivate Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl border border-neutral-200 max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-900 border border-neutral-200 flex items-center justify-center mx-auto">
              <Trash2 size={22} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-neutral-900">Konfirmasi Hapus Pegawai</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Apakah Anda yakin ingin menghapus data pegawai <strong className="text-neutral-800">{deleteTarget.full_name}</strong>?
              </p>
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-left text-[11px] text-neutral-600 mt-2">
                <span className="font-semibold text-neutral-800 block mb-0.5">Proteksi Integritas Data:</span>
                Riwayat absensi terdahulu akan tetap tersimpan dan tidak terhapus untuk audit perusahaan.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="btn-secondary text-xs py-2.5 justify-center"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="btn-primary text-xs py-2.5 justify-center bg-black hover:bg-neutral-900"
              >
                {isDeleting ? 'Memproses...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
