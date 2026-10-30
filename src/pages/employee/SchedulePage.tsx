// ============================================================
// SIPATEN — Jadwal Kerja Page (Responsive & Division-Safe)
// CS: fixed 3-boundary daytime schedule (Masuk, Istirahat, Pulang)
// Security: 3-shift 24h rotation (Shift I, Shift II, Shift III)
//
// DIVISION ISOLATION GUARANTEE:
// - Category is derived strictly from Layout Context / URL path / Auth Profile.
// - Security portal NEVER renders CS components or data.
// - Loading screen / skeleton matches the intended division during auth/data fetch.
// - Zero content flash upon page refresh.
// ============================================================

import { useState, useEffect } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  Clock, Info, Moon, Sunrise, Sunset, Calendar,
  Shield, Sparkles
} from 'lucide-react'
import {
  formatJakartaDate,
  getCSSchedule,
  getSecurityScheduleFromDB,
  getCSScheduleSync,
  getSecurityScheduleSync,
  getSecurityShiftItem,
  getJakartaDayOfWeek,
  todayJakarta,
  DEFAULT_DAY_GROUPS,
  type CSSchedule,
  type SecuritySchedule,
} from '../../lib/scheduleEngine'


export default function SchedulePage() {
  const { employeeProfile, role, isAdmin, isLoading: isAuthLoading } = useAuth()
  const location = useLocation()
  const outletContext = useOutletContext<{ category?: 'CS' | 'Security' }>()

  // Determine definitive division category:
  // 1. Explicit Outlet context (from EmployeeLayout)
  // 2. URL path (/security/* vs /cs/*)
  // 3. Authenticated employee role
  const resolvedCategory: 'CS' | 'Security' = (() => {
    if (outletContext?.category) return outletContext.category
    if (location.pathname.startsWith('/security')) return 'Security'
    if (location.pathname.startsWith('/cs')) return 'CS'
    if (role === 'Security') return 'Security'
    if (role === 'CS') return 'CS'
    return 'CS' // default for root admin
  })()

  // Admin tab state (only admins can switch views)
  const [activeTab, setActiveTab] = useState<'CS' | 'Security'>(resolvedCategory)

  // Keep activeTab in sync with route / role
  useEffect(() => {
    if (outletContext?.category) {
      setActiveTab(outletContext.category)
    } else if (location.pathname.startsWith('/security')) {
      setActiveTab('Security')
    } else if (location.pathname.startsWith('/cs')) {
      setActiveTab('CS')
    } else if (!isAdmin && role) {
      setActiveTab(role === 'Security' ? 'Security' : 'CS')
    }
  }, [outletContext?.category, location.pathname, role, isAdmin])

  // Live schedule state loaded from DB attendance_settings
  const [csScheduleData, setCsScheduleData] = useState<CSSchedule>(getCSScheduleSync())
  const [secScheduleData, setSecScheduleData] = useState<SecuritySchedule>(getSecurityScheduleSync())
  const [isScheduleLoading, setIsScheduleLoading] = useState(true)
  const [selectedDayGroupTab, setSelectedDayGroupTab] = useState<'all' | 'mon_thu' | 'friday' | 'weekend'>('all')

  useEffect(() => {
    let isMounted = true
    async function fetchSchedules() {
      try {
        const [cs, sec] = await Promise.all([
          getCSSchedule(),
          getSecurityScheduleFromDB()
        ])
        if (isMounted) {
          setCsScheduleData(cs)
          setSecScheduleData(sec)
          setIsScheduleLoading(false)
        }
      } catch (err) {
        console.warn('Failed fetching schedule settings from DB:', err)
        if (isMounted) setIsScheduleLoading(false)
      }
    }
    fetchSchedules()
    return () => { isMounted = false }
  }, [])

  const now = new Date()
  const todayStr = formatJakartaDate(now)

  const effectiveCategory = isAdmin ? activeTab : resolvedCategory

  // ─────────────────────────────────────────────────────────────
  // Loading State: Render division-appropriate skeleton
  // ─────────────────────────────────────────────────────────────
  if (isAuthLoading || isScheduleLoading) {
    return (
      <div className="space-y-5 animate-pulse">
        {/* Header Skeleton */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="h-6 w-48 bg-neutral-200 rounded-lg" />
            <div className="h-3 w-32 bg-neutral-100 rounded mt-2" />
          </div>
        </div>

        {effectiveCategory === 'Security' ? (
          /* Security Skeleton: Hero card + 3 cards */
          <div className="space-y-4">
            <div className="bg-neutral-800 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <div className="h-4 w-36 bg-neutral-700 rounded" />
                <div className="h-4 w-20 bg-neutral-700 rounded-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-700/50 rounded-xl p-4 h-20" />
                <div className="bg-neutral-700/50 rounded-xl p-4 h-20" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                  <div className="h-4 w-24 bg-neutral-200 rounded" />
                  <div className="h-3 w-full bg-neutral-100 rounded" />
                  <div className="h-3 w-3/4 bg-neutral-100 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* CS Skeleton: 3 Cards */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                <div className="h-4 w-28 bg-neutral-200 rounded" />
                <div className="h-3 w-full bg-neutral-100 rounded" />
                <div className="h-3 w-2/3 bg-neutral-100 rounded" />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // CS Schedule Computation
  // ─────────────────────────────────────────────────────────────
  const csSchedule = {
    masukStart: csScheduleData.masuk.open.replace(':', '.'),
    masukEnd: csScheduleData.masuk.ontime_deadline.replace(':', '.'),
    masukClose: csScheduleData.masuk.close?.replace(':', '.'),
    istirahatStart: csScheduleData.istirahat.start.replace(':', '.'),
    istirahatEnd: csScheduleData.istirahat.end.replace(':', '.'),
    pulangStart: csScheduleData.pulang.start.replace(':', '.'),
    pulangEnd: csScheduleData.pulang.end.replace(':', '.'),
  }

  // ─────────────────────────────────────────────────────────────
  // Security Schedule Computation (Authoritative Day-Based Groups)
  // ─────────────────────────────────────────────────────────────
  const dayGroups = secScheduleData.day_groups || DEFAULT_DAY_GROUPS

  const todayIso = todayJakarta()
  const todayDayOfWeek = getJakartaDayOfWeek(todayIso)
  const currentDayGroupKey: 'mon_thu' | 'friday' | 'weekend' =
    todayDayOfWeek === 5 ? 'friday' : (todayDayOfWeek === 0 || todayDayOfWeek === 6) ? 'weekend' : 'mon_thu'

  const formatDuration = (inStart: string, outStart: string, outNextDay: boolean): string => {
    const [inH, inM] = inStart.split(':').map(Number)
    const [outH, outM] = outStart.split(':').map(Number)
    const inMins = inH * 60 + inM
    const outMins = outH * 60 + outM
    const totalMins = outNextDay ? (outMins + 1440 - inMins) : (outMins - inMins)
    const hours = totalMins / 60
    return Number.isInteger(hours) ? `${hours} Jam` : `${Math.floor(hours)} Jam ${totalMins % 60} Menit`
  }

  // Personal shift for logged-in Security officer based on today's day group
  const userAssignedShiftName = employeeProfile?.default_shift || null
  const myTodayShiftItem = userAssignedShiftName ? getSecurityShiftItem(todayIso, userAssignedShiftName) : null
  const myShiftInfo = myTodayShiftItem ? {
    name: myTodayShiftItem.label || myTodayShiftItem.shift_name,
    shift_name: myTodayShiftItem.shift_name,
    period: myTodayShiftItem.shift_number === 1
      ? 'Pagi'
      : myTodayShiftItem.shift_number === 2
        ? (todayDayOfWeek === 5 || todayDayOfWeek === 0 || todayDayOfWeek === 6 ? 'Malam' : 'Sore')
        : 'Malam',
    masuk: `${myTodayShiftItem.in_start.replace(':', '.')} WIB`,
    masukClose: `${myTodayShiftItem.in_end.replace(':', '.')} WIB`,
    pulang: `${myTodayShiftItem.out_start.replace(':', '.')} WIB${myTodayShiftItem.out_next_day ? ' (H+1)' : ''}`,
    pulangClose: `${myTodayShiftItem.out_end.replace(':', '.')} WIB${myTodayShiftItem.out_next_day ? ' (H+1)' : ''}`,
    workHours: `${myTodayShiftItem.in_start.replace(':', '.')} – ${myTodayShiftItem.out_start.replace(':', '.')} WIB${myTodayShiftItem.out_next_day ? ' (H+1)' : ''}`,
    duration: formatDuration(myTodayShiftItem.in_start, myTodayShiftItem.out_start, myTodayShiftItem.out_next_day),
    isMidnight: myTodayShiftItem.out_next_day,
    dayGroupName: todayDayOfWeek === 5 ? 'Jumat' : (todayDayOfWeek === 0 || todayDayOfWeek === 6) ? 'Sabtu & Minggu' : 'Senin – Kamis',
  } : null

  // All 3 Day Groups to display
  const allGroups = [
    {
      key: 'mon_thu' as const,
      name: 'Senin – Kamis',
      subtitle: '3 Shift Bergantian (24 Jam)',
      badge: '3 Shift',
      desc: 'Rotasi dinas operasional 24 jam untuk hari kerja reguler Senin sampai Kamis.',
      shifts: dayGroups.mon_thu?.shifts || DEFAULT_DAY_GROUPS.mon_thu.shifts,
      isToday: currentDayGroupKey === 'mon_thu',
    },
    {
      key: 'friday' as const,
      name: 'Jumat',
      subtitle: '2 Shift Operasional Khusus',
      badge: '2 Shift Khusus',
      desc: 'Jadwal operasional khusus hari Jumat: Shift I 12 jam (siang) dan Shift II 12 jam (malam lintas hari).',
      shifts: dayGroups.friday?.shifts || DEFAULT_DAY_GROUPS.friday.shifts,
      isToday: currentDayGroupKey === 'friday',
    },
    {
      key: 'weekend' as const,
      name: 'Sabtu – Minggu',
      subtitle: '2 Shift Akhir Pekan (Pagi & Malam)',
      badge: '2 Shift Weekend',
      desc: 'Jadwal penjagaan 12 jam akhir pekan: Shift I (Pagi) dan Shift II (Malam lintas hari).',
      shifts: dayGroups.weekend?.shifts || DEFAULT_DAY_GROUPS.weekend.shifts,
      isToday: currentDayGroupKey === 'weekend',
    },
  ]

  const visibleGroups = allGroups.filter(g => selectedDayGroupTab === 'all' || selectedDayGroupTab === g.key)

  return (
    <div className="space-y-5">
      {/* ─── Page Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">
            {isAdmin ? 'Jadwal Kerja Seluruh Divisi' : 'Jadwal Kerja Saya'}
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">{todayStr}</p>
        </div>

        {/* Current Day Group Badge for Security */}
        {effectiveCategory === 'Security' && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 border border-neutral-200 rounded-full px-3 py-1.5 self-start">
            <Calendar size={13} className="text-neutral-500" />
            <span>Hari Ini: <strong>{todayDayOfWeek === 5 ? 'Jumat (2 Shift)' : (todayDayOfWeek === 0 || todayDayOfWeek === 6) ? 'Sabtu & Minggu (2 Shift)' : 'Senin–Kamis (3 Shift)'}</strong></span>
          </span>
        )}
      </div>

      {/* ─── Admin Division Tab Control (Only for Admin) ─── */}
      {isAdmin && (
        <div className="flex items-center p-1 bg-neutral-100 rounded-xl border border-neutral-200 max-w-xs">
          <button
            type="button"
            id="tab-schedule-cs"
            onClick={() => setActiveTab('CS')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'CS' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
          >
            Cleaning Service
          </button>
          <button
            type="button"
            id="tab-schedule-security"
            onClick={() => setActiveTab('Security')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'Security' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
          >
            Security
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          SECURITY VIEW: Day-Based Shift Schedules
      ────────────────────────────────────────────────────────── */}
      {effectiveCategory === 'Security' && (
        <div className="space-y-6">
          {/* ── 1. Hero Card "Shift Saya Hari Ini" (for employees) ── */}
          {!isAdmin && myShiftInfo && (
            <div className="bg-neutral-900 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 pt-5 pb-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <Sparkles size={16} className="text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                          Shift Saya Hari Ini
                        </p>
                        <span className="text-[10px] text-amber-300 font-semibold">
                          • {myShiftInfo.dayGroupName}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white">
                        {myShiftInfo.name} — {myShiftInfo.period}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-neutral-200 bg-white/10 px-2.5 py-1 rounded-full border border-white/10">
                      Durasi: {myShiftInfo.duration}
                    </span>
                    {myShiftInfo.isMidnight && (
                      <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-400/20">
                        Lintas Hari (H+1)
                      </span>
                    )}
                  </div>
                </div>

                {/* Jam Kerja Utama */}
                <div className="mb-3 px-4 py-2.5 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                  <span className="text-xs text-white/60">Jam Kerja Operasional</span>
                  <span className="text-sm font-bold font-mono text-white">{myShiftInfo.workHours}</span>
                </div>

                {/* Grid details: Masuk & Pulang */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Presensi Masuk Card */}
                  <div className="bg-white/[0.07] border border-white/10 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sunrise size={13} className="text-white/60" />
                      <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">
                        Presensi Masuk (Check-In)
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/50">Mulai Check-In</span>
                      <span className="text-lg font-black text-white font-mono">{myShiftInfo.masuk}</span>
                    </div>
                    <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-white/5">
                      <span className="text-[11px] text-white/40">Batas Tepat Waktu</span>
                      <span className="text-xs font-semibold text-emerald-400 font-mono">{myShiftInfo.masukClose}</span>
                    </div>
                  </div>

                  {/* Presensi Pulang Card */}
                  <div className="bg-white/[0.07] border border-white/10 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sunset size={13} className="text-white/60" />
                      <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">
                        Presensi Pulang (Check-Out)
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/50">Mulai Check-Out</span>
                      <span className="text-lg font-black text-white font-mono">{myShiftInfo.pulang}</span>
                    </div>
                    <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-white/5">
                      <span className="text-[11px] text-white/40">Batas Check-Out</span>
                      <span className="text-xs font-semibold text-white/70 font-mono">{myShiftInfo.pulangClose}</span>
                    </div>
                  </div>
                </div>
              </div>

              {myShiftInfo.isMidnight && (
                <div className="px-5 py-3 bg-white/5 border-t border-white/10 flex items-center gap-2">
                  <Moon size={13} className="text-amber-400 flex-shrink-0" />
                  <p className="text-[11px] text-white/70 leading-relaxed">
                    Shift malam melintasi tengah malam — jam pulang dan batas akhir check-out jatuh pada keesokan harinya (H+1).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── If Security employee has no default shift assigned ── */}
          {!isAdmin && !myShiftInfo && (
            <div className="bg-neutral-900 rounded-2xl p-5 border border-neutral-800 text-white">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Shield size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Shift Belum Ditugaskan</h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Shift default akun Anda belum ditetapkan oleh administrator. Silakan pilih shift dinas yang berlaku saat melakukan presensi masuk di Beranda.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── 2. Reference Sections: Day-Based Shift Schedule Groups ── */}
          <div className="space-y-4">
            {/* Header and Filter Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={13} className="text-neutral-700" />
                  Jadwal Resmi Shift Security Berdasarkan Hari
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Tersinkronisasi otomatis dengan konfigurasi server Supabase
                </p>
              </div>

              {/* Group Filter Tabs */}
              <div className="flex items-center p-1 bg-neutral-100 rounded-xl border border-neutral-200 gap-1 overflow-x-auto self-start sm:self-auto">
                {[
                  { id: 'all', label: 'Semua Hari' },
                  { id: 'mon_thu', label: 'Senin–Kamis', badge: '3 Shift' },
                  { id: 'friday', label: 'Jumat', badge: '2 Shift' },
                  { id: 'weekend', label: 'Sabtu–Minggu', badge: '2 Shift' },
                ].map(tab => {
                  const isSelected = selectedDayGroupTab === tab.id
                  const isTodayGroup = tab.id === currentDayGroupKey
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedDayGroupTab(tab.id as any)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                        isSelected
                          ? 'bg-neutral-900 text-white shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {isTodayGroup && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-emerald-500'}`} title="Hari Ini" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Rendered Groups */}
            <div className="space-y-6">
              {visibleGroups.map(group => (
                <div
                  key={group.key}
                  className={`rounded-2xl border transition-all ${
                    group.isToday
                      ? 'border-neutral-900/30 bg-neutral-50/30 shadow-xs'
                      : 'border-neutral-200 bg-white'
                  } p-5 space-y-4`}
                >
                  {/* Group Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-200/60">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        group.isToday ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'
                      }`}>
                        <Calendar size={15} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-neutral-900">{group.name}</h3>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                            {group.badge}
                          </span>
                          {group.isToday && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                              Hari Ini
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-500 mt-0.5">{group.desc}</p>
                      </div>
                    </div>
                  </div>

                  {/* Shift Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.shifts.map(shift => {
                      const isMyShiftOnToday = group.isToday && userAssignedShiftName === shift.shift_name
                      const isOvernight = shift.out_next_day
                      const Icon = isOvernight ? Moon : shift.shift_number === 1 ? Sunrise : Sunset
                      const duration = formatDuration(shift.in_start, shift.out_start, shift.out_next_day)

                      return (
                        <div
                          key={shift.id || shift.shift_name}
                          className={`bg-white rounded-xl border shadow-xs overflow-hidden flex flex-col justify-between transition-all ${
                            isMyShiftOnToday
                              ? 'border-neutral-900 ring-2 ring-neutral-900/10'
                              : isOvernight
                                ? 'border-neutral-300'
                                : 'border-neutral-200'
                          }`}
                        >
                          <div className="p-4 space-y-3.5">
                            {/* Card Top: Name & Badges */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                  isOvernight ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'
                                }`}>
                                  <Icon size={14} />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-neutral-900">
                                    {shift.label || shift.shift_name}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                {isMyShiftOnToday && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-neutral-900 text-white">
                                    Shift Anda
                                  </span>
                                )}
                                {isOvernight && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-200">
                                    Lintas Hari (H+1)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Jam Kerja Banner */}
                            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100 flex items-center justify-between">
                              <div>
                                <span className="text-[10px] font-semibold text-neutral-500 block uppercase tracking-wider">
                                  Jam Kerja
                                </span>
                                <span className="text-sm font-bold font-mono text-neutral-900">
                                  {shift.in_start.replace(':', '.')} – {shift.out_start.replace(':', '.')} WIB{isOvernight ? ' (H+1)' : ''}
                                </span>
                              </div>
                              <span className="text-[11px] font-medium text-neutral-600 bg-white px-2 py-0.5 rounded border border-neutral-200">
                                {duration}
                              </span>
                            </div>

                            {/* Check-In and Check-Out Details */}
                            <div className="space-y-2 text-xs">
                              {/* Check-In */}
                              <div className="p-2.5 rounded-lg bg-neutral-50/50 border border-neutral-100">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-700 mb-1">
                                  <span className="flex items-center gap-1">
                                    <Sunrise size={12} className="text-neutral-500" />
                                    Presensi Masuk (Check-In)
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-[11px]">
                                  <span className="text-neutral-500">Mulai Check-In</span>
                                  <span className="font-mono font-bold text-neutral-900">{shift.in_start.replace(':', '.')} WIB</span>
                                </div>
                                <div className="flex justify-between items-center text-[11px] pt-0.5">
                                  <span className="text-neutral-500">Batas Tepat Waktu</span>
                                  <span className="font-mono font-semibold text-emerald-700">{shift.in_end.replace(':', '.')} WIB</span>
                                </div>
                              </div>

                              {/* Check-Out */}
                              <div className="p-2.5 rounded-lg bg-neutral-50/50 border border-neutral-100">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-700 mb-1">
                                  <span className="flex items-center gap-1">
                                    <Sunset size={12} className="text-neutral-500" />
                                    Presensi Pulang (Check-Out)
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-[11px]">
                                  <span className="text-neutral-500">Mulai Check-Out</span>
                                  <span className="font-mono font-bold text-neutral-900">
                                    {shift.out_start.replace(':', '.')} WIB{isOvernight ? ' (H+1)' : ''}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-[11px] pt-0.5">
                                  <span className="text-neutral-500">Batas Check-Out</span>
                                  <span className="font-mono font-semibold text-neutral-700">
                                    {shift.out_end.replace(':', '.')} WIB{isOvernight ? ' (H+1)' : ''}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Card Footer */}
                          <div className={`px-4 py-2 border-t text-[10px] font-medium flex items-center justify-between ${
                            isOvernight ? 'bg-neutral-900 text-white border-neutral-800' : 'bg-neutral-50 text-neutral-500 border-neutral-100'
                          }`}>
                            <span>{isOvernight ? 'Selesai di hari berikutnya (H+1)' : 'Selesai di hari yang sama'}</span>
                            <span className="font-mono font-bold">{duration}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 3. Ketentuan Jadwal Security ── */}
          <div className="bg-neutral-50 rounded-2xl border border-neutral-200 p-4 flex items-start gap-3">
            <Info size={16} className="text-neutral-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-neutral-600">
              <p className="font-semibold text-neutral-800">Ketentuan Jadwal Security SIPATEN Berbasis Hari</p>
              <ul className="space-y-1 text-[11px] list-disc ml-3">
                <li><strong>Senin–Kamis (3 Shift)</strong>: Shift I (07:00–16:00), Shift II (16:00–19:30), dan Shift III (19:30–07:00 H+1).</li>
                <li><strong>Jumat (2 Shift Khusus)</strong>: Shift I (07:30–19:30, 12 Jam) dan Shift II (19:30–07:30 H+1, 12 Jam).</li>
                <li><strong>Sabtu–Minggu (2 Shift Akhir Pekan)</strong>: Shift I — Pagi (08:00–20:00, 12 Jam) dan Shift II — Malam (20:00–08:00 H+1, 12 Jam).</li>
                <li><strong>Shift Lintas Hari</strong>: Shift III (Senin–Kamis), Shift II (Jumat), dan Shift II (Weekend) berakhir pada pagi keesokan harinya (H+1) dan check-out terhubung secara otomatis ke catatan presensi masuk yang valid.</li>
                <li>Seluruh jam jadwal, toleransi keterlambatan, dan jendela presensi divalidasi secara otoritatif oleh sistem server dalam zona waktu <strong>Asia/Jakarta (WIB)</strong>.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          CLEANING SERVICE VIEW: Fixed Daytime Schedule
      ────────────────────────────────────────────────────────── */}
      {effectiveCategory === 'CS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Presensi Masuk Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                    <Sunrise size={16} className="text-neutral-700" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-900">Presensi Masuk</p>
                    <p className="text-[10px] text-neutral-500">Waktu toleransi check-in</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-neutral-500">Mulai Check-in</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono">{csSchedule.masukStart} WIB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-neutral-500">Batas Tepat Waktu</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono">{csSchedule.masukEnd} WIB</span>
                  </div>
                  {csSchedule.masukClose && (
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-neutral-500">Tutup Check-in</span>
                      <span className="text-sm font-bold text-neutral-900 font-mono">{csSchedule.masukClose} WIB</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-5 py-2 bg-neutral-50 border-t border-neutral-100">
                <span className="text-[10px] font-semibold text-neutral-600">Pagi • Setiap Hari Kerja</span>
              </div>
            </div>

            {/* Waktu Istirahat Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                    <Clock size={16} className="text-neutral-700" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-900">Waktu Istirahat</p>
                    <p className="text-[10px] text-neutral-500">Jeda istirahat siang</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-neutral-500">Mulai</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono">{csSchedule.istirahatStart} WIB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-neutral-500">Selesai</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono">{csSchedule.istirahatEnd} WIB</span>
                  </div>
                </div>
              </div>
              <div className="px-5 py-2 bg-neutral-50 border-t border-neutral-100">
                <span className="text-[10px] font-semibold text-neutral-600">Siang • Setiap Hari Kerja</span>
              </div>
            </div>

            {/* Presensi Pulang Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                    <Sunset size={16} className="text-neutral-700" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-900">Presensi Pulang</p>
                    <p className="text-[10px] text-neutral-500">Waktu toleransi check-out</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-neutral-500">Mulai</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono">{csSchedule.pulangStart} WIB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-neutral-500">Batas</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono">{csSchedule.pulangEnd} WIB</span>
                  </div>
                </div>
              </div>
              <div className="px-5 py-2 bg-neutral-50 border-t border-neutral-100">
                <span className="text-[10px] font-semibold text-neutral-600">Sore • Setiap Hari Kerja</span>
              </div>
            </div>
          </div>

          {/* Ketentuan Jadwal Cleaning Service */}
          <div className="bg-neutral-50 rounded-2xl border border-neutral-200 p-4 flex items-start gap-3">
            <Info size={16} className="text-neutral-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-neutral-600">
              <p className="font-semibold text-neutral-800">Ketentuan Jadwal Cleaning Service</p>
              <ul className="space-y-1 text-[11px] list-disc ml-3">
                <li>Jadwal berlaku tetap setiap hari kerja (Senin–Jumat).</li>
                <li>Rentang check-in: {csSchedule.masukStart} – {csSchedule.masukEnd} WIB (tutup check-in: {csSchedule.masukClose || '11.59'} WIB).</li>
                <li>Waktu istirahat: {csSchedule.istirahatStart} – {csSchedule.istirahatEnd} WIB.</li>
                <li>Rentang check-out: {csSchedule.pulangStart} – {csSchedule.pulangEnd} WIB.</li>
                <li>Tidak ada variasi shift untuk divisi Cleaning Service.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
