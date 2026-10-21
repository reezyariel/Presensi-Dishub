// ============================================================
// ShiftTrack — Daftar Absensi Page (Enterprise Desktop Layout)
// Full Desktop Toolbar, Comprehensive Filters, Wide Data Table, Excel Export
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Filter, Eye, X, ChevronLeft, ChevronRight,
  AlertCircle, RefreshCw, Calendar, Download, ChevronDown
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  AttendanceStatusBadge,
  CategoryBadge,
  AttendanceTypeBadge,
  ReviewStatusBadge,
} from '../../components/admin/StatusBadges'
import { formatJakartaTime, todayJakarta, formatJakartaDate } from '../../lib/scheduleEngine'
import { exportRecapToExcel } from '../../lib/exportExcel'
import type { AttendanceRecord, AttendanceFilters } from '../../types/attendance'

const PAGE_SIZE = 20

const defaultFilters: AttendanceFilters = {
  date_from: '',
  date_to: '',
  name: '',
  category: '',
  shift: '',
  attendance_type: '',
  attendance_status: '',
  review_status: '',
}

export default function AttendanceListPage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<AttendanceFilters>({
    ...defaultFilters,
    date_from: todayJakarta(),
    date_to: todayJakarta(),
  })
  const [showFilters, setShowFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [allTimeCount, setAllTimeCount] = useState<number | null>(null)

  const isTodayOnly = filters.date_from === todayJakarta() && filters.date_to === todayJakarta()
  const isAllDates = !filters.date_from && !filters.date_to

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      let q = supabase
        .from('attendance_records')
        .select('*', { count: 'exact' })
        .order('recorded_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (filters.date_from) q = q.gte('work_date', filters.date_from)
      if (filters.date_to) q = q.lte('work_date', filters.date_to)
      if (filters.name) q = q.ilike('employee_name', `%${filters.name}%`)
      if (filters.category) q = q.eq('category', filters.category)
      if (filters.shift) q = q.eq('shift', filters.shift)
      if (filters.attendance_type) q = q.eq('attendance_type', filters.attendance_type)
      if (filters.attendance_status) q = q.eq('attendance_status', filters.attendance_status)
      if (filters.review_status) q = q.eq('review_status', filters.review_status)

      const { data, count, error } = await q
      if (error) {
        console.error('[ShiftTrack] Failed to load attendance records:', error.message)
        setErrorMessage(error.message || 'Gagal memuat catatan absensi dari server.')
        setRecords([])
        setTotal(0)
        return
      }

      setErrorMessage(null)
      setRecords((data ?? []) as AttendanceRecord[])
      setTotal(count ?? 0)

      // Check if DB has records overall if current filter yields 0
      if ((count ?? 0) === 0 && (filters.date_from || filters.date_to)) {
        const { count: totalDbCount } = await supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
        setAllTimeCount(totalDbCount ?? 0)
      } else {
        setAllTimeCount(null)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data.'
      setErrorMessage(msg)
    } finally {
      setIsLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    loadData()
  }, [loadData])

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
    setFilters({ ...defaultFilters })
    setSearchInput('')
    setPage(0)
  }

  const handleExport = async () => {
    if (records.length === 0) return
    setIsExporting(true)
    try {
      const filename = `ShiftTrack_Presensi_${filters.date_from || 'Semua'}_sd_${filters.date_to || 'Semua'}`
      await exportRecapToExcel(records, filename)
    } catch {
      alert('Gagal mengekspor laporan excel.')
    } finally {
      setIsExporting(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
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

      {/* Desktop Toolbar Card */}
      <div className="card p-5 space-y-4">
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
            <button type="submit" className="btn-primary py-2.5 px-4 text-xs">
              Cari
            </button>
          </form>

          {/* Right: Quick Presets, Filter Toggle & Export Button */}
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

            {/* Export Excel */}
            <button
              onClick={handleExport}
              disabled={isExporting || records.length === 0}
              className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 disabled:opacity-50"
              title="Unduh catatan saat ini ke Excel"
            >
              <Download size={14} />
              <span>{isExporting ? 'Mengekspor...' : 'Ekspor Excel'}</span>
            </button>

            {/* Reset Filter if active */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="btn-secondary text-neutral-600 hover:text-black text-xs py-2 px-3 flex items-center gap-1"
                title="Hapus semua filter"
              >
                <X size={14} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Expanded Desktop Filters Panel */}
        {showFilters && (
          <div className="pt-4 border-t border-neutral-100 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs animate-fade-in">
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
              <label className="form-label text-[11px]">Divisi</label>
              <select
                value={filters.category}
                onChange={e => { setFilters(f => ({ ...f, category: e.target.value as '' })); setPage(0) }}
                className="form-input text-xs py-1.5"
              >
                <option value="">Semua Divisi</option>
                <option value="CS">Cleaning Service (CS)</option>
                <option value="Security">Security</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="form-label text-[11px]">Shift</label>
              <select
                value={filters.shift}
                onChange={e => { setFilters(f => ({ ...f, shift: e.target.value as '' })); setPage(0) }}
                className="form-input text-xs py-1.5"
              >
                <option value="">Semua Shift</option>
                <option value="Shift I">Shift I</option>
                <option value="Shift II">Shift II</option>
                <option value="Shift III">Shift III</option>
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

      {/* Main Desktop Data Table Card */}
      <div className="card overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
              Data Catatan Presensi
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 text-neutral-800 font-mono">
              {total} Catatan
            </span>
          </div>
          <span className="text-xs text-neutral-500">
            Halaman {page + 1} dari {totalPages || 1}
          </span>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-[11px] uppercase tracking-wider font-semibold">
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
                  <td colSpan={9} className="text-center py-16 text-neutral-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Memuat data absensi...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-neutral-400">
                    <p className="font-semibold text-neutral-700 text-sm">Tidak ada catatan absensi yang ditemukan.</p>
                    <p className="text-xs text-neutral-400 mt-1">Coba sesuaikan kata kunci pencarian atau tanggal filter.</p>
                    {activeFilterCount > 0 && (
                      <button onClick={clearFilters} className="btn-secondary text-xs mt-3 mx-auto">
                        Reset Semua Filter
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                records.map(rec => (
                  <tr key={rec.id} className="hover:bg-neutral-50/80 transition-colors">
                    {/* Pegawai */}
                    <td className="px-5 py-3.5 font-semibold text-neutral-900">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-900 flex items-center justify-center font-bold text-xs flex-shrink-0">
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
                        <span className="px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200 text-neutral-700 text-[11px] font-medium">
                          {rec.shift}
                        </span>
                      ) : (
                        <span className="text-neutral-400 font-mono">-</span>
                      )}
                    </td>

                    {/* Tanggal Kerja */}
                    <td className="px-4 py-3.5 text-neutral-700 font-medium">
                      {formatJakartaDate(rec.work_date)}
                    </td>

                    {/* Waktu Tercatat */}
                    <td className="px-4 py-3.5 font-mono text-neutral-700">
                      {rec.recorded_at ? formatJakartaTime(new Date(rec.recorded_at)) : '--:--'}
                      {rec.late_minutes > 0 && (
                        <span className="block text-[10px] text-neutral-500">
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

                    {/* Aksi */}
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/admin/attendance/${rec.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-700 hover:text-black hover:border-neutral-900 hover:bg-neutral-50 transition-all font-semibold text-[11px]"
                      >
                        <Eye size={12} />
                        <span>Detail</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Desktop Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between bg-neutral-50/50">
            <span className="text-xs text-neutral-500">
              Menampilkan {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, total)} dari {total} data
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
    </div>
  )
}
