// ============================================================
// SIPATEN — Riwayat Absensi Page (Responsive)
// Desktop: Wide table with filters and pagination
// Mobile: Card-based list
// 100% real Supabase data
// ============================================================

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  SlidersHorizontal, Calendar, Clock,
  ChevronRight, Search, X
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { formatJakartaTime, todayJakarta } from '../../lib/scheduleEngine'
import type { AttendanceRecord } from '../../types/attendance'

const PAGE_SIZE = 15

export default function AttendanceHistoryPage() {
  const { user, profile, employeeProfile, role, isAdmin } = useAuth()

  const currentRole = role === 'admin' ? 'admin' : (role || employeeProfile?.employee_role || 'CS')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<'Semua' | 'CS' | 'Security'>(
    isAdmin ? 'Semua' : (currentRole === 'Security' ? 'Security' : 'CS')
  )
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const today = todayJakarta()
  const startDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 60)
    return d.toISOString().split('T')[0]
  })()
  const [endDate] = useState(today)

  useEffect(() => {
    setPage(1)
    loadHistory()
  }, [startDate, endDate, selectedCategory, user?.id, employeeProfile?.id])

  async function loadHistory() {
    setIsLoading(true)
    try {
      let query = supabase
        .from('attendance_records')
        .select('*')
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date', { ascending: false })
        .order('recorded_at', { ascending: true })

      if (isAdmin) {
        if (selectedCategory !== 'Semua') {
          query = query.eq('category', selectedCategory)
        }
      } else {
        // Strict employee isolation: only own records
        const empName = employeeProfile?.full_name || profile?.full_name || ''
        const normName = employeeProfile?.normalized_name || (empName ? empName.toLowerCase().trim() : '')

        query = query.eq('category', currentRole)

        if (user?.id) {
          query = query.or(`auth_uid.eq.${user.id},employee_profile_id.eq.${employeeProfile?.id || user.id},normalized_name.eq.${normName}`)
        } else if (normName) {
          query = query.eq('normalized_name', normName)
        }
      }

      const { data, error } = await query
      if (!error && data) {
        if (!isAdmin) {
          const empName = employeeProfile?.full_name || profile?.full_name || ''
          const normName = employeeProfile?.normalized_name || (empName ? empName.toLowerCase().trim() : '')
          // Client guard against any foreign data
          const personal = (data as AttendanceRecord[]).filter(r => {
            if (r.auth_uid && user?.id && r.auth_uid === user.id) return true
            if (employeeProfile?.id && r.employee_profile_id === employeeProfile.id) return true
            return r.category === currentRole && (r.normalized_name === normName || r.employee_name === empName)
          })
          setRecords(personal)
        } else {
          setRecords(data as AttendanceRecord[])
        }
      }
    } catch (err) {
      console.warn('Error loading attendance history:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Group records by work_date
  const groupedRecords = useMemo(() => {
    const groups: Record<string, AttendanceRecord[]> = {}
    for (const rec of records) {
      if (!groups[rec.work_date]) groups[rec.work_date] = []
      groups[rec.work_date].push(rec)
    }
    return groups
  }, [records])

  // Filtered records for table
  const filteredRecords = useMemo(() => {
    if (!search) return records
    const q = search.toLowerCase()
    return records.filter(r =>
      r.employee_name?.toLowerCase().includes(q) ||
      r.attendance_type?.toLowerCase().includes(q) ||
      r.work_date?.includes(q)
    )
  }, [records, search])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE))
  const pagedRecords = filteredRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const sortedDates = Object.keys(groupedRecords).sort((a, b) => b.localeCompare(a))

  const formatDateHeader = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number)
      const date = new Date(year, month - 1, day)
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
      return `${days[date.getDay()]}, ${day} ${months[date.getMonth()]} ${year}`
    } catch { return dateStr }
  }

  const typeLabel = (t: string) =>
    t === 'masuk' ? 'Absen Masuk' : t === 'istirahat' ? 'Istirahat' : 'Absen Pulang'

  return (
    <div className="space-y-5">
      {/* ─── Page Header ─── */}
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Riwayat Absensi</h2>
        <p className="text-xs text-neutral-500 mt-0.5">Rekap presensi 60 hari terakhir</p>
      </div>

      {/* ─── Filter Bar ─── */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="flex-1 relative w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder={isAdmin ? "Cari nama, tipe, atau tanggal..." : "Cari tipe presensi atau tanggal..."}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-8 py-2.5 border border-neutral-200 rounded-xl text-xs text-neutral-900 bg-white focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 placeholder:text-neutral-400 transition"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category filter: only for admin. For employees, show division badge */}
          {isAdmin ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <SlidersHorizontal size={13} className="text-neutral-400" />
              {(['Semua', 'CS', 'Security'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setSelectedCategory(tab); setPage(1) }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${selectedCategory === tab
                      ? 'bg-neutral-900 text-white'
                      : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
                    }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-semibold text-neutral-800">
              <span>Divisi: {currentRole}</span>
            </div>
          )}

          {/* Date range indicator */}
          <div className="flex items-center gap-2 text-xs text-neutral-500 flex-shrink-0 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
            <Calendar size={13} />
            <span>{startDate} – {endDate}</span>
          </div>
        </div>
      </div>

      {/* ─── Content ─── */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-neutral-200 p-12 flex flex-col items-center justify-center gap-3">
          <div className="w-7 h-7 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-500">Memuat riwayat presensi...</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center">
          <Clock size={32} className="text-neutral-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-neutral-700">Belum ada catatan presensi</p>
          <p className="text-xs text-neutral-400 mt-1">
            {search ? 'Coba ubah kata kunci pencarian' : 'Presensi Anda akan tercatat dan ditampilkan di sini'}
          </p>
        </div>
      ) : (
        <>
          {/* DESKTOP: Wide table */}
          <div className="hidden md:block bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-700">
                {filteredRecords.length} catatan ditemukan
              </p>
              <p className="text-xs text-neutral-400">Halaman {page} dari {totalPages}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/50">
                    <th className="px-6 py-3 text-left font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Tanggal</th>
                    <th className="px-6 py-3 text-left font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Tipe Presensi</th>
                    <th className="px-6 py-3 text-left font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Shift / Divisi</th>
                    <th className="px-6 py-3 text-left font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Waktu Tercatat</th>
                    <th className="px-6 py-3 text-left font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                    <th className="px-6 py-3 text-left font-semibold text-neutral-500 uppercase tracking-wide whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRecords.map(rec => {
                    const time = rec.recorded_at ? formatJakartaTime(new Date(rec.recorded_at)) : '--:--'
                    const isLate = rec.attendance_status === 'terlambat'
                    const isToday = rec.work_date === today
                    return (
                      <tr key={rec.id} className={`border-b border-neutral-50 hover:bg-neutral-50/70 transition-colors ${isToday ? 'bg-neutral-50/40' : ''}`}>
                        <td className="px-6 py-3.5">
                          <div>
                            <p className="font-semibold text-neutral-900">{rec.work_date}</p>
                            {isToday && <span className="text-[9px] font-bold text-neutral-900 bg-neutral-100 px-1.5 py-0.5 rounded">Hari Ini</span>}
                          </div>
                        </td>
                        <td className="px-6 py-3.5 font-semibold text-neutral-900">{typeLabel(rec.attendance_type)}</td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${rec.category === 'CS' ? 'bg-neutral-100 text-neutral-700 border border-neutral-200' : 'bg-neutral-900 text-white'}`}>
                              {rec.category}
                            </span>
                            {rec.shift && <span className="text-neutral-500 text-[10px]">{rec.shift}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-3.5 font-mono text-neutral-700">{time}</td>
                        <td className="px-6 py-3.5">
                          <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${isLate ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                            }`}>
                            {isLate ? 'Terlambat' : 'Tepat Waktu'}
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          <Link to={`/attendance/${rec.id}`} className="flex items-center gap-1 text-neutral-500 hover:text-neutral-900 transition-colors font-medium">
                            Detail <ChevronRight size={13} />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 text-xs font-semibold bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Sebelumnya
                </button>
                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${p === page ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 text-xs font-semibold bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Berikutnya →
                </button>
              </div>
            )}
          </div>

          {/* MOBILE: Card-based grouped by date */}
          <div className="md:hidden space-y-4">
            {sortedDates.map(dateStr => (
              <div key={dateStr} className="space-y-2">
                <h4 className="text-xs font-bold text-neutral-700 px-1">{formatDateHeader(dateStr)}</h4>
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden divide-y divide-neutral-100">
                  {groupedRecords[dateStr].map(rec => {
                    const time = rec.recorded_at ? formatJakartaTime(new Date(rec.recorded_at)) : '--:--'
                    const isLate = rec.attendance_status === 'terlambat'
                    return (
                      <Link
                        key={rec.id}
                        to={`/attendance/${rec.id}`}
                        className="p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 flex-shrink-0">
                            <Clock size={15} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-neutral-900">{typeLabel(rec.attendance_type)}</p>
                            <p className="text-[11px] text-neutral-500 font-mono mt-0.5">
                              {time} {rec.shift ? `· ${rec.shift}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isLate ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'}`}>
                            {isLate ? 'Terlambat' : 'Tepat Waktu'}
                          </span>
                          <ChevronRight size={14} className="text-neutral-400" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
