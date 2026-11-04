// ============================================================
// SIPATEN — Daftar Absensi Page (Enterprise Desktop Layout)
// Restructured CS Table (1 row per employee per work date)
// Preserved Security Table (Per transaction format)
// Real Selfie Photos, Lazy Loading, Modals & Excel/PDF Exports
// ============================================================

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Search, Filter, Eye, X, ChevronLeft, ChevronRight,
  AlertCircle, RefreshCw, Calendar, Download, ChevronDown,
  FileText, Shield, Sparkles
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  AttendanceStatusBadge,
  CategoryBadge,
  AttendanceTypeBadge,
  ReviewStatusBadge,
} from '../../components/admin/StatusBadges'
import { formatJakartaTime, todayJakarta, formatJakartaDate } from '../../lib/scheduleEngine'
import {
  formatSecurityDisplayDate,
  getPreviousCalendarDate,
  subtractCalendarDays,
  isSecurityOvernightCheckoutInRange,
  mergeAndDeduplicateAttendance,
} from '../../lib/securityDateDisplay'
import { exportAttendanceListExcel } from '../../lib/exportExcel'
import { exportAttendanceListPdf } from '../../lib/exportPdf'
import { groupCSRecords, filterCSGroups } from '../../lib/attendanceGrouping'
import AttendanceSelfieThumbnail from '../../components/common/AttendanceSelfieThumbnail'
import PhotoPreviewModal from '../../components/admin/PhotoPreviewModal'
import CSAttendanceDetailModal from '../../components/admin/CSAttendanceDetailModal'
import SecurityAttendanceDetailModal from '../../components/admin/SecurityAttendanceDetailModal'
import type { AttendanceRecord, AttendanceFilters, CSGroupedAttendance } from '../../types/attendance'

const PAGE_SIZE = 20

const defaultFilters: AttendanceFilters = {
  date_from: '',
  date_to: '',
  name: '',
  category: 'CS', // Default to CS per client specification
  shift: '',
  attendance_type: '',
  attendance_status: '',
  review_status: '',
}

export default function AttendanceListPage() {
  const [filters, setFilters] = useState<AttendanceFilters>({
    ...defaultFilters,
    date_from: todayJakarta(),
    date_to: todayJakarta(),
  })

  // Raw records loaded from database (merged regular + qualifying H+1)
  const [rawRecords, setRawRecords] = useState<AttendanceRecord[]>([])
  const [page, setPage] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [allTimeCount, setAllTimeCount] = useState<number | null>(null)

  // Modals state
  const [activePhotoRecord, setActivePhotoRecord] = useState<AttendanceRecord | null>(null)
  const [activeCSModalGroup, setActiveCSModalGroup] = useState<CSGroupedAttendance | null>(null)
  const [activeSecurityModalRecord, setActiveSecurityModalRecord] = useState<AttendanceRecord | null>(null)

  const isTodayOnly = filters.date_from === todayJakarta() && filters.date_to === todayJakarta()
  const isAllDates = !filters.date_from && !filters.date_to

  // ─────────────────────────────────────────────────────────────
  // Data Fetching
  // ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Determine effective date bounds.
      // If no date range is specified, default to the last 30 days to avoid unbounded
      // payloads while keeping complete groupings for CS and full shifts for Security.
      let effectiveDateFrom = filters.date_from
      let effectiveDateTo = filters.date_to

      if (!effectiveDateFrom && !effectiveDateTo) {
        // "Semua Tanggal": use current Asia/Jakarta date and subtract 30 calendar days
        // using UTC arithmetic to remain 100% immune to local browser timezone drift.
        effectiveDateTo = todayJakarta()
        effectiveDateFrom = subtractCalendarDays(effectiveDateTo, 30)
      }

      // ─────────────────────────────────────────────────────────
      // QUERY A: Regular attendance records in [effectiveDateFrom, effectiveDateTo]
      // ─────────────────────────────────────────────────────────
      let qReg = supabase
        .from('attendance_records')
        .select('*')
        .order('work_date', { ascending: false })
        .order('recorded_at', { ascending: false })

      if (filters.category) qReg = qReg.eq('category', filters.category)
      if (effectiveDateFrom) qReg = qReg.gte('work_date', effectiveDateFrom)
      if (effectiveDateTo) qReg = qReg.lte('work_date', effectiveDateTo)
      if (filters.name) qReg = qReg.ilike('employee_name', `%${filters.name}%`)
      if (filters.shift) qReg = qReg.eq('shift', filters.shift)
      if (filters.attendance_type) qReg = qReg.eq('attendance_type', filters.attendance_type)
      if (filters.attendance_status) qReg = qReg.eq('attendance_status', filters.attendance_status)
      if (filters.review_status) qReg = qReg.eq('review_status', filters.review_status)

      const { data: regularData, error: regError } = await qReg
      if (regError) throw regError
      const regularRecords = (regularData ?? []) as AttendanceRecord[]

      // ─────────────────────────────────────────────────────────
      // QUERY B: Additional Security H+1 Pulang transactions from prev day
      // ─────────────────────────────────────────────────────────
      let qualifyingH1Records: AttendanceRecord[] = []

      // Only query H+1 if:
      // 1. Not filtering exclusively for CS
      // 2. An effective start date exists (so there is a preceding day to check)
      // 3. User didn't filter exclusively for 'masuk' or 'istirahat' (since H+1 is always 'pulang')
      const canHaveH1 =
        filters.category !== 'CS' &&
        Boolean(effectiveDateFrom) &&
        filters.attendance_type !== 'masuk' &&
        filters.attendance_type !== 'istirahat'

      if (canHaveH1 && effectiveDateFrom) {
        const prevDate = getPreviousCalendarDate(effectiveDateFrom)

        let qH1 = supabase
          .from('attendance_records')
          .select('*')
          .eq('category', 'Security')
          .eq('attendance_type', 'pulang')
          .eq('work_date', prevDate)

        if (filters.name) qH1 = qH1.ilike('employee_name', `%${filters.name}%`)
        if (filters.shift) qH1 = qH1.eq('shift', filters.shift)
        if (filters.attendance_status) qH1 = qH1.eq('attendance_status', filters.attendance_status)
        if (filters.review_status) qH1 = qH1.eq('review_status', filters.review_status)

        const { data: h1Data, error: h1Error } = await qH1
        if (h1Error) {
          throw new Error(`Gagal memuat transaksi Pulang Security (H+1): ${h1Error.message}`)
        }
        const candidates = (h1Data ?? []) as AttendanceRecord[]
        // Strictly filter only qualifying overnight checkouts whose display date is in range
        qualifyingH1Records = candidates.filter(r =>
          isSecurityOvernightCheckoutInRange(r, effectiveDateFrom, effectiveDateTo)
        )
      }

      // ─────────────────────────────────────────────────────────
      // MERGE & DEDUPLICATE
      // ─────────────────────────────────────────────────────────
      const combinedRecords = mergeAndDeduplicateAttendance(regularRecords, qualifyingH1Records)

      setErrorMessage(null)
      setRawRecords(combinedRecords)

      // DB count check if zero
      if (combinedRecords.length === 0 && (filters.date_from || filters.date_to)) {
        const { count: dbCount } = await supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
        setAllTimeCount(dbCount ?? 0)
      } else {
        setAllTimeCount(null)
      }
    } catch (err: unknown) {
      console.error('[SIPATEN] Failed to load attendance records:', err)
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data.'
      setErrorMessage(msg)
      setRawRecords([])
    } finally {
      setIsLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─────────────────────────────────────────────────────────────
  // CS Grouping & Pagination Derivation
  // ─────────────────────────────────────────────────────────────
  const csGroups = useMemo(() => {
    if (filters.category === 'Security') return []
    const groups = groupCSRecords(rawRecords)
    return filterCSGroups(groups, {
      name: filters.name,
      attendance_type: filters.attendance_type,
      attendance_status: filters.attendance_status,
      review_status: filters.review_status,
    })
  }, [rawRecords, filters])

  // Paginated CS groups
  const paginatedCSGroups = useMemo(() => {
    const start = page * PAGE_SIZE
    return csGroups.slice(start, start + PAGE_SIZE)
  }, [csGroups, page])

  // Security records for display
  const securityRecords = useMemo(() => {
    if (filters.category === 'CS') return []
    return rawRecords.filter(r => r.category === 'Security')
  }, [rawRecords, filters.category])

  // Paginated Security records
  const paginatedSecurityRecords = useMemo(() => {
    const start = page * PAGE_SIZE
    return securityRecords.slice(start, start + PAGE_SIZE)
  }, [securityRecords, page])

  // Compute active pagination counts
  const currentTotal = filters.category === 'CS'
    ? csGroups.length
    : filters.category === 'Security'
    ? securityRecords.length
    : csGroups.length + securityRecords.length

  const totalPages = Math.max(1, Math.ceil(currentTotal / PAGE_SIZE))

  // ─────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilters(f => ({ ...f, name: searchInput }))
    setPage(0)
  }

  const setFilterToday = () => {
    setFilters(f => ({ ...f, date_from: todayJakarta(), date_to: todayJakarta() }))
    setPage(0)
  }

  const setFilterAllDates = () => {
    setFilters(f => ({ ...f, date_from: '', date_to: '' }))
    setPage(0)
  }

  const clearFilters = () => {
    setFilters({ ...defaultFilters, category: filters.category })
    setSearchInput('')
    setPage(0)
  }

  const handleExportExcel = async () => {
    if (rawRecords.length === 0 && csGroups.length === 0) return
    setIsExportingExcel(true)
    try {
      const filename = `SIPATEN_Presensi_${filters.category || 'Semua'}_${filters.date_from || 'Semua'}_sd_${filters.date_to || 'Semua'}`
      await exportAttendanceListExcel(rawRecords, filename)
    } catch (e) {
      console.error(e)
      alert('Gagal mengekspor laporan excel.')
    } finally {
      setIsExportingExcel(false)
    }
  }

  const handleExportPdf = async () => {
    if (rawRecords.length === 0 && csGroups.length === 0) return
    setIsExportingPdf(true)
    try {
      const filename = `SIPATEN_Presensi_${filters.category || 'Semua'}_${filters.date_from || 'Semua'}_sd_${filters.date_to || 'Semua'}.pdf`
      await exportAttendanceListPdf(
        rawRecords,
        `Laporan Data Presensi Pegawai (${filters.category || 'Semua Divisi'})`,
        filename
      )
    } catch (e) {
      console.error(e)
      alert('Gagal mengekspor laporan PDF.')
    } finally {
      setIsExportingPdf(false)
    }
  }

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
    if (k === 'category' && v === 'CS') return false
    if (k === 'date_from' && v === todayJakarta() && filters.date_to === todayJakarta()) return false
    if (k === 'date_to' && v === todayJakarta() && filters.date_from === todayJakarta()) return false
    return Boolean(v)
  }).length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-neutral-100 border border-neutral-300 text-neutral-900 p-4 rounded-2xl flex items-start justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-neutral-900 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-neutral-900">Gagal Mengambil Data Absensi</h4>
              <p className="text-xs text-neutral-600 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={() => loadData()}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <RefreshCw size={13} />
            <span>Coba Lagi</span>
          </button>
        </div>
      )}

      {/* Date Filter Context Alert */}
      {!errorMessage && allTimeCount !== null && allTimeCount > 0 && (
        <div className="bg-neutral-100 border border-neutral-200 text-neutral-800 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-neutral-600 flex-shrink-0" />
            <span>
              Tidak ada catatan absensi untuk tanggal yang dipilih, tetapi terdapat <strong className="font-semibold text-neutral-900">{allTimeCount} catatan absensi</strong> pada tanggal lain di database.
            </span>
          </div>
          <button
            onClick={setFilterAllDates}
            className="btn-secondary text-xs py-1 px-3 bg-white font-semibold flex-shrink-0"
          >
            Tampilkan Semua Tanggal
          </button>
        </div>
      )}

      {/* Division Selector & Desktop Toolbar Card */}
      <div className="card p-5 space-y-4">
        {/* Top Division Tab Switcher */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => { setFilters(f => ({ ...f, category: 'CS' })); setPage(0) }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                filters.category === 'CS'
                  ? 'bg-white text-emerald-800 shadow-2xs border border-neutral-200/80'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Sparkles size={14} className={filters.category === 'CS' ? 'text-emerald-700' : 'text-neutral-400'} />
              <span>Cleaning Service (CS)</span>
            </button>

            <button
              type="button"
              onClick={() => { setFilters(f => ({ ...f, category: 'Security' })); setPage(0) }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                filters.category === 'Security'
                  ? 'bg-white text-neutral-900 shadow-2xs border border-neutral-200/80'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Shield size={14} className={filters.category === 'Security' ? 'text-neutral-900' : 'text-neutral-400'} />
              <span>Security (Format Asli)</span>
            </button>

            <button
              type="button"
              onClick={() => { setFilters(f => ({ ...f, category: '' })); setPage(0) }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filters.category === ''
                  ? 'bg-white text-neutral-900 shadow-2xs border border-neutral-200/80'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Semua Divisi
            </button>
          </div>

          <div className="text-xs text-neutral-500 font-medium self-end sm:self-center">
            {filters.category === 'CS' && (
              <span className="text-emerald-800 bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 rounded-lg">
                Mode 1 Baris Per Pegawai Per Tanggal Kerja Aktif
              </span>
            )}
            {filters.category === 'Security' && (
              <span className="text-neutral-700 bg-neutral-100 border border-neutral-200 px-2.5 py-1 rounded-lg">
                Mode Transaksi Shift Individual Aktif
              </span>
            )}
          </div>
        </div>

        {/* Search, Date Presets & Export Actions */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Left: Search input */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Cari nama karyawan..."
                className="form-input pl-10 text-xs py-2.5"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('')
                    setFilters(f => ({ ...f, name: '' }))
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button type="submit" className="btn-primary py-2.5 px-4 text-xs font-semibold">
              Cari
            </button>
          </form>

          {/* Right: Date Presets & Export */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Quick Date Presets */}
            <div className="inline-flex rounded-xl border border-neutral-200 bg-neutral-100/80 p-0.5 text-xs">
              <button
                type="button"
                onClick={setFilterToday}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  isTodayOnly ? 'bg-neutral-900 text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={setFilterAllDates}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  isAllDates ? 'bg-neutral-900 text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Semua Tanggal
              </button>
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-secondary text-xs py-2 px-3 relative flex items-center gap-1.5 ${
                showFilters ? 'bg-neutral-100 border-neutral-300 text-black' : ''
              }`}
            >
              <Filter size={14} />
              <span>Filter Lanjutan</span>
              <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 bg-neutral-900 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Export Buttons */}
            <button
              onClick={handleExportExcel}
              disabled={isExportingExcel || (rawRecords.length === 0 && csGroups.length === 0)}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 disabled:opacity-50"
              title="Unduh laporan ke file Excel dengan foto selfie tersemat"
            >
              <Download size={14} />
              <span>{isExportingExcel ? 'Mengekspor...' : 'Excel'}</span>
            </button>

            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || (rawRecords.length === 0 && csGroups.length === 0)}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 disabled:opacity-50"
              title="Unduh laporan ke file PDF resmi dengan foto selfie tersemat"
            >
              <FileText size={14} />
              <span>{isExportingPdf ? 'Mengekspor...' : 'PDF'}</span>
            </button>

            {/* Reset Filter if active */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="btn-secondary text-neutral-600 hover:text-black text-xs py-2 px-2.5 flex items-center gap-1"
                title="Hapus semua filter"
              >
                <X size={14} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Expanded Filters Panel */}
        {showFilters && (
          <div className="pt-4 border-t border-neutral-100 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs animate-fade-in">
            <div className="space-y-1">
              <label className="form-label text-[11px]">Dari Tanggal</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={e => { setFilters(f => ({ ...f, date_from: e.target.value })); setPage(0) }}
                className="form-input text-xs py-1.5"
              />
            </div>

            <div className="space-y-1">
              <label className="form-label text-[11px]">Sampai Tanggal</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={e => { setFilters(f => ({ ...f, date_to: e.target.value })); setPage(0) }}
                className="form-input text-xs py-1.5"
              />
            </div>

            <div className="space-y-1">
              <label className="form-label text-[11px]">Shift (Khusus Security)</label>
              <select
                value={filters.shift}
                onChange={e => { setFilters(f => ({ ...f, shift: e.target.value as '' })); setPage(0) }}
                className="form-input text-xs py-1.5"
              >
                <option value="">Semua Shift</option>
                <option value="Shift I">Shift I (Weekday)</option>
                <option value="Shift II">Shift II (Weekday)</option>
                <option value="Shift III">Shift III (Weekday)</option>
                <option value="Sesi Pagi">Sesi Pagi (Weekend)</option>
                <option value="Sesi Malam">Sesi Malam (Weekend)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="form-label text-[11px]">Tipe Presensi</label>
              <select
                value={filters.attendance_type}
                onChange={e => { setFilters(f => ({ ...f, attendance_type: e.target.value as '' })); setPage(0) }}
                className="form-input text-xs py-1.5"
              >
                <option value="">Semua Tipe</option>
                <option value="masuk">Masuk</option>
                <option value="istirahat">Istirahat</option>
                <option value="pulang">Pulang</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="form-label text-[11px]">Status Waktu</label>
              <select
                value={filters.attendance_status}
                onChange={e => { setFilters(f => ({ ...f, attendance_status: e.target.value as '' })); setPage(0) }}
                className="form-input text-xs py-1.5"
              >
                <option value="">Semua Status</option>
                <option value="tepat_waktu">Tepat Waktu</option>
                <option value="terlambat">Terlambat</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="form-label text-[11px]">Status Review</label>
              <select
                value={filters.review_status}
                onChange={e => { setFilters(f => ({ ...f, review_status: e.target.value as '' })); setPage(0) }}
                className="form-input text-xs py-1.5"
              >
                <option value="">Semua Status</option>
                <option value="belum_diperiksa">Belum Diperiksa</option>
                <option value="sudah_diperiksa">Sudah Diperiksa</option>
                <option value="perlu_tindak_lanjut">Perlu Tindak Lanjut</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Main Data Table Card */}
      <div className="card overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
              {filters.category === 'CS'
                ? 'Daftar Presensi Cleaning Service (CS)'
                : filters.category === 'Security'
                ? 'Daftar Presensi Security (Per Transaksi)'
                : 'Daftar Presensi Pegawai'}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 text-neutral-800 font-mono">
              {currentTotal} {filters.category === 'CS' ? 'Hari Kerja' : 'Catatan'}
            </span>
          </div>
          <span className="text-xs text-neutral-500">
            Halaman {page + 1} dari {totalPages}
          </span>
        </div>

        {/* ───────────────────────────────────────────────────────── */}
        {/* VIEW 1: CLEANING SERVICE TABLE (1 ROW PER EMPLOYEE PER DATE) */}
        {/* ───────────────────────────────────────────────────────── */}
        {filters.category === 'CS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="px-5 py-3.5 font-semibold">Foto / Pegawai</th>
                  <th className="px-4 py-3.5 font-semibold">Tanggal Kerja</th>
                  <th className="px-4 py-3.5 font-semibold">Jam Masuk</th>
                  <th className="px-4 py-3.5 font-semibold">Jam Istirahat</th>
                  <th className="px-4 py-3.5 font-semibold">Jam Pulang</th>
                  <th className="px-4 py-3.5 font-semibold text-center">Status Presensi</th>
                  <th className="px-4 py-3.5 font-semibold text-center">Status Review</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-neutral-400">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs">Memuat data absensi CS...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedCSGroups.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-neutral-400">
                      <p className="font-semibold text-neutral-700 text-sm">Tidak ada catatan presensi CS yang ditemukan.</p>
                      <p className="text-xs text-neutral-400 mt-1">Coba sesuaikan kata kunci pencarian atau tanggal filter.</p>
                      {activeFilterCount > 0 && (
                        <button onClick={clearFilters} className="btn-secondary text-xs mt-3 mx-auto">
                          Reset Semua Filter
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedCSGroups.map(group => (
                    <tr key={group.id} className="hover:bg-neutral-50/80 transition-colors">
                      {/* 1. Foto / Pegawai */}
                      <td className="px-5 py-3.5 font-semibold text-neutral-900">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {group.employee_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="block font-semibold text-neutral-900 leading-snug">
                              {group.employee_name}
                            </span>
                            <span className="block text-[10px] text-neutral-400 font-mono">
                              CS • ID: {group.employee_id.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Tanggal Kerja */}
                      <td className="px-4 py-3.5 text-neutral-700 font-medium">
                        {formatJakartaDate(group.work_date)}
                      </td>

                      {/* 3. Jam Masuk (with selfie thumbnail + status indicator) */}
                      <td className="px-4 py-3.5">
                        {group.masuk ? (
                          <div className="flex items-center gap-2.5">
                            <AttendanceSelfieThumbnail
                              storagePath={group.masuk.selfie_storage_path}
                              alt={`Masuk ${group.employee_name}`}
                              size="md"
                              onClick={() => setActivePhotoRecord(group.masuk)}
                            />
                            <div>
                              <span
                                className={`font-mono font-bold text-xs block ${
                                  group.masuk.attendance_status === 'tepat_waktu'
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {formatJakartaTime(group.masuk.recorded_at)}
                              </span>
                              {group.masuk.late_minutes > 0 ? (
                                <span className="text-[10px] text-amber-600 font-medium block">
                                  +{group.masuk.late_minutes} mnt
                                </span>
                              ) : (
                                <span className="text-[10px] text-emerald-600 font-medium block">
                                  Tepat Waktu
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-neutral-400">
                            <AttendanceSelfieThumbnail storagePath={null} size="md" />
                            <div>
                              <span className="font-mono text-neutral-400 text-xs block">-</span>
                              <span className="text-[10px] text-neutral-400 font-medium">Belum Absen</span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 4. Jam Istirahat (with selfie thumbnail + status indicator) */}
                      <td className="px-4 py-3.5">
                        {group.istirahat ? (
                          <div className="flex items-center gap-2.5">
                            <AttendanceSelfieThumbnail
                              storagePath={group.istirahat.selfie_storage_path}
                              alt={`Istirahat ${group.employee_name}`}
                              size="md"
                              onClick={() => setActivePhotoRecord(group.istirahat)}
                            />
                            <div>
                              <span className="font-mono font-bold text-xs block text-neutral-800">
                                {formatJakartaTime(group.istirahat.recorded_at)}
                              </span>
                              <span className="text-[10px] text-neutral-500 font-medium block">
                                Selesai
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-neutral-400">
                            <AttendanceSelfieThumbnail storagePath={null} size="md" />
                            <div>
                              <span className="font-mono text-neutral-400 text-xs block">-</span>
                              <span className="text-[10px] text-neutral-400 font-medium">Belum Absen</span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 5. Jam Pulang (with selfie thumbnail + status indicator) */}
                      <td className="px-4 py-3.5">
                        {group.pulang ? (
                          <div className="flex items-center gap-2.5">
                            <AttendanceSelfieThumbnail
                              storagePath={group.pulang.selfie_storage_path}
                              alt={`Pulang ${group.employee_name}`}
                              size="md"
                              onClick={() => setActivePhotoRecord(group.pulang)}
                            />
                            <div>
                              <span className="font-mono font-bold text-xs block text-neutral-800">
                                {formatJakartaTime(group.pulang.recorded_at)}
                              </span>
                              <span className="text-[10px] text-neutral-500 font-medium block">
                                Selesai
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-neutral-400">
                            <AttendanceSelfieThumbnail storagePath={null} size="md" />
                            <div>
                              <span className="font-mono text-neutral-400 text-xs block">-</span>
                              <span className="text-[10px] text-neutral-400 font-medium">Belum Absen</span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 6. Status Presensi */}
                      <td className="px-4 py-3.5 text-center">
                        <AttendanceStatusBadge status={group.overall_attendance_status} />
                      </td>

                      {/* 7. Status Review */}
                      <td className="px-4 py-3.5 text-center">
                        <ReviewStatusBadge status={group.overall_review_status} />
                      </td>

                      {/* 8. Aksi (Option UI 2: 1 Detail button opens 3-part modal) */}
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setActiveCSModalGroup(group)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-700 hover:text-black hover:border-neutral-900 hover:bg-neutral-50 transition-all font-semibold text-[11px]"
                          title="Lihat rincian lengkap 3 sesi absensi pegawai"
                        >
                          <Eye size={12} />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────── */}
        {/* VIEW 2: SECURITY TABLE (FORMAT LAMA: 1 ROW PER TRANSACTION) */}
        {/* ───────────────────────────────────────────────────────── */}
        {filters.category === 'Security' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="px-4 py-3.5 font-semibold text-center">Foto Selfie</th>
                  <th className="px-5 py-3.5 font-semibold">Pegawai</th>
                  <th className="px-4 py-3.5 font-semibold">Divisi</th>
                  <th className="px-4 py-3.5 font-semibold">Tipe Absen</th>
                  <th className="px-4 py-3.5 font-semibold">Shift</th>
                  <th className="px-4 py-3.5 font-semibold">Tanggal Kerja</th>
                  <th className="px-4 py-3.5 font-semibold">Waktu Tercatat</th>
                  <th className="px-4 py-3.5 font-semibold text-center">Ketepatan</th>
                  <th className="px-4 py-3.5 font-semibold text-center">Status Review</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-neutral-400">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs">Memuat transaksi Security...</span>
                      </div>
                    </td>
                  </tr>
                ) : securityRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-neutral-400">
                      <p className="font-semibold text-neutral-700 text-sm">Tidak ada transaksi Security yang ditemukan.</p>
                      <p className="text-xs text-neutral-400 mt-1">Coba sesuaikan kata kunci pencarian atau tanggal filter.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedSecurityRecords.map(rec => (
                    <tr key={rec.id} className="hover:bg-neutral-50/80 transition-colors">
                      {/* Foto Selfie Asli */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex justify-center">
                          <AttendanceSelfieThumbnail
                            storagePath={rec.selfie_storage_path}
                            alt={`Selfie ${rec.employee_name}`}
                            size="md"
                            onClick={() => setActivePhotoRecord(rec)}
                          />
                        </div>
                      </td>

                      {/* Pegawai */}
                      <td className="px-5 py-3.5 font-semibold text-neutral-900">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {rec.employee_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="block font-semibold text-neutral-900 leading-snug">
                              {rec.employee_name}
                            </span>
                            <span className="block text-[10px] text-neutral-400 font-mono">
                              ID: {rec.id.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Divisi */}
                      <td className="px-4 py-3.5">
                        <CategoryBadge category={rec.category} />
                      </td>

                      {/* Tipe Absen */}
                      <td className="px-4 py-3.5">
                        <AttendanceTypeBadge type={rec.attendance_type} />
                      </td>

                      {/* Shift */}
                      <td className="px-4 py-3.5">
                        {rec.shift ? (
                          <span className="px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200 text-neutral-800 text-[11px] font-bold">
                            {rec.shift}
                          </span>
                        ) : (
                          <span className="text-neutral-400 font-mono">-</span>
                        )}
                      </td>

                      {/* Tanggal Kerja */}
                      <td className="px-4 py-3.5 text-neutral-700 font-medium">
                        {formatSecurityDisplayDate(rec.work_date, rec.shift, rec.attendance_type, rec.category)}
                      </td>

                      {/* Waktu Tercatat */}
                      <td className="px-4 py-3.5 font-mono text-neutral-700">
                        {rec.recorded_at ? formatJakartaTime(rec.recorded_at) : '--:--'}
                        {rec.late_minutes > 0 && (
                          <span className="block text-[10px] text-amber-600 font-sans font-semibold">
                            +{rec.late_minutes} mnt
                          </span>
                        )}
                      </td>

                      {/* Ketepatan Waktu */}
                      <td className="px-4 py-3.5 text-center">
                        <AttendanceStatusBadge status={rec.attendance_status} />
                      </td>

                      {/* Status Review */}
                      <td className="px-4 py-3.5 text-center">
                        <ReviewStatusBadge status={rec.review_status} />
                      </td>

                      {/* Aksi Detail */}
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setActiveSecurityModalRecord(rec)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-700 hover:text-black hover:border-neutral-900 hover:bg-neutral-50 transition-all font-semibold text-[11px]"
                        >
                          <Eye size={12} />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────── */}
        {/* VIEW 3: SEMUA DIVISI (UNIFIED OVERVIEW) */}
        {/* ───────────────────────────────────────────────────────── */}
        {filters.category === '' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="px-4 py-3.5 font-semibold text-center">Foto</th>
                  <th className="px-5 py-3.5 font-semibold">Pegawai</th>
                  <th className="px-4 py-3.5 font-semibold">Divisi</th>
                  <th className="px-4 py-3.5 font-semibold">Format Baris</th>
                  <th className="px-4 py-3.5 font-semibold">Tanggal Kerja</th>
                  <th className="px-4 py-3.5 font-semibold text-center">Status Presensi</th>
                  <th className="px-4 py-3.5 font-semibold text-center">Status Review</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-neutral-400">
                      <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <span>Memuat data...</span>
                    </td>
                  </tr>
                ) : csGroups.length === 0 && securityRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-neutral-400">
                      Tidak ada catatan presensi yang ditemukan.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* Render CS Groups */}
                    {csGroups.slice(0, 15).map(g => (
                      <tr key={g.id} className="hover:bg-neutral-50/80 transition-colors">
                        <td className="px-4 py-3 text-center">
                          <AttendanceSelfieThumbnail
                            storagePath={g.masuk?.selfie_storage_path || g.pulang?.selfie_storage_path}
                            alt={g.employee_name}
                            size="md"
                            onClick={() => setActiveCSModalGroup(g)}
                          />
                        </td>
                        <td className="px-5 py-3 font-semibold text-neutral-900">{g.employee_name}</td>
                        <td className="px-4 py-3"><CategoryBadge category="CS" /></td>
                        <td className="px-4 py-3 text-neutral-600">
                          <span className="font-mono text-[11px]">
                            Masuk: {g.masuk ? formatJakartaTime(g.masuk.recorded_at) : '-'} | Pulang: {g.pulang ? formatJakartaTime(g.pulang.recorded_at) : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-neutral-700 font-medium">{formatJakartaDate(g.work_date)}</td>
                        <td className="px-4 py-3 text-center"><AttendanceStatusBadge status={g.overall_attendance_status} /></td>
                        <td className="px-4 py-3 text-center"><ReviewStatusBadge status={g.overall_review_status} /></td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setActiveCSModalGroup(g)}
                            className="btn-secondary text-xs py-1 px-3"
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* Render Security Transactions */}
                    {securityRecords.slice(0, 15).map(r => (
                      <tr key={r.id} className="hover:bg-neutral-50/80 transition-colors">
                        <td className="px-4 py-3 text-center">
                          <AttendanceSelfieThumbnail
                            storagePath={r.selfie_storage_path}
                            alt={r.employee_name}
                            size="md"
                            onClick={() => setActivePhotoRecord(r)}
                          />
                        </td>
                        <td className="px-5 py-3 font-semibold text-neutral-900">{r.employee_name}</td>
                        <td className="px-4 py-3"><CategoryBadge category="Security" /></td>
                        <td className="px-4 py-3 text-neutral-600">
                          <span className="font-medium text-[11px] uppercase">{r.attendance_type}</span>
                          {r.shift && <span className="ml-1 text-neutral-400">({r.shift})</span>}
                        </td>
                        <td className="px-4 py-3 text-neutral-700 font-medium">
                          {formatSecurityDisplayDate(r.work_date, r.shift, r.attendance_type, r.category)}
                        </td>
                        <td className="px-4 py-3 text-center"><AttendanceStatusBadge status={r.attendance_status} /></td>
                        <td className="px-4 py-3 text-center"><ReviewStatusBadge status={r.review_status} /></td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setActiveSecurityModalRecord(r)}
                            className="btn-secondary text-xs py-1 px-3"
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between bg-neutral-50/50">
            <span className="text-xs text-neutral-500">
              Menampilkan {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, currentTotal)} dari {currentTotal}{' '}
              {filters.category === 'CS' ? 'hari kerja pegawai' : 'data'}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                <span>Sebelumnya</span>
              </button>

              <span className="px-3 text-xs font-bold text-neutral-800 font-mono">
                {page + 1} / {totalPages}
              </span>

              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 disabled:opacity-40"
              >
                <span>Berikutnya</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* MODALS */}
      {/* ───────────────────────────────────────────────────────── */}

      {/* 1. Large Selfie Photo Preview Modal */}
      <PhotoPreviewModal
        isOpen={Boolean(activePhotoRecord)}
        onClose={() => setActivePhotoRecord(null)}
        record={activePhotoRecord}
      />

      {/* 2. CS 3-Section Daily Attendance Detail Modal (UI Option 2) */}
      <CSAttendanceDetailModal
        isOpen={Boolean(activeCSModalGroup)}
        onClose={() => setActiveCSModalGroup(null)}
        group={activeCSModalGroup}
        onPreviewPhoto={(rec) => setActivePhotoRecord(rec)}
      />

      {/* 3. Security Transaction Detail Modal */}
      <SecurityAttendanceDetailModal
        isOpen={Boolean(activeSecurityModalRecord)}
        onClose={() => setActiveSecurityModalRecord(null)}
        record={activeSecurityModalRecord}
        onPreviewPhoto={(rec) => setActivePhotoRecord(rec)}
      />
    </div>
  )
}
