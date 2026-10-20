import { useEffect, useState, useCallback } from 'react'
import {
  Calendar, FileSpreadsheet, FileText, Filter,
  Users, Shield, Headphones, CheckCircle, AlertTriangle,
  RotateCcw
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  AttendanceStatusBadge,
  CategoryBadge,
  AttendanceTypeBadge,
  ReviewStatusBadge,
} from '../../components/admin/StatusBadges'
import {
  formatJakartaTime,
  todayJakarta,
  getDayName,
} from '../../lib/scheduleEngine'
import { exportDailyRecapExcel } from '../../lib/exportExcel'
import { exportDailyRecapPdf } from '../../lib/exportPdf'
import type { AttendanceRecord, Category } from '../../types/attendance'

export default function RecapDailyPage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayJakarta())
  const [categoryFilter, setCategoryFilter] = useState<Category | ''>('')
  const [searchEmployee, setSearchEmployee] = useState('')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      let q = supabase
        .from('attendance_records')
        .select('*')
        .eq('work_date', selectedDate)
        .order('recorded_at', { ascending: true })

      if (categoryFilter) {
        q = q.eq('category', categoryFilter)
      }

      const { data, error } = await q
      if (error) {
        console.error('[ShiftTrack] Failed to load daily recap:', error.message)
        setErrorMessage(error.message || 'Gagal memuat data rekap harian.')
        setRecords([])
        return
      }

      setErrorMessage(null)
      setRecords((data ?? []) as AttendanceRecord[])
    } catch (err: any) {
      console.error('[ShiftTrack] Unexpected error loading daily recap:', err)
      setErrorMessage(err?.message || 'Terjadi kesalahan sistem saat memuat rekap.')
    } finally {
      setIsLoading(false)
    }
  }, [selectedDate, categoryFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filter records by search
  const filteredRecords = records.filter(r => {
    if (!searchEmployee.trim()) return true
    return r.employee_name.toLowerCase().includes(searchEmployee.toLowerCase())
  })

  // Statistics calculation
  const totalEmployees = new Set(records.map(r => r.employee_name)).size
  const totalCS = records.filter(r => r.category === 'CS').length
  const totalSecurity = records.filter(r => r.category === 'Security').length
  const totalTepatWaktu = records.filter(r => r.attendance_status === 'tepat_waktu').length
  const totalTerlambat = records.filter(r => r.attendance_status === 'terlambat').length

  // Quick date helper
  const setRelativeDate = (offsetDays: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  const handleExportExcel = async () => {
    if (filteredRecords.length === 0) return
    setIsExporting(true)
    try {
      await exportDailyRecapExcel(filteredRecords, selectedDate)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPdf = () => {
    if (filteredRecords.length === 0) return
    exportDailyRecapPdf(filteredRecords, selectedDate)
  }

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <span>Rekapitulasi</span>
            <span>/</span>
            <span className="text-neutral-900">Rekap Harian</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight mt-1">
            Rekap Presensi Harian
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Tinjau seluruh rekaman presensi masuk, istirahat, dan pulang staf CS serta Security pada tanggal tertentu.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => loadData()}
            className="p-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 rounded-lg text-xs font-medium transition-colors"
            title="Segarkan Data"
          >
            <RotateCcw size={15} />
          </button>
          <button
            onClick={handleExportExcel}
            disabled={filteredRecords.length === 0 || isExporting}
            className="px-3.5 py-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-40"
            title="Download Spreadsheet Excel"
          >
            <FileSpreadsheet size={15} className="text-neutral-700" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={filteredRecords.length === 0}
            className="px-3.5 py-2 bg-neutral-900 hover:bg-black text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-40 shadow-xs"
            title="Download Dokumen PDF"
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
              <h4 className="text-sm font-semibold text-rose-900">Gagal Mengambil Rekap Harian</h4>
              <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={() => loadData()}
            className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Date Shortcuts & Filter Toolbar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Date Selector & Quick Pills */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-neutral-50 px-3 py-2 rounded-lg border border-neutral-200">
            <Calendar size={16} className="text-neutral-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-semibold text-neutral-900 focus:outline-none cursor-pointer"
            />
            <span className="text-[11px] font-bold text-neutral-900 bg-neutral-200/70 px-2 py-0.5 rounded ml-1">
              {getDayName(selectedDate)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-neutral-100/60 p-1 rounded-lg border border-neutral-200/80">
            <button
              onClick={() => setRelativeDate(0)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                selectedDate === todayJakarta()
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'
              }`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setRelativeDate(-1)}
              className="px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-md transition-colors"
            >
              Kemarin
            </button>
            <button
              onClick={() => setRelativeDate(-2)}
              className="px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-md transition-colors"
            >
              H-2
            </button>
          </div>
        </div>

        {/* Category & Search Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-neutral-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as Category | '')}
              className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            >
              <option value="">Semua Divisi (CS & Security)</option>
              <option value="CS">Customer Service (CS)</option>
              <option value="Security">Security Satpam</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Cari nama pegawai..."
            value={searchEmployee}
            onChange={(e) => setSearchEmployee(e.target.value)}
            className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900 w-44"
          />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Pegawai Hadir</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800">
              <Users size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-2">{totalEmployees}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Pegawai aktif hari ini</div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Presensi CS</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800">
              <Headphones size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-2">{totalCS}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Log absensi CS</div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Presensi Security</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800">
              <Shield size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-2">{totalSecurity}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Log absensi Security</div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Tepat Waktu</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800">
              <CheckCircle size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-2">{totalTepatWaktu}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Presensi disiplin</div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Terlambat</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-neutral-900 mt-2">{totalTerlambat}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Melewati batas jadwal</div>
        </div>
      </div>

      {/* Full Width Desktop Data Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-neutral-900">
              Daftar Presensi Harian ({filteredRecords.length} rekaman)
            </h2>
            <span className="text-xs font-medium text-neutral-500">
              • Tanggal {selectedDate}
            </span>
          </div>
          <span className="text-xs text-neutral-500">
            Format Waktu: WIB (UTC+7)
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-xs text-neutral-400">
            <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Memuat data presensi harian...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
              <Calendar size={22} />
            </div>
            <div className="text-sm font-semibold text-neutral-800">
              Tidak Ada Catatan Presensi
            </div>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Belum ada pegawai yang mencatatkan absensi pada tanggal {selectedDate} dengan filter yang dipilih.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-600 font-semibold tracking-wider uppercase text-[11px]">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4">Pegawai</th>
                  <th className="py-3 px-4">Divisi</th>
                  <th className="py-3 px-4">Shift</th>
                  <th className="py-3 px-4">Tipe Absen</th>
                  <th className="py-3 px-4">Waktu Aktual</th>
                  <th className="py-3 px-4">Jadwal Masuk</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Keterlambatan</th>
                  <th className="py-3 px-4">Verifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredRecords.map((rec, idx) => (
                  <tr
                    key={rec.id}
                    className="hover:bg-neutral-50/80 transition-colors"
                  >
                    <td className="py-3.5 px-4 text-center font-mono text-neutral-400">
                      {idx + 1}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-xs flex-shrink-0">
                          {rec.employee_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-neutral-900">{rec.employee_name}</div>
                          <div className="text-[10px] font-mono text-neutral-400">ID: {rec.id.substring(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <CategoryBadge category={rec.category} />
                    </td>
                    <td className="py-3.5 px-4 font-medium text-neutral-700">
                      {rec.shift || <span className="text-neutral-400">-</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      <AttendanceTypeBadge type={rec.attendance_type} />
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-neutral-900">
                      {formatJakartaTime(rec.recorded_at)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-neutral-500">
                      {rec.scheduled_start || '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      <AttendanceStatusBadge status={rec.attendance_status} />
                    </td>
                    <td className="py-3.5 px-4">
                      {rec.late_minutes > 0 ? (
                        <span className="font-semibold text-neutral-900 font-mono bg-neutral-100 px-2 py-0.5 rounded border border-neutral-300">
                          +{rec.late_minutes} menit
                        </span>
                      ) : (
                        <span className="text-neutral-400 font-mono">0 menit</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <ReviewStatusBadge status={rec.review_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
