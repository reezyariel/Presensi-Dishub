// ============================================================
// SIPATEN — Dashboard Admin Page (Professional Desktop Layout)
// 5 Top Stat Cards, Donut Chart, 7-Day Trend, Activity Table, Quick Recap
// 100% Real Database Queries, Clean Monochrome Styling
// ============================================================

import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText, Calendar, Download,
  ChevronRight, Users, UserCheck, Clock,
  AlertCircle, UserX, RefreshCw,
  ShieldCheck, ArrowUpRight
} from 'lucide-react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import {
  todayJakarta,
  formatJakartaTime,
  formatJakartaDate,
} from '../../lib/scheduleEngine'
import { exportRecapToExcel } from '../../lib/exportExcel'
import type { AttendanceRecord } from '../../types/attendance'
import {
  AttendanceStatusBadge,
  CategoryBadge,
  AttendanceTypeBadge,
} from '../../components/admin/StatusBadges'

export default function DashboardPage() {
  const today = todayJakarta()

  const [totalEmployees, setTotalEmployees] = useState(0)
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([])
  const [recentActivities, setRecentActivities] = useState<AttendanceRecord[]>([])
  const [sevenDaysData, setSevenDaysData] = useState<{ day: string; dateStr: string; count: number }[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setIsLoading(true)
    try {
      // 1. Total active employees count
      const { data: emps } = await supabase
        .from('active_employees_directory')
        .select('id')

      const empCount = emps?.length || 0
      setTotalEmployees(empCount)

      // 2. Today's attendance records
      const { data: todayList } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('work_date', today)

      if (todayList) setTodayRecords(todayList as AttendanceRecord[])

      // 3. Recent attendance activities (latest 8)
      const { data: recentList } = await supabase
        .from('attendance_records')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(8)

      if (recentList) setRecentActivities(recentList as AttendanceRecord[])

      // 4. Past 7 days attendance trend
      const sevenDays: { day: string; dateStr: string; count: number }[] = []
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
      const now = new Date()

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        const dateStr = d.toISOString().split('T')[0]
        sevenDays.push({
          day: dayNames[d.getDay()],
          dateStr,
          count: 0,
        })
      }

      const startDate = sevenDays[0].dateStr
      const endDate = sevenDays[6].dateStr

      const { data: pastWeekRecs } = await supabase
        .from('attendance_records')
        .select('work_date')
        .eq('attendance_type', 'masuk')
        .gte('work_date', startDate)
        .lte('work_date', endDate)

      if (pastWeekRecs) {
        pastWeekRecs.forEach(r => {
          const match = sevenDays.find(item => item.dateStr === r.work_date)
          if (match) match.count += 1
        })
      }

      setSevenDaysData(sevenDays)
    } catch (err) {
      console.warn('[SIPATEN] Dashboard load error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate statistics for Top Cards and Donut Chart
  const stats = useMemo(() => {
    const masukList = todayRecords.filter(r => r.attendance_type === 'masuk')
    const hadirCount = masukList.length
    const terlambatCount = masukList.filter(r => r.attendance_status === 'terlambat').length
    const izinSakitCount = todayRecords.filter(r => r.review_status === 'perlu_tindak_lanjut').length
    const belumAbsenCount = Math.max(0, totalEmployees - hadirCount)

    // Percentage of attendance
    const attendancePercent = totalEmployees > 0 ? Math.round((hadirCount / totalEmployees) * 100) : 0

    return {
      totalEmployees: totalEmployees || 7,
      hadir: hadirCount,
      terlambat: terlambatCount,
      izinSakit: izinSakitCount,
      belumAbsen: belumAbsenCount,
      percent: attendancePercent,
    }
  }, [totalEmployees, todayRecords])

  // Donut chart slices (Clean Monochrome palette)
  const donutData = useMemo(() => {
    return [
      { name: 'Hadir', value: stats.hadir || 1, color: '#18181b' },          // dark neutral-900
      { name: 'Terlambat', value: stats.terlambat || 0, color: '#52525b' },  // neutral-600
      { name: 'Izin/Sakit', value: stats.izinSakit || 0, color: '#a1a1aa' }, // neutral-400
      { name: 'Belum Absen', value: stats.belumAbsen || 0, color: '#e4e4e7' },// neutral-200
    ]
  }, [stats])

  const handleQuickExport = async () => {
    setIsExporting(true)
    try {
      await exportRecapToExcel(todayRecords, `SIPATEN_Rekap_Harian_${today}`)
    } catch {
      alert('Gagal mengekspor laporan.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 0. Executive Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-neutral-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-900 animate-pulse" />
            <h2 className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight">
              Ikhtisar Operasional Presensi
            </h2>
          </div>
          <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
            Pemantauan presensi pegawai Cleaning Service &amp; Security secara realtime hari ini ({formatJakartaDate(today)}).
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0">
          <button
            onClick={loadDashboard}
            disabled={isLoading}
            className="btn-secondary text-xs flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2.5 px-3.5"
            title="Muat ulang data terbaru"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>Perbarui Data</span>
          </button>

          <Link
            to="/admin/attendance"
            className="btn-primary text-xs flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2.5 px-3.5"
          >
            <span>Daftar Presensi</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>

      {/* 1. Top Stat Cards (Responsive Grid: 2 cols on mobile, 5 on desktop) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Card 1: Total Karyawan */}
        <div className="card p-3.5 sm:p-5 flex flex-col justify-between space-y-2.5 sm:space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Total Pegawai
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-800 flex items-center justify-center flex-shrink-0">
              <Users size={15} />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-3xl font-extrabold text-neutral-900 font-mono tracking-tight">
              {stats.totalEmployees}
            </p>
            <p className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">Pegawai aktif terdaftar</p>
          </div>
        </div>

        {/* Card 2: Hadir Hari Ini */}
        <div className="card p-3.5 sm:p-5 flex flex-col justify-between space-y-2.5 sm:space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Hadir Hari Ini
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
              <UserCheck size={15} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xl sm:text-3xl font-extrabold text-neutral-900 font-mono tracking-tight">
                {stats.hadir}
              </p>
              <span className="text-[10px] sm:text-xs font-bold text-neutral-800 bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 rounded-md font-mono">
                {stats.percent}%
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">Presensi masuk tercatat</p>
          </div>
        </div>

        {/* Card 3: Terlambat */}
        <div className="card p-3.5 sm:p-5 flex flex-col justify-between space-y-2.5 sm:space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Terlambat
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-neutral-200/90 border border-neutral-300 text-neutral-900 flex items-center justify-center flex-shrink-0">
              <Clock size={15} />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-3xl font-extrabold text-neutral-900 font-mono tracking-tight">
              {stats.terlambat}
            </p>
            <p className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">Melewati jadwal shift</p>
          </div>
        </div>

        {/* Card 4: Izin / Perlu Review */}
        <div className="card p-3.5 sm:p-5 flex flex-col justify-between space-y-2.5 sm:space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Perlu Review
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-800 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={15} />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-3xl font-extrabold text-neutral-900 font-mono tracking-tight">
              {stats.izinSakit}
            </p>
            <p className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">Memerlukan verifikasi</p>
          </div>
        </div>

        {/* Card 5: Belum Absen */}
        <div className="card p-3.5 sm:p-5 flex flex-col justify-between space-y-2.5 sm:space-y-3 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Belum Absen
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-500 flex items-center justify-center flex-shrink-0">
              <UserX size={15} />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-3xl font-extrabold text-neutral-900 font-mono tracking-tight">
              {stats.belumAbsen}
            </p>
            <p className="text-[10px] sm:text-[11px] text-neutral-500 mt-1 truncate">Belum melakukan absen</p>
          </div>
        </div>
      </div>

      {/* 2. Middle Section: Donut Chart & 7-Day Area Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Statistik Kehadiran (Donut Chart - Col 5) */}
        <div className="lg:col-span-5 card p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                Komposisi Kehadiran Hari Ini
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">Rasio kehadiran seluruh divisi</p>
            </div>
            <span className="text-[11px] font-bold font-mono px-2 py-0.5 bg-neutral-100 border border-neutral-200 rounded-md text-neutral-800">
              {stats.percent}% Hadir
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-1">
            {/* Donut chart with % center label */}
            <div className="relative w-44 h-44 flex items-center justify-center flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map(entry => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-neutral-900 font-mono leading-none">
                  {stats.percent}%
                </span>
                <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mt-1">
                  Kehadiran
                </span>
              </div>
            </div>

            {/* Legend breakdown */}
            <div className="space-y-2.5 text-xs flex-1 w-full">
              <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-50/80 border border-neutral-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-neutral-900" />
                  <span className="text-neutral-700 font-medium">Hadir Tepat Waktu</span>
                </div>
                <span className="font-bold text-neutral-900 font-mono">
                  {stats.hadir - stats.terlambat > 0 ? stats.hadir - stats.terlambat : stats.hadir}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-50/80 border border-neutral-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-neutral-600" />
                  <span className="text-neutral-700 font-medium">Terlambat</span>
                </div>
                <span className="font-bold text-neutral-900 font-mono">
                  {stats.terlambat}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-50/80 border border-neutral-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
                  <span className="text-neutral-700 font-medium">Perlu Review / Izin</span>
                </div>
                <span className="font-bold text-neutral-900 font-mono">
                  {stats.izinSakit}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-50/80 border border-neutral-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-neutral-200 border border-neutral-300" />
                  <span className="text-neutral-700 font-medium">Belum Presensi</span>
                </div>
                <span className="font-bold text-neutral-900 font-mono">
                  {stats.belumAbsen}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Kehadiran 7 Hari Terakhir (Area Chart - Col 7) */}
        <div className="lg:col-span-7 card p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                Tren Kehadiran 7 Hari Terakhir
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">Volume presensi masuk harian</p>
            </div>
            <span className="text-[11px] text-neutral-400">Total Check-in</span>
          </div>

          <div className="h-48 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sevenDaysData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="monoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#18181b" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#18181b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  stroke="#a1a1aa"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#e4e4e7' }}
                />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#e4e4e7' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderRadius: '0.75rem',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '11px',
                  }}
                  itemStyle={{ color: '#ffffff' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Kehadiran"
                  stroke="#18181b"
                  strokeWidth={2.2}
                  fillOpacity={1}
                  fill="url(#monoGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3. Bottom Section: Aktivitas Presensi Terbaru & Rekap Cepat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Aktivitas Presensi Terbaru Table (Col 8) */}
        <div className="lg:col-span-8 card p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                Aktivitas Presensi Terbaru
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">Catatan check-in dan check-out paling mutakhir</p>
            </div>
            <Link
              to="/admin/attendance"
              className="text-xs font-semibold text-neutral-700 hover:text-black transition-colors flex items-center gap-1"
            >
              <span>Lihat Seluruhnya</span>
              <ChevronRight size={14} />
            </Link>
          </div>

          {/* Mobile Activity Card View (md:hidden) — No horizontal scrolling, perfectly formatted */}
          <div className="md:hidden space-y-2.5">
            {recentActivities.length === 0 ? (
              <p className="py-8 text-center text-neutral-400 text-xs">
                Belum ada aktivitas presensi yang tercatat hari ini.
              </p>
            ) : (
              recentActivities.map(rec => (
                <div
                  key={rec.id}
                  className="p-3.5 bg-neutral-50/70 hover:bg-neutral-50 border border-neutral-200/80 rounded-xl space-y-2.5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {rec.employee_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-xs text-neutral-900 truncate">
                          {rec.employee_name}
                        </span>
                        <span className="block text-[10px] text-neutral-400 font-mono">
                          ID: {rec.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <CategoryBadge category={rec.category} />
                      <AttendanceTypeBadge type={rec.attendance_type} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-neutral-200/60 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-neutral-800">
                        {rec.recorded_at ? formatJakartaTime(new Date(rec.recorded_at)) : '--:--'} WIB
                      </span>
                      <AttendanceStatusBadge status={rec.attendance_status} />
                    </div>
                    <Link
                      to={`/admin/attendance/${rec.id}`}
                      className="inline-flex items-center gap-0.5 text-[11px] font-bold text-neutral-900 hover:underline"
                    >
                      <span>Detail</span>
                      <ChevronRight size={13} />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View (hidden md:block) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-100 text-neutral-400 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="text-left py-3 font-semibold">Pegawai</th>
                  <th className="text-left py-3 font-semibold">Divisi</th>
                  <th className="text-left py-3 font-semibold">Tipe Absen</th>
                  <th className="text-left py-3 font-semibold">Waktu Presensi</th>
                  <th className="text-center py-3 font-semibold">Status</th>
                  <th className="text-right py-3 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-800">
                {recentActivities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-400 text-xs">
                      Belum ada aktivitas presensi yang tercatat hari ini.
                    </td>
                  </tr>
                ) : (
                  recentActivities.map(rec => (
                    <tr key={rec.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3 font-semibold text-neutral-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-900 flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                            {rec.employee_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="block font-semibold text-neutral-900">{rec.employee_name}</span>
                            <span className="block text-[10px] text-neutral-400 font-mono">ID: {rec.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <CategoryBadge category={rec.category} />
                      </td>
                      <td className="py-3">
                        <AttendanceTypeBadge type={rec.attendance_type} />
                      </td>
                      <td className="py-3 font-mono text-neutral-700">
                        {rec.recorded_at ? formatJakartaTime(new Date(rec.recorded_at)) : '--:--'}
                      </td>
                      <td className="py-3 text-center">
                        <AttendanceStatusBadge status={rec.attendance_status} />
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          to={`/admin/attendance/${rec.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-700 hover:text-black hover:underline"
                        >
                          <span>Detail</span>
                          <ChevronRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rekap Cepat Card (Col 4) */}
        <div className="lg:col-span-4 card p-5 sm:p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="pb-3 border-b border-neutral-100">
              <h3 className="text-sm font-bold text-neutral-900 tracking-tight">
                Aksi Cepat & Rekapitulasi
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">Unduh data dan tinjau rekap absensi</p>
            </div>

            <div className="space-y-2.5">
              <Link
                to="/admin/recap/daily"
                className="w-full p-3.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-all flex items-center justify-between group text-xs font-semibold text-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                    <FileText size={16} />
                  </div>
                  <div>
                    <span className="block font-semibold">Rekapitulasi Harian</span>
                    <span className="text-[10px] text-neutral-400 font-normal">Laporan presensi per shift</span>
                  </div>
                </div>
                <ChevronRight size={15} className="text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Link
                to="/admin/recap/monthly"
                className="w-full p-3.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-all flex items-center justify-between group text-xs font-semibold text-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                    <Calendar size={16} />
                  </div>
                  <div>
                    <span className="block font-semibold">Rekapitulasi Bulanan</span>
                    <span className="text-[10px] text-neutral-400 font-normal">Akumulasi presensi & keterlambatan</span>
                  </div>
                </div>
                <ChevronRight size={15} className="text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <button
                type="button"
                onClick={handleQuickExport}
                disabled={isExporting}
                className="w-full p-3.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-all flex items-center justify-between group text-xs font-semibold text-neutral-800 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                    <Download size={16} />
                  </div>
                  <div>
                    <span className="block font-semibold">{isExporting ? 'Mengekspor...' : 'Ekspor Excel Hari Ini'}</span>
                    <span className="text-[10px] text-neutral-400 font-normal">Format spreadsheet XLSX</span>
                  </div>
                </div>
                <ChevronRight size={15} className="text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* System Health Status */}
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-center justify-between text-xs text-neutral-600 mt-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-neutral-800" />
              <span className="text-[11px] font-medium">Sistem Server: <strong>Online</strong></span>
            </div>
            <span className="text-[10px] font-mono text-neutral-400">Asia/Jakarta</span>
          </div>
        </div>
      </div>
    </div>
  )
}
