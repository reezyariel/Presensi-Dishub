// ============================================================
// SIPATEN — Review & Verifikasi Presensi Terpadu (CS & Security)
// Enterprise Desktop Console: Unified Review, Role Filters,
// Real-time Counts, Evidence Completeness & Sequential Inspection
// ============================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Search, AlertTriangle, ShieldCheck, CheckCircle2,
  MapPin, Camera, RefreshCw, Trash2, Shield,
  Layers, ChevronLeft, ChevronRight, CheckSquare,
  Square, Clock, X, Filter
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import {
  AttendanceStatusBadge,
  CategoryBadge,
  AttendanceTypeBadge,
  ReviewStatusBadge,
} from '../../components/admin/StatusBadges'
import { getSecurityShiftDisplayLabel } from '../../lib/scheduleEngine'
import { formatDistance } from '../../lib/officeLocation'
import {
  getReviewAssistanceFlags,
  getEmployeeDisplayCode,
  formatReviewWorkDate,
  formatReviewTime,
  isOvernightSecurityRecord,
  matchesReviewSearch,
} from '../../lib/reviewAssistance'
import ReviewActionModal from '../../components/admin/ReviewActionModal'
import ReviewBulkModal from '../../components/admin/ReviewBulkModal'
import PhotoPreviewModal from '../../components/admin/PhotoPreviewModal'
import type { AttendanceRecord, ReviewStatus } from '../../types/attendance'

const PAGE_SIZE = 20

export default function ReviewPage() {
  const { profile } = useAuth()

  // Data & filter states
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [roleFilter, setRoleFilter] = useState<'all' | 'CS' | 'Security'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('belum_diperiksa')
  const [searchTerm, setSearchTerm] = useState('')
  const [showOnlyAttention, setShowOnlyAttention] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [employeeCodeMap, setEmployeeCodeMap] = useState<Map<string, string>>(new Map())

  // Tab & role counts (real data from database)
  const [stats, setStats] = useState({
    belum: 0,
    perlu: 0,
    sudah: 0,
    total: 0,
    totalCS: 0,
    totalSecurity: 0,
  })

  // Selected records for bulk actions
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set())

  // Modals state
  const [activeModalRecord, setActiveModalRecord] = useState<AttendanceRecord | null>(null)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [photoPreviewRecord, setPhotoPreviewRecord] = useState<AttendanceRecord | null>(null)
  const [deleteModalRecord, setDeleteModalRecord] = useState<AttendanceRecord | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)

  // ─────────────────────────────────────────────────────────────
  // 1. Load Live Database Counts
  // ─────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const [rBelum, rPerlu, rSudah, rCS, rSec, rAll] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('review_status', 'belum_diperiksa'),
        supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('review_status', 'perlu_tindak_lanjut'),
        supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('review_status', 'sudah_diperiksa'),
        supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('category', 'CS'),
        supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('category', 'Security'),
        supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true }),
      ])

      setStats({
        belum: rBelum.count || 0,
        perlu: rPerlu.count || 0,
        sudah: rSudah.count || 0,
        total: rAll.count || 0,
        totalCS: rCS.count || 0,
        totalSecurity: rSec.count || 0,
      })
    } catch (err) {
      console.warn('[ReviewPage] Failed to fetch stats:', err)
    }
  }, [])

  // ─────────────────────────────────────────────────────────────
  // 2. Load Attendance Records & Employee Codes
  // ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Fetch employee profiles for ID / code lookup
      const { data: empData } = await supabase
        .from('employee_profiles')
        .select('id, full_name, normalized_name, employee_code, employee_role')

      const codeMap = new Map<string, string>()
      if (empData) {
        for (const emp of empData) {
          if (emp.employee_code) {
            codeMap.set(emp.id, emp.employee_code)
            if (emp.normalized_name) codeMap.set(emp.normalized_name, emp.employee_code)
            if (emp.full_name) codeMap.set(emp.full_name.toLowerCase().trim(), emp.employee_code)
          }
        }
      }
      setEmployeeCodeMap(codeMap)

      // Query attendance records
      let q = supabase
        .from('attendance_records')
        .select('*', { count: 'exact' })
        .order('recorded_at', { ascending: false })

      if (roleFilter !== 'all') {
        q = q.eq('category', roleFilter)
      }

      if (statusFilter !== 'all') {
        q = q.eq('review_status', statusFilter)
      }

      if (searchTerm.trim()) {
        q = q.ilike('employee_name', `%${searchTerm.trim()}%`)
      }

      q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      const { data, count, error } = await q
      if (error) throw error

      let fetched = (data ?? []) as AttendanceRecord[]

      // If search query didn't match employee_name directly on server, check employee codes
      if (searchTerm.trim() && fetched.length === 0) {
        const { data: fallbackData } = await supabase
          .from('attendance_records')
          .select('*')
          .order('recorded_at', { ascending: false })
          .limit(100)

        if (fallbackData) {
          fetched = (fallbackData as AttendanceRecord[]).filter((r) =>
            matchesReviewSearch(r, searchTerm, codeMap)
          )
        }
      }

      setRecords(fetched)
      setTotalCount(count ?? fetched.length)
      loadStats()
    } catch (err) {
      console.error('[ReviewPage] Load error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [roleFilter, statusFilter, searchTerm, page, loadStats])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─────────────────────────────────────────────────────────────
  // 3. Filtered Records in Current View
  // ─────────────────────────────────────────────────────────────
  const displayedRecords = useMemo(() => {
    if (!showOnlyAttention) return records
    return records.filter((r) => {
      const flags = getReviewAssistanceFlags(r, records)
      return flags.warningCount > 0
    })
  }, [records, showOnlyAttention])

  const selectedRecordsList = useMemo(() => {
    return records.filter((r) => selectedRecordIds.has(r.id))
  }, [records, selectedRecordIds])

  // ─────────────────────────────────────────────────────────────
  // 4. Filter Handlers
  // ─────────────────────────────────────────────────────────────
  const handleRoleChange = (role: 'all' | 'CS' | 'Security') => {
    setRoleFilter(role)
    setPage(0)
    setSelectedRecordIds(new Set())
  }

  const handleStatusChange = (status: 'all' | ReviewStatus) => {
    setStatusFilter(status)
    setPage(0)
    setSelectedRecordIds(new Set())
  }

  const handleSearchInput = (val: string) => {
    setSearchTerm(val)
    setPage(0)
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Checkbox Selection Handlers
  // ─────────────────────────────────────────────────────────────
  const isAllPageSelected =
    displayedRecords.length > 0 &&
    displayedRecords.every((r) => selectedRecordIds.has(r.id))

  const handleToggleSelectAll = () => {
    if (isAllPageSelected) {
      setSelectedRecordIds(new Set())
    } else {
      const newSet = new Set<string>(selectedRecordIds)
      for (const r of displayedRecords) {
        newSet.add(r.id)
      }
      setSelectedRecordIds(newSet)
    }
  }

  const handleToggleRowSelect = (id: string) => {
    const newSet = new Set<string>(selectedRecordIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedRecordIds(newSet)
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Sequential Modal Navigation Handlers
  // ─────────────────────────────────────────────────────────────
  const activeRecordIndex = useMemo(() => {
    if (!activeModalRecord) return -1
    return displayedRecords.findIndex((r) => r.id === activeModalRecord.id)
  }, [activeModalRecord, displayedRecords])

  const handleNavigatePrevious = () => {
    if (activeRecordIndex > 0) {
      setActiveModalRecord(displayedRecords[activeRecordIndex - 1])
    }
  }

  const handleNavigateNext = () => {
    if (activeRecordIndex >= 0 && activeRecordIndex < displayedRecords.length - 1) {
      setActiveModalRecord(displayedRecords[activeRecordIndex + 1])
    }
  }

  const handleRecordUpdatedInModal = (updatedRecord: AttendanceRecord) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
    )
    loadStats()
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Delete Record Modal & RPC Handler (Preserved)
  // ─────────────────────────────────────────────────────────────
  const openDeleteModal = (record: AttendanceRecord) => {
    setDeleteModalRecord(record)
    setDeleteReason('')
    setDeleteError(null)
  }

  const handleDeleteRecord = async () => {
    if (!deleteModalRecord || !profile) return
    if (!deleteReason.trim()) {
      setDeleteError('Alasan penghapusan wajib diisi.')
      return
    }
    setIsDeleting(true)
    setDeleteError(null)

    const recordSnapshot = deleteModalRecord

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'admin_delete_attendance_record',
        {
          p_record_id: recordSnapshot.id,
          p_reason: deleteReason.trim(),
        }
      )

      if (rpcError) {
        console.error('[ReviewPage] RPC error:', rpcError)
        setDeleteError(
          rpcError.message.includes('permission') || rpcError.message.includes('denied')
            ? 'Anda tidak memiliki izin untuk menghapus rekaman ini.'
            : `Koneksi gagal: ${rpcError.message}`
        )
        return
      }

      if (!data?.success) {
        const code = data?.error_code ?? 'UNKNOWN'
        const detail = data?.error ?? 'Penghapusan gagal di server.'
        console.error('[ReviewPage] RPC business error:', code, detail)

        const userMsg: Record<string, string> = {
          NOT_AUTHENTICATED: 'Sesi login habis. Silakan login ulang.',
          NOT_ADMIN: 'Hanya Administrator yang dapat menghapus rekaman.',
          RECORD_NOT_FOUND: 'Rekaman tidak ditemukan — mungkin sudah dihapus sebelumnya.',
          REASON_REQUIRED: 'Alasan penghapusan wajib diisi.',
        }
        setDeleteError(userMsg[code] ?? `Gagal menghapus rekaman (${code}).`)
        return
      }

      setDeleteModalRecord(null)
      setSuccessBanner(
        `Rekaman presensi ${recordSnapshot.employee_name} berhasil dihapus dan dicatat di audit log.`
      )
      setTimeout(() => setSuccessBanner(null), 5000)
      setRecords((prev) => prev.filter((r) => r.id !== recordSnapshot.id))
      loadStats()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[ReviewPage] Unexpected delete error:', msg)
      setDeleteError('Terjadi kesalahan tidak terduga. Silakan coba lagi.')
    } finally {
      setIsDeleting(false)
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Top Notification Banner */}
      {successBanner && (
        <div className="p-3.5 bg-neutral-900 text-white rounded-2xl shadow-sm flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
            <span className="text-xs font-semibold">{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-neutral-400 hover:text-white p-1"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Main Header & Stats Overview Card */}
      <div className="card p-5 space-y-4">
        {/* Row 1: Title, Division (Role) Switcher & Search Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Role Filter Pills */}
          <div className="flex items-center gap-1.5 bg-neutral-100/90 p-1 rounded-2xl border border-neutral-200 text-xs">
            {/* Semua Divisi */}
            <button
              type="button"
              onClick={() => handleRoleChange('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                roleFilter === 'all'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-200/60'
              }`}
            >
              <span>Semua Divisi</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  roleFilter === 'all'
                    ? 'bg-white text-black'
                    : 'bg-neutral-200 text-neutral-800'
                }`}
              >
                {stats.total}
              </span>
            </button>

            {/* CS (Cleaning Service) */}
            <button
              type="button"
              onClick={() => handleRoleChange('CS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                roleFilter === 'CS'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-200/60'
              }`}
            >
              <span>Cleaning Service</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  roleFilter === 'CS'
                    ? 'bg-white text-black'
                    : 'bg-neutral-200 text-neutral-800'
                }`}
              >
                {stats.totalCS}
              </span>
            </button>

            {/* Security */}
            <button
              type="button"
              onClick={() => handleRoleChange('Security')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                roleFilter === 'Security'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-200/60'
              }`}
            >
              <Shield size={13} />
              <span>Security</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  roleFilter === 'Security'
                    ? 'bg-white text-black'
                    : 'bg-neutral-200 text-neutral-800'
                }`}
              >
                {stats.totalSecurity}
              </span>
            </button>
          </div>

          {/* Search bar & Refresh */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
              />
              <input
                type="text"
                placeholder="Cari nama atau ID/kode pegawai..."
                value={searchTerm}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="form-input pl-9 text-xs py-2 w-full rounded-xl"
              />
            </div>
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-100 text-neutral-600 transition-colors"
              title="Muat ulang data"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Row 2: Status Filter Tabs & Attention Quick Toggle */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-neutral-100">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
            {/* Menunggu Review */}
            <button
              type="button"
              onClick={() => handleStatusChange('belum_diperiksa')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all ${
                statusFilter === 'belum_diperiksa'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-200/60 border border-neutral-200'
              }`}
            >
              <Clock size={14} />
              <span>Menunggu Review</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === 'belum_diperiksa'
                    ? 'bg-white text-black'
                    : 'bg-neutral-200 text-neutral-800'
                }`}
              >
                {stats.belum}
              </span>
            </button>

            {/* Perlu Tindak Lanjut */}
            <button
              type="button"
              onClick={() => handleStatusChange('perlu_tindak_lanjut')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all ${
                statusFilter === 'perlu_tindak_lanjut'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-200/60 border border-neutral-200'
              }`}
            >
              <AlertTriangle size={14} />
              <span>Perlu Tindak Lanjut</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === 'perlu_tindak_lanjut'
                    ? 'bg-white text-black'
                    : 'bg-neutral-200 text-neutral-800'
                }`}
              >
                {stats.perlu}
              </span>
            </button>

            {/* Sudah Disetujui */}
            <button
              type="button"
              onClick={() => handleStatusChange('sudah_diperiksa')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all ${
                statusFilter === 'sudah_diperiksa'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-200/60 border border-neutral-200'
              }`}
            >
              <CheckCircle2 size={14} />
              <span>Sudah Disetujui</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === 'sudah_diperiksa'
                    ? 'bg-white text-black'
                    : 'bg-neutral-200 text-neutral-800'
                }`}
              >
                {stats.sudah}
              </span>
            </button>

            {/* Semua Status */}
            <button
              type="button"
              onClick={() => handleStatusChange('all')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all ${
                statusFilter === 'all'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-200/60 border border-neutral-200'
              }`}
            >
              <Filter size={13} />
              <span>Semua Status</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === 'all'
                    ? 'bg-white text-black'
                    : 'bg-neutral-200 text-neutral-800'
                }`}
              >
                {stats.total}
              </span>
            </button>
          </div>

          {/* Quick Filter: Hanya Perlu Perhatian */}
          <button
            type="button"
            onClick={() => setShowOnlyAttention((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all self-start sm:self-auto ${
              showOnlyAttention
                ? 'bg-amber-500 text-white border-amber-600 shadow-2xs font-bold'
                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
            }`}
            title="Tampilkan hanya rekaman yang memiliki anomali atau bukti tidak lengkap"
          >
            <AlertTriangle size={13} />
            <span>Hanya Perlu Perhatian</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar (Visible when 1 or more rows selected) */}
      {selectedRecordIds.size > 0 && (
        <div className="p-3.5 bg-neutral-900 text-white rounded-2xl shadow-lg flex items-center justify-between gap-4 animate-scale-up">
          <div className="flex items-center gap-2 text-xs">
            <CheckSquare size={16} className="text-emerald-400" />
            <span className="font-bold">
              {selectedRecordIds.size} pengajuan presensi dipilih
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedRecordIds(new Set())}
              className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition-colors"
            >
              Batal Pilihan
            </button>
            <button
              type="button"
              onClick={() => setIsBulkModalOpen(true)}
              className="px-4 py-1.5 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Layers size={14} />
              <span>Tinjau Massal ({selectedRecordIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Unified Review Table */}
      <div className="card overflow-hidden">
        {/* Table Top Header */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
              Antrean Verifikasi Absensi
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 text-neutral-800 font-mono">
              {displayedRecords.length} Ditampilkan
            </span>
            {totalCount > PAGE_SIZE && (
              <span className="text-xs text-neutral-400 hidden sm:inline">
                (dari total {totalCount} rekaman)
              </span>
            )}
          </div>
          <span className="text-xs text-neutral-500 hidden md:inline">
            Periksa keabsahan selfie, GPS geofence, dan toleransi shift pegawai
          </span>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-[11px] uppercase tracking-wider font-semibold">
                <th className="px-4 py-3.5 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="text-neutral-500 hover:text-black"
                    title={isAllPageSelected ? 'Batalkan pilihan' : 'Pilih semua'}
                  >
                    {isAllPageSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
                <th className="px-4 py-3.5 font-semibold">Pegawai</th>
                <th className="px-3 py-3.5 font-semibold">Divisi</th>
                <th className="px-4 py-3.5 font-semibold">Presensi & Shift</th>
                <th className="px-4 py-3.5 font-semibold">Tanggal & Jam</th>
                <th className="px-3 py-3.5 font-semibold text-center">Ketepatan</th>
                <th className="px-4 py-3.5 font-semibold">Kelengkapan Bukti</th>
                <th className="px-4 py-3.5 font-semibold">Catatan / Alasan</th>
                <th className="px-3 py-3.5 font-semibold">Status Review</th>
                <th className="px-5 py-3.5 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-neutral-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Memuat antrean verifikasi presensi...</span>
                    </div>
                  </td>
                </tr>
              ) : displayedRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-neutral-400">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-2">
                      <CheckCircle2 size={24} />
                    </div>
                    <p className="font-bold text-neutral-700 text-sm">
                      Tidak ada data untuk kriteria filter ini
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">
                      Semua presensi pada status ini telah selesai diverifikasi atau tidak ditemukan catatan.
                    </p>
                  </td>
                </tr>
              ) : (
                displayedRecords.map((rec) => {
                  const flags = getReviewAssistanceFlags(rec, records)
                  const empCode = getEmployeeDisplayCode(rec, employeeCodeMap)
                  const isOvernight = isOvernightSecurityRecord(rec)
                  const isSelected = selectedRecordIds.has(rec.id)

                  return (
                    <tr
                      key={rec.id}
                      className={`hover:bg-neutral-50/80 transition-colors ${
                        isSelected ? 'bg-neutral-50' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleRowSelect(rec.id)}
                          className="text-neutral-500 hover:text-black"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-neutral-900" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </td>

                      {/* Pegawai */}
                      <td className="px-4 py-3.5 font-semibold text-neutral-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-900 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {rec.employee_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="block font-bold text-neutral-900">
                              {rec.employee_name}
                            </span>
                            <span className="block text-[10px] text-neutral-400 font-mono">
                              ID: {empCode}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Divisi */}
                      <td className="px-3 py-3.5">
                        <CategoryBadge category={rec.category} />
                      </td>

                      {/* Presensi & Shift */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <AttendanceTypeBadge type={rec.attendance_type} />
                          {rec.category === 'Security' && rec.shift && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200 text-neutral-700 font-semibold flex items-center gap-1">
                              <Shield size={10} />
                              {getSecurityShiftDisplayLabel(rec.shift, rec.work_date)}
                            </span>
                          )}
                          {isOvernight && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-800 font-bold">
                              H+1
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tanggal & Jam */}
                      <td className="px-4 py-3.5">
                        <span className="block font-medium text-neutral-900">
                          {formatReviewWorkDate(rec)}
                        </span>
                        <span className="block text-[11px] font-mono text-neutral-500">
                          {formatReviewTime(rec.recorded_at)}
                        </span>
                      </td>

                      {/* Status Ketepatan */}
                      <td className="px-3 py-3.5 text-center">
                        <AttendanceStatusBadge status={rec.attendance_status} />
                        {rec.late_minutes > 0 && (
                          <span className="block text-[10px] font-mono text-amber-700 font-bold mt-0.5">
                            +{rec.late_minutes}m
                          </span>
                        )}
                      </td>

                      {/* Kelengkapan Bukti & Bantuan */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {/* Selfie indicator */}
                          {rec.selfie_storage_path ? (
                            <button
                              type="button"
                              onClick={() => setPhotoPreviewRecord(rec)}
                              className="text-emerald-700 p-1 rounded-md bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                              title="Foto selfie tersedia (klik untuk perbesar)"
                            >
                              <Camera size={13} />
                            </button>
                          ) : (
                            <span
                              className="text-red-600 p-1 rounded-md bg-red-50 border border-red-200"
                              title="Foto selfie TIDAK tersedia"
                            >
                              <Camera size={13} className="opacity-60" />
                            </span>
                          )}

                          {/* GPS indicator */}
                          {rec.latitude !== null && rec.longitude !== null ? (
                            <span
                              className="text-emerald-700 p-1 rounded-md bg-emerald-50 border border-emerald-200"
                              title={`GPS tercatat (${rec.latitude?.toFixed(4)}, ${rec.longitude?.toFixed(4)})`}
                            >
                              <MapPin size={13} />
                            </span>
                          ) : (
                            <span
                              className="text-amber-700 p-1 rounded-md bg-amber-50 border border-amber-200"
                              title="Koordinat GPS tidak tersedia"
                            >
                              <MapPin size={13} className="opacity-60" />
                            </span>
                          )}

                          {/* Geofence indicator */}
                          {rec.distance_meters !== null && rec.distance_meters !== undefined ? (
                            rec.distance_meters <= 100 ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-neutral-100 text-neutral-800 border border-neutral-200">
                                {formatDistance(rec.distance_meters)}
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                ⚠️ {formatDistance(rec.distance_meters)}
                              </span>
                            )
                          ) : null}

                          {/* Anomaly warning chip */}
                          {flags.warningCount > 0 && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1"
                              title={flags.reasons.join('\n')}
                            >
                              <AlertTriangle size={11} className="text-amber-700" />
                              <span>{flags.warningCount}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Catatan / Alasan */}
                      <td className="px-4 py-3.5">
                        {rec.reason ? (
                          <span
                            className="text-xs text-neutral-800 font-semibold max-w-xs truncate block"
                            title={rec.reason}
                          >
                            &ldquo;{rec.reason}&rdquo;
                          </span>
                        ) : rec.admin_notes ? (
                          <span
                            className="text-xs text-neutral-500 italic max-w-xs truncate block"
                            title={rec.admin_notes}
                          >
                            Admin: {rec.admin_notes}
                          </span>
                        ) : (
                          <span className="text-neutral-400 text-xs">-</span>
                        )}
                      </td>

                      {/* Status Review */}
                      <td className="px-3 py-3.5">
                        <ReviewStatusBadge status={rec.review_status} />
                      </td>

                      {/* Aksi */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setActiveModalRecord(rec)}
                            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-2xs rounded-xl"
                          >
                            <ShieldCheck size={13} />
                            <span>Tinjau</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteModal(rec)}
                            className="p-1.5 rounded-lg border border-neutral-200 text-neutral-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all"
                            title="Hapus rekaman presensi ini"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalCount > PAGE_SIZE && (
          <div className="px-5 py-3.5 border-t border-neutral-100 flex items-center justify-between bg-neutral-50/50 text-xs">
            <span className="text-neutral-500">
              Menampilkan {page * PAGE_SIZE + 1} -{' '}
              {Math.min((page + 1) * PAGE_SIZE, totalCount)} dari {totalCount} rekaman
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
                disabled={page === 0 || isLoading}
                className="btn-secondary text-xs py-1 px-2.5 rounded-lg flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                <span>Sebelumnya</span>
              </button>

              <span className="font-semibold text-neutral-700 px-2">
                Halaman {page + 1} dari {totalPages || 1}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
                disabled={page >= totalPages - 1 || isLoading}
                className="btn-secondary text-xs py-1 px-2.5 rounded-lg flex items-center gap-1 disabled:opacity-40"
              >
                <span>Berikutnya</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          Sequential Deep Verification Modal (ReviewActionModal)
      ───────────────────────────────────────────────────────────── */}
      {activeModalRecord && (
        <ReviewActionModal
          isOpen={Boolean(activeModalRecord)}
          onClose={() => setActiveModalRecord(null)}
          currentRecord={activeModalRecord}
          allRecords={displayedRecords}
          currentIndex={activeRecordIndex}
          totalInView={displayedRecords.length}
          pendingReviewCount={stats.belum}
          onNavigatePrevious={handleNavigatePrevious}
          onNavigateNext={handleNavigateNext}
          onRecordUpdated={handleRecordUpdatedInModal}
          employeeCodeMap={employeeCodeMap}
          onOpenPhotoPreview={(r) => setPhotoPreviewRecord(r)}
          currentAdminId={profile?.id}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          Safe Bulk Review Modal (ReviewBulkModal)
      ───────────────────────────────────────────────────────────── */}
      {isBulkModalOpen && (
        <ReviewBulkModal
          isOpen={isBulkModalOpen}
          onClose={() => setIsBulkModalOpen(false)}
          selectedRecords={selectedRecordsList}
          onBulkUpdated={() => {
            setSelectedRecordIds(new Set())
            setSuccessBanner(
              `${selectedRecordsList.length} rekaman berhasil diperbarui dan dicatat di log audit.`
            )
            setTimeout(() => setSuccessBanner(null), 4000)
            loadData()
          }}
          currentAdminId={profile?.id}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          Full-Size Photo Preview Modal
      ───────────────────────────────────────────────────────────── */}
      {photoPreviewRecord && (
        <PhotoPreviewModal
          isOpen={Boolean(photoPreviewRecord)}
          onClose={() => setPhotoPreviewRecord(null)}
          record={photoPreviewRecord}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          Delete Confirmation Modal (Preserved with RPC)
      ───────────────────────────────────────────────────────────── */}
      {deleteModalRecord && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl border border-neutral-200 max-w-md w-full p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center">
                  <Trash2 size={16} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Hapus Rekaman Presensi
                  </h3>
                  <p className="text-xs text-neutral-500">Tindakan ini tidak dapat dibatalkan</p>
                </div>
              </div>
              <button
                onClick={() => setDeleteModalRecord(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Record Details */}
            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Pegawai:</span>
                <span className="font-bold text-neutral-900">{deleteModalRecord.employee_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Divisi & Shift:</span>
                <span className="font-semibold text-neutral-800">
                  {deleteModalRecord.category}{' '}
                  {deleteModalRecord.shift
                    ? `• ${getSecurityShiftDisplayLabel(deleteModalRecord.shift, deleteModalRecord.work_date)}`
                    : ''}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Tipe Absensi:</span>
                <span className="font-semibold text-neutral-800 capitalize">
                  {deleteModalRecord.attendance_type}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Waktu Tercatat:</span>
                <span className="font-mono font-bold text-neutral-900">
                  {formatReviewWorkDate(deleteModalRecord)} •{' '}
                  {formatReviewTime(deleteModalRecord.recorded_at)}
                </span>
              </div>
              {deleteModalRecord.reason && (
                <div className="pt-1.5 border-t border-neutral-200">
                  <span className="text-neutral-500">Alasan Karyawan:</span>
                  <p className="mt-0.5 font-medium text-neutral-800">
                    &ldquo;{deleteModalRecord.reason}&rdquo;
                  </p>
                </div>
              )}
            </div>

            {/* Reason Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-800">
                Alasan Penghapusan oleh Admin <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Contoh: Data duplikat, presensi tidak valid, permintaan HR..."
                value={deleteReason}
                onChange={(e) => {
                  setDeleteReason(e.target.value)
                  setDeleteError(null)
                }}
                className="form-input text-xs py-2 resize-none w-full"
              />
              {deleteError && (
                <p className="text-xs text-red-600 font-medium">{deleteError}</p>
              )}
              <p className="text-[10px] text-neutral-400">
                Alasan ini akan direkam dalam log audit secara permanen sebelum penghapusan.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setDeleteModalRecord(null)}
                className="btn-secondary text-xs py-2 px-4"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteRecord}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Hapus Permanen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
