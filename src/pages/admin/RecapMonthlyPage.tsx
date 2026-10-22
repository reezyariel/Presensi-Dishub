import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Calendar, FileSpreadsheet, FileText, Search,
  Award, AlertTriangle, Users, TrendingUp, RotateCcw,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { CategoryBadge } from '../../components/admin/StatusBadges'
import { exportMonthlyRecapExcel, type MonthlyEmployeeSummary } from '../../lib/exportExcel'
import { exportMonthlyRecapPdf } from '../../lib/exportPdf'
import type { AttendanceRecord, Category } from '../../types/attendance'

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

export default function RecapMonthlyPage() {
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()) // 0-indexed
  const [categoryFilter, setCategoryFilter] = useState<Category | ''>('')
  const [searchName, setSearchName] = useState<string>('')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Construct start and end of month YYYY-MM-DD
  const monthString = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`
  const startDate = `${monthString}-01`
  const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate()
  const endDate = `${monthString}-${String(lastDay).padStart(2, '0')}`
  const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`

  const loadMonthData = useCallback(async () => {
    setIsLoading(true)
    try {
      let q = supabase
        .from('attendance_records')
        .select('*')
        .gte('work_date', startDate)
        .lte('work_date', endDate)

      if (categoryFilter) {
        q = q.eq('category', categoryFilter)
      }

      const { data, error } = await q
      if (error) {
        console.error('[SIPATEN] Failed to load monthly recap:', error.message)
        setErrorMessage(error.message || 'Gagal memuat data rekap bulanan.')
        setRecords([])
        return
      }

      setErrorMessage(null)
      setRecords((data ?? []) as AttendanceRecord[])
    } catch (err: any) {
      console.error('[SIPATEN] Unexpected error loading monthly recap:', err)
      setErrorMessage(err?.message || 'Terjadi kesalahan sistem saat memuat rekap bulanan.')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate, categoryFilter])

  useEffect(() => {
    loadMonthData()
  }, [loadMonthData])

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11)
      setSelectedYear(y => y - 1)
    } else {
      setSelectedMonth(m => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0)
      setSelectedYear(y => y + 1)
    } else {
      setSelectedMonth(m => m + 1)
    }
  }

  // Aggregate by employee
  const summaries: MonthlyEmployeeSummary[] = useMemo(() => {
    const map = new Map<string, {
      name: string
      category: string
      dates: Set<string>
      tepatWaktu: number
      terlambat: number
      totalLateMinutes: number
      count: number
    }>()

    records.forEach(r => {
      const key = `${r.employee_name.trim().toLowerCase()}_${r.category}`
      let current = map.get(key)
      if (!current) {
        current = {
          name: r.employee_name,
          category: r.category,
          dates: new Set(),
          tepatWaktu: 0,
          terlambat: 0,
          totalLateMinutes: 0,
          count: 0,
        }
        map.set(key, current)
      }

      current.dates.add(r.work_date)
      current.count += 1
      if (r.attendance_status === 'tepat_waktu') {
        current.tepatWaktu += 1
      } else if (r.attendance_status === 'terlambat') {
        current.terlambat += 1
        current.totalLateMinutes += (r.late_minutes || 0)
      }
    })

    const list: MonthlyEmployeeSummary[] = Array.from(map.values()).map(item => ({
      employee_name: item.name,
      category: item.category,
      total_days: item.dates.size,
      total_tepat_waktu: item.tepatWaktu,
      total_terlambat: item.terlambat,
      total_late_minutes: item.totalLateMinutes,
      records_count: item.count,
    }))

    // Sort by employee name
    return list.sort((a, b) => a.employee_name.localeCompare(b.employee_name))
  }, [records])

  // Filtered by search
  const filteredSummaries = useMemo(() => {
    if (!searchName.trim()) return summaries
    return summaries.filter(s =>
      s.employee_name.toLowerCase().includes(searchName.toLowerCase())
    )
  }, [summaries, searchName])

  // Metrics
  const totalEmployees = summaries.length
  const totalLateCases = summaries.reduce((acc, curr) => acc + curr.total_terlambat, 0)
  const totalLateMinutes = summaries.reduce((acc, curr) => acc + curr.total_late_minutes, 0)
  const averageDays = totalEmployees > 0
    ? (summaries.reduce((acc, curr) => acc + curr.total_days, 0) / totalEmployees).toFixed(1)
    : '0'

  const handleExportExcel = async () => {
    if (filteredSummaries.length === 0) return
    setIsExporting(true)
    try {
      await exportMonthlyRecapExcel(filteredSummaries, monthLabel)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPdf = () => {
    if (filteredSummaries.length === 0) return
    exportMonthlyRecapPdf(filteredSummaries, monthLabel)
  }

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <span>Rekapitulasi</span>
            <span>/</span>
            <span className="text-neutral-900">Rekap Bulanan</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight mt-1">
            Rekap Presensi Bulanan — {monthLabel}
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Akumulasi disiplin, total kehadiran, rekap keterlambatan, dan performa jam kerja per staf.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => loadMonthData()}
            className="p-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 rounded-lg text-xs font-medium transition-colors"
            title="Segarkan Data"
          >
            <RotateCcw size={15} />
          </button>
          <button
            onClick={handleExportExcel}
            disabled={filteredSummaries.length === 0 || isExporting}
            className="px-3.5 py-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-40"
            title="Download Excel Bulanan"
          >
            <FileSpreadsheet size={15} className="text-neutral-700" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={filteredSummaries.length === 0}
            className="px-3.5 py-2 bg-neutral-900 hover:bg-black text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-40 shadow-xs"
            title="Download PDF Bulanan"
          >
            <FileText size={15} />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-rose-900">Gagal Mengambil Rekap Bulanan</h4>
              <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={() => loadMonthData()}
            className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Month Navigator & Filter Bar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Month Selector with Prev/Next buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-neutral-100/60 p-1 rounded-lg border border-neutral-200/80">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/70 rounded-md transition-colors"
              title="Bulan Sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-2 px-2">
              <Calendar size={15} className="text-neutral-500" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-neutral-900 focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>{name}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-neutral-900 focus:outline-none cursor-pointer"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleNextMonth}
              className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/70 rounded-md transition-colors"
              title="Bulan Berikutnya"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="text-xs text-neutral-500 font-medium">
            Periode: <span className="font-mono text-neutral-900 font-semibold">{startDate}</span> s/d <span className="font-mono text-neutral-900 font-semibold">{endDate}</span>
          </div>
        </div>

        {/* Division & Search Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as Category | '')}
            className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          >
            <option value="">Semua Divisi</option>
            <option value="CS">Cleaning Service (CS)</option>
            <option value="Security">Security Satpam</option>
          </select>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Cari pegawai..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900 w-44"
            />
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Total Pegawai Terdata</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800">
              <Users size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-2">{totalEmployees}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Pegawai aktif di periode ini</div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Rata-rata Kehadiran</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800">
              <Award size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-2">{averageDays} <span className="text-sm font-normal text-neutral-500">hari</span></div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Rata-rata per pegawai</div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Total Kasus Terlambat</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-2">{totalLateCases} <span className="text-sm font-normal text-neutral-500">kali</span></div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Insiden keterlambatan tercatat</div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Akumulasi Keterlambatan</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-2">{totalLateMinutes} <span className="text-sm font-normal text-neutral-500">menit</span></div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Total waktu terbuang</div>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-neutral-900">
              Matriks Kehadiran Staf — {monthLabel}
            </h2>
            <span className="text-xs text-neutral-500">
              • {filteredSummaries.length} pegawai
            </span>
          </div>
          <span className="text-xs text-neutral-500">
            Berdasarkan rekaman resmi database
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-xs text-neutral-400">
            <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Mengolah data presensi bulanan...
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
              <Calendar size={22} />
            </div>
            <div className="text-sm font-semibold text-neutral-800">
              Tidak Ada Rekapan Presensi
            </div>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Tidak ditemukan data absensi untuk periode {monthLabel}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-600 font-semibold tracking-wider uppercase text-[11px]">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4">Nama Pegawai</th>
                  <th className="py-3 px-4">Divisi</th>
                  <th className="py-3 px-4 text-center">Hari Hadir</th>
                  <th className="py-3 px-4 text-center">Tepat Waktu</th>
                  <th className="py-3 px-4 text-center">Terlambat</th>
                  <th className="py-3 px-4 text-center">Total Terlambat</th>
                  <th className="py-3 px-4 text-center">Total Catatan</th>
                  <th className="py-3 px-4">Indeks Disiplin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredSummaries.map((sum, idx) => {
                  const disciplineRate = sum.records_count > 0
                    ? Math.round((sum.total_tepat_waktu / sum.records_count) * 100)
                    : 100

                  return (
                    <tr
                      key={`${sum.employee_name}_${sum.category}`}
                      className="hover:bg-neutral-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-4 text-center font-mono text-neutral-400">
                        {idx + 1}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-xs flex-shrink-0">
                            {sum.employee_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="font-bold text-neutral-900">{sum.employee_name}</div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <CategoryBadge category={sum.category as Category} />
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-neutral-900">
                        {sum.total_days} <span className="text-[11px] font-normal text-neutral-500">hari</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-900 border border-neutral-300">
                          {sum.total_tepat_waktu}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {sum.total_terlambat > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-neutral-900 text-white">
                            {sum.total_terlambat}
                          </span>
                        ) : (
                          <span className="text-neutral-400 font-mono">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-neutral-900">
                        {sum.total_late_minutes > 0 ? (
                          <span className="bg-neutral-100 px-2 py-0.5 rounded border border-neutral-300">
                            {sum.total_late_minutes} mnt
                          </span>
                        ) : (
                          <span className="text-neutral-400 font-normal">0 mnt</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-neutral-600">
                        {sum.records_count}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-neutral-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-neutral-900 transition-all duration-300"
                              style={{ width: `${disciplineRate}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-bold text-neutral-900">
                            {disciplineRate}%
                          </span>
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
    </div>
  )
}
