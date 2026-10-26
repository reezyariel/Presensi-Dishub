// ============================================================
// SIPATEN — Employee Home View (CS & Security)
// Responsive: 2-column grid on desktop, single column on mobile
// 100% real Supabase data, camera & attendance preserved
// ============================================================

import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, Check, Clock, ChevronRight, Camera,
  MapPin, TrendingUp, AlertCircle, Sunrise, Sunset,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  todayJakarta,
  formatJakartaDate,
  formatJakartaTime,
  getScheduleInfo,
  getCSScheduleSync,
  preloadSchedules,
  getNextAttendanceInfo,
  getAttendanceButtonState,
  calculate30DayRecap,
  isWeekend,
} from '../../lib/scheduleEngine'
import type { AttendanceRecord, SecurityShiftOption } from '../../types/attendance'
import TakeAttendanceModal from '../../pages/attendance/TakeAttendanceModal'
import ShiftSelectionModal from './ShiftSelectionModal'
import ServiceMenuGrid from './ServiceMenuGrid'

interface EmployeeHomeViewProps {
  category: 'CS' | 'Security'
}

interface WeekDayCount {
  day: string
  label: string
  count: number
  dateStr: string
}

export default function EmployeeHomeView({ category }: EmployeeHomeViewProps) {
  const { user, profile, employeeProfile } = useAuth()
  const today = todayJakarta()

  const [currentTime, setCurrentTime] = useState<Date>(new Date())

  const [todayRecords, setTodayRecords] = useState<{
    masuk: AttendanceRecord | null
    istirahat: AttendanceRecord | null
    pulang: AttendanceRecord | null
  }>({ masuk: null, istirahat: null, pulang: null })

  const [monthStats, setMonthStats] = useState({ hadir: 0, terlambat: 0, tidakHadir: 0 })
  const [weekChartData, setWeekChartData] = useState<WeekDayCount[]>([])
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([])

  const [isTakeModalOpen, setIsTakeModalOpen] = useState(false)
  const [attendanceTypeToTake, setAttendanceTypeToTake] = useState<'masuk' | 'istirahat' | 'pulang'>('masuk')
  const [isLoading, setIsLoading] = useState(true)

  const isTodayWeekend = isWeekend(new Date())
  const [selectedShift, setSelectedShift] = useState<SecurityShiftOption>(() => {
    if (isTodayWeekend) return 'Sesi Pagi'
    return (employeeProfile?.default_shift as SecurityShiftOption) || 'Shift I'
  })
  // Shift selection modal state (Security masuk only)
  const [isShiftPickerOpen, setIsShiftPickerOpen] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Preload schedule cache and periodically refresh so changes in Settings are picked up
  useEffect(() => {
    preloadSchedules()
    const refreshSched = setInterval(() => preloadSchedules(), 60000)
    return () => clearInterval(refreshSched)
  }, [])

  useEffect(() => {
    // Clean cache on account switch
    setTodayRecords({ masuk: null, istirahat: null, pulang: null })
    setMonthStats({ hadir: 0, terlambat: 0, tidakHadir: 0 })
    setWeekChartData([])
    setRecentRecords([])
    loadAttendanceData()
  }, [category, user?.id, employeeProfile?.id, employeeProfile?.normalized_name])

  async function loadAttendanceData() {
    setIsLoading(true)
    const employeeName = employeeProfile?.full_name || profile?.full_name
    const normName = employeeProfile?.normalized_name || (employeeName ? employeeName.toLowerCase().trim() : '')

    if (!normName && !employeeName && !user?.id) { setIsLoading(false); return }

    const idFilter = user?.id
      ? `auth_uid.eq.${user.id},employee_profile_id.eq.${employeeProfile?.id || user.id},normalized_name.eq.${normName}`
      : `normalized_name.eq.${normName}`

    try {
      // 1. Today's records
      const { data: todayList } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('work_date', today)
        .eq('category', category)
        .or(idFilter)

      if (todayList) {
        const filteredToday = todayList.filter(r => {
          if (r.auth_uid && user?.id && r.auth_uid === user.id) return true
          if (employeeProfile?.id && r.employee_profile_id === employeeProfile.id) return true
          return r.category === category && (r.normalized_name === normName || r.employee_name === employeeName)
        })
        const masuk = filteredToday.find(r => r.attendance_type === 'masuk') || null
        const istirahat = filteredToday.find(r => r.attendance_type === 'istirahat') || null
        const pulang = filteredToday.find(r => r.attendance_type === 'pulang') || null
        setTodayRecords({ masuk, istirahat, pulang })
        if (masuk?.shift) setSelectedShift(masuk.shift)
      }

      // 2. Past 30 days for personal stats
      // Query 31 hari ke belakang agar kita bisa exclude hari ini secara eksplisit di client.
      const past30StartDate = new Date()
      past30StartDate.setDate(past30StartDate.getDate() - 30)
      const past30Days = past30StartDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
      const { data: monthList } = await supabase
        .from('attendance_records')
        .select('work_date, attendance_type, attendance_status, auth_uid, employee_profile_id, normalized_name, category')
        .eq('category', category)
        .or(idFilter)
        .gte('work_date', past30Days)

      if (monthList) {
        const personalMonth = monthList.filter(r => {
          if (r.auth_uid && user?.id && r.auth_uid === user.id) return true
          if (employeeProfile?.id && r.employee_profile_id === employeeProfile.id) return true
          return r.category === category && r.normalized_name === normName
        })
        const masukRecords = personalMonth.filter(r => r.attendance_type === 'masuk')

        // Tanggal bergabung pegawai (YYYY-MM-DD) dalam timezone Jakarta
        // Cek employeeProfile.created_at, profile.created_at, atau user.created_at
        const rawCreatedAt =
          (employeeProfile as { created_at?: string } | null)?.created_at ||
          profile?.created_at ||
          user?.created_at

        const joinDateStr: string | null = rawCreatedAt
          ? new Date(rawCreatedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
          : null

        const recapStats = calculate30DayRecap(
          category,
          masukRecords,
          joinDateStr,
          new Date(),
          selectedShift,
        )
        setMonthStats(recapStats)
      }

      // 3. Weekly bar chart data
      const now = new Date()
      const dayOfWeek = now.getDay()
      const diffToMonday = (dayOfWeek + 6) % 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - diffToMonday)

      const weekDays: WeekDayCount[] = []
      const dayLabels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        weekDays.push({ day: dayLabels[i], label: dayLabels[i], count: 0, dateStr })
      }

      const mondayStr = weekDays[0].dateStr
      const sundayStr = weekDays[6].dateStr
      const { data: weekList } = await supabase
        .from('attendance_records')
        .select('work_date, auth_uid, employee_profile_id, normalized_name, category')
        .eq('category', category)
        .eq('attendance_type', 'masuk')
        .or(idFilter)
        .gte('work_date', mondayStr)
        .lte('work_date', sundayStr)

      if (weekList) {
        const personalWeek = weekList.filter(r => {
          if (r.auth_uid && user?.id && r.auth_uid === user.id) return true
          if (employeeProfile?.id && r.employee_profile_id === employeeProfile.id) return true
          return r.category === category && r.normalized_name === normName
        })
        personalWeek.forEach(r => {
          const item = weekDays.find(w => w.dateStr === r.work_date)
          if (item) item.count += 1
        })
      }
      setWeekChartData(weekDays)

      // 4. Recent 5 records
      const { data: recent } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('category', category)
        .or(idFilter)
        .order('work_date', { ascending: false })
        .order('recorded_at', { ascending: false })
        .limit(10)

      if (recent) {
        const personalRecent = (recent as AttendanceRecord[]).filter(r => {
          if (r.auth_uid && user?.id && r.auth_uid === user.id) return true
          if (employeeProfile?.id && r.employee_profile_id === employeeProfile.id) return true
          return r.category === category && (r.normalized_name === normName || r.employee_name === employeeName)
        }).slice(0, 5)
        setRecentRecords(personalRecent)
      }
    } catch (err) {
      console.warn('Error fetching employee dashboard data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const scheduleDisplay = useMemo(() => {
    if (category === 'CS') {
      const cs = getCSScheduleSync()
      const fmt = (s: string, e: string) => `${s.replace(':', '.')} – ${e.replace(':', '.')} WIB`
      return {
        masuk: fmt(cs.masuk.open, cs.masuk.ontime_deadline),
        istirahat: fmt(cs.istirahat.start, cs.istirahat.end),
        pulang: fmt(cs.pulang.start, cs.pulang.end),
      }
    } else {
      const sched = getScheduleInfo('Security', 'masuk', selectedShift, today)
      const schedEnd = getScheduleInfo('Security', 'pulang', selectedShift, today)
      return {
        masuk: sched ? `${sched.scheduledStart.replace(':', '.')} – ${sched.scheduledEnd.replace(':', '.')} WIB` : '07.30 – 08.00 WIB',
        istirahat: 'Shift Kerja Berlanjut',
        pulang: schedEnd ? `${schedEnd.scheduledStart.replace(':', '.')}${schedEnd.isNextDay ? ' (H+1)' : ''} WIB` : '16.00 WIB',
      }
    }
  }, [category, selectedShift, today])

  const handleOpenTakeModal = (type: 'masuk' | 'istirahat' | 'pulang') => {
    if (category === 'Security' && type === 'masuk') {
      setIsShiftPickerOpen(true)
      return
    }
    setAttendanceTypeToTake(type)
    setIsTakeModalOpen(true)
  }

  const handleConfirmSecurityShift = (confirmedShift: SecurityShiftOption) => {
    setSelectedShift(confirmedShift)
    setIsShiftPickerOpen(false)
    setAttendanceTypeToTake('masuk')
    setIsTakeModalOpen(true)
  }

  const handlePresensiMenuClick = () => {
    if (buttonState.status === 'can_masuk') {
      handleOpenTakeModal('masuk')
    } else if (buttonState.status === 'can_istirahat') {
      handleOpenTakeModal('istirahat')
    } else if (buttonState.status === 'can_pulang') {
      handleOpenTakeModal('pulang')
    } else {
      const card = document.getElementById('presensi-hari-ini-card')
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  const displayName = employeeProfile?.full_name || profile?.full_name || 'Pegawai'
  const roleLabel = category === 'CS' ? 'Cleaning Service' : 'Security / Keamanan'

  // Derive next attendance info from today's completed records
  const completedTypes = [
    ...(todayRecords.masuk ? ['masuk'] : []),
    ...(todayRecords.istirahat ? ['istirahat'] : []),
    ...(todayRecords.pulang ? ['pulang'] : []),
  ] as ('masuk' | 'istirahat' | 'pulang')[]

  const nextInfo = getNextAttendanceInfo(category, completedTypes, selectedShift, today, currentTime)
  const buttonState = getAttendanceButtonState(category, todayRecords, selectedShift, today, currentTime)

  // Clock display
  const timeStr = currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  // Status text
  const attendanceStatus = todayRecords.pulang
    ? 'Sudah Check-Out'
    : todayRecords.masuk
      ? 'Sudah Check-In'
      : 'Belum Absen'

  // Is action currently active?
  const isActionActive = buttonState.status === 'can_masuk' || buttonState.status === 'can_istirahat' || buttonState.status === 'can_pulang'

  // Banner warna latar
  const bannerBg = todayRecords.pulang
    ? 'bg-neutral-50 border-neutral-200'
    : isActionActive
      ? 'bg-neutral-900 border-neutral-800'
      : 'bg-neutral-50 border-neutral-200'

  // Next Attendance Banner — dihitung sebelum render untuk menghindari nested ternary
  let nextAttendanceBanner: React.ReactNode
  if (todayRecords.pulang) {
    nextAttendanceBanner = (
      <>
        <div className="w-7 h-7 rounded-full bg-white border border-neutral-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Check size={14} strokeWidth={2.8} className="text-neutral-700" />
        </div>
        <div>
          <p className="text-xs font-bold text-neutral-700">Semua presensi hari ini selesai</p>
          <p className="text-[11px] text-neutral-500 mt-0.5">Sampai jumpa besok. Istirahat yang cukup!</p>
        </div>
      </>
    )
  } else if (buttonState.status === 'workday_holiday') {
    nextAttendanceBanner = (
      <>
        <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-neutral-600">
          <Calendar size={13} />
        </div>
        <div>
          <p className="text-xs font-bold text-neutral-800">{buttonState.title}</p>
          <p className="text-[11px] text-neutral-500 mt-0.5">{buttonState.message}</p>
        </div>
      </>
    )
  } else if (buttonState.status === 'window_closed') {
    nextAttendanceBanner = (
      <>
        <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-neutral-600">
          <AlertCircle size={13} />
        </div>
        <div>
          <p className="text-xs font-bold text-neutral-800">{buttonState.title}</p>
          <p className="text-[11px] text-neutral-500 mt-0.5">{buttonState.message}</p>
        </div>
      </>
    )
  } else if (buttonState.status === 'can_masuk') {
    const openT = (buttonState.openTime || buttonState.startTime).replace(':', '.')
    const deadlineT = (buttonState.deadlineTime || buttonState.endTime).replace(':', '.')
    const closeT = (buttonState.closeTime || buttonState.endTime).replace(':', '.')
    nextAttendanceBanner = (
      <>
        <div className="w-7 h-7 rounded-full bg-white/10 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
          <Camera size={13} />
        </div>
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-neutral-400">
            {buttonState.isLate ? 'Jendela Check-In (Terlambat)' : 'Jendela Check-In Dibuka'}
          </p>
          {category === 'CS' ? (
            <div className="mt-1 space-y-0.5">
              <p className="text-[10px] text-neutral-300">
                <span className="font-semibold text-white">Buka:</span> {openT} WIB
              </p>
              <p className="text-[10px] text-neutral-300">
                <span className="font-semibold text-white">Batas tepat waktu:</span> {deadlineT} WIB
              </p>
              <p className="text-[10px] text-neutral-300">
                <span className="font-semibold text-white">Tutup:</span> {closeT} WIB
              </p>
            </div>
          ) : (
            <p className="text-xs font-bold mt-0.5 text-white">
              Waktu presensi masuk: {openT} – {closeT} WIB
            </p>
          )}
          <p className="text-[10px] mt-1 text-neutral-400">
            {buttonState.isLate
              ? 'Waktu check-in telah melewati batas tepat waktu. Presensi akan dicatat sebagai terlambat.'
              : 'Ambil foto selfie di area kantor untuk melakukan presensi masuk.'}
          </p>
        </div>
      </>
    )
  } else if (buttonState.status === 'waiting_istirahat') {
    nextAttendanceBanner = (
      <>
        <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-neutral-600">
          <Clock size={13} />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-neutral-500">Presensi berikutnya</p>
          <p className="text-xs font-bold mt-0.5 text-neutral-900">
            Istirahat pukul {buttonState.startTime.replace(':', '.')} WIB
          </p>
          <p className="text-[10px] mt-0.5 text-neutral-400">
            Tombol presensi istirahat akan aktif otomatis pukul {buttonState.startTime.replace(':', '.')} WIB.
          </p>
        </div>
      </>
    )
  } else if (buttonState.status === 'can_istirahat') {
    nextAttendanceBanner = (
      <>
        <div className="w-7 h-7 rounded-full bg-white/10 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
          <Camera size={13} />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-neutral-400">Waktu Istirahat Sedang Berlangsung</p>
          <p className="text-xs font-bold mt-0.5 text-white">
            Presensi istirahat: {buttonState.startTime.replace(':', '.')} – {buttonState.endTime.replace(':', '.')} WIB
          </p>
          <p className="text-[10px] mt-0.5 text-neutral-400">
            Silakan ambil foto selfie untuk mencatat presensi istirahat siang.
          </p>
        </div>
      </>
    )
  } else if (buttonState.status === 'waiting_pulang') {
    nextAttendanceBanner = (
      <>
        <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-neutral-600">
          <Clock size={13} />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-neutral-500">Presensi berikutnya</p>
          <p className="text-xs font-bold mt-0.5 text-neutral-900">
            Pulang pukul {buttonState.startTime.replace(':', '.')} WIB{buttonState.note ? ` ${buttonState.note}` : ''}
          </p>
          <p className="text-[10px] mt-0.5 text-neutral-400">
            Tombol presensi pulang akan aktif saat waktu pulang tiba.
          </p>
        </div>
      </>
    )
  } else if (buttonState.status === 'can_pulang') {
    nextAttendanceBanner = (
      <>
        <div className="w-7 h-7 rounded-full bg-white/10 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
          <Camera size={13} />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-neutral-400">Waktu Check-Out Tiba</p>
          <p className="text-xs font-bold mt-0.5 text-white">
            Presensi pulang dibuka mulai pukul {buttonState.startTime.replace(':', '.')} WIB
          </p>
          <p className="text-[10px] mt-0.5 text-neutral-400">
            Silakan ambil foto selfie sebelum meninggalkan lokasi kerja.
          </p>
        </div>
      </>
    )
  } else if (nextInfo) {
    nextAttendanceBanner = (
      <>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${todayRecords.masuk ? 'bg-white/10 text-white' : 'bg-neutral-100 text-neutral-600'
          }`}>
          <Clock size={13} />
        </div>
        <div>
          <p className={`text-[11px] font-semibold ${todayRecords.masuk ? 'text-neutral-400' : 'text-neutral-500'
            }`}>
            {todayRecords.masuk ? 'Presensi berikutnya' : 'Presensi hari ini dimulai'}
          </p>
          <p className={`text-xs font-bold mt-0.5 ${todayRecords.masuk ? 'text-white' : 'text-neutral-900'
            }`}>
            {nextInfo.label} pukul {nextInfo.startTime.replace(':', '.')} WIB
            {nextInfo.note ? ` ${nextInfo.note}` : ''}
          </p>
          <p className={`text-[10px] mt-0.5 ${todayRecords.masuk ? 'text-neutral-500' : 'text-neutral-400'
            }`}>
            Pastikan Anda melakukan presensi sesuai jadwal.
          </p>
        </div>
      </>
    )
  } else {
    nextAttendanceBanner = (
      <>
        <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertCircle size={13} className="text-neutral-400" />
        </div>
        <div>
          <p className="text-xs font-bold text-neutral-700">Jadwal belum dikonfigurasi</p>
          <p className="text-[11px] text-neutral-500 mt-0.5">Hubungi Admin untuk mengatur jadwal presensi.</p>
        </div>
      </>
    )
  }

  return (
    <>
      {/* ─── Welcome strip (full width) ─── */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">Selamat Datang,</p>
            <h2 className="text-xl font-bold text-neutral-900 mt-0.5">{displayName}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-full px-2.5 py-1">
                {category === 'CS' ? '🎧' : '🛡️'} {roleLabel}
              </span>
              {category === 'Security' && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 bg-white border border-neutral-200 rounded-full px-2.5 py-1">
                  <Clock size={11} />
                  {selectedShift}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 ${todayRecords.pulang
                  ? 'bg-neutral-200 text-neutral-700 border border-neutral-300'
                  : todayRecords.masuk
                    ? 'bg-neutral-900 text-white'
                    : 'bg-white text-neutral-600 border border-neutral-300'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${todayRecords.masuk ? 'bg-white' : 'bg-neutral-400'
                  }`} />
                {attendanceStatus}
              </span>
            </div>
          </div>

          {/* Live Clock (desktop supplement) */}
          <div className="hidden md:flex flex-col items-end text-right flex-shrink-0">
            <p className="text-2xl font-bold text-neutral-900 font-mono tabular-nums">{timeStr}</p>
            <p className="text-xs text-neutral-400 mt-0.5">{formatJakartaDate(currentTime)}</p>
          </div>
        </div>
      </div>

      {/* ─── Two-column grid (desktop) / stacked (mobile) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── LEFT COLUMN (2/3 width on desktop): Main attendance + Weekly recap ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* A. Main Attendance Card */}
          <div id="presensi-hari-ini-card" className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden scroll-mt-20">
            {/* Card header */}
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">Presensi Hari Ini</h3>
              <span className="text-xs text-neutral-400">{formatJakartaDate(currentTime)}</span>
            </div>

            <div className="p-5">
              {/* Check-in / Check-out time display */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                {/* Check-In */}
                <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Sunrise size={15} className="text-neutral-500" />
                    <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Check-In</span>
                  </div>
                  {todayRecords.masuk ? (
                    <p className="text-2xl font-bold text-neutral-900 font-mono tabular-nums">
                      {todayRecords.masuk.recorded_at
                        ? formatJakartaTime(new Date(todayRecords.masuk.recorded_at))
                        : '--:--'}
                    </p>
                  ) : (
                    <p className="text-2xl font-bold text-neutral-300 font-mono">--:--</p>
                  )}
                  {todayRecords.masuk && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${todayRecords.masuk.attendance_status === 'terlambat'
                          ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                        }`}>
                        {todayRecords.masuk.attendance_status === 'terlambat' ? 'Terlambat' : 'Tepat Waktu'}
                      </span>
                      {todayRecords.masuk.shift && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-800 border border-neutral-200">
                          <Clock size={10} />
                          {todayRecords.masuk.shift}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Check-Out */}
                <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Sunset size={15} className="text-neutral-500" />
                    <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Check-Out</span>
                  </div>
                  {todayRecords.pulang ? (
                    <p className="text-2xl font-bold text-neutral-900 font-mono tabular-nums">
                      {todayRecords.pulang.recorded_at
                        ? formatJakartaTime(new Date(todayRecords.pulang.recorded_at))
                        : '--:--'}
                    </p>
                  ) : (
                    <p className="text-2xl font-bold text-neutral-300 font-mono">--:--</p>
                  )}
                  {todayRecords.pulang && (
                    <span className="mt-1 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                      Selesai
                    </span>
                  )}
                </div>
              </div>

              {/* Action Button & Scheduling Area */}
              {buttonState.status === 'workday_holiday' ? (
                <div className="p-5 bg-neutral-50 rounded-xl border border-neutral-200 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center mx-auto">
                    <Calendar size={18} />
                  </div>
                  <p className="text-xs font-bold text-neutral-900">{buttonState.title}</p>
                  <p className="text-[11px] text-neutral-500 leading-relaxed max-w-sm mx-auto">
                    {buttonState.message}
                  </p>
                </div>
              ) : buttonState.status === 'waiting_masuk' ? (
                <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center flex-shrink-0 text-neutral-600">
                      <Clock size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-900">{buttonState.title}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">{buttonState.message}</p>
                    </div>
                  </div>
                  <button
                    disabled
                    className="w-full py-3.5 bg-neutral-200 text-neutral-400 font-bold text-sm rounded-xl flex items-center justify-center gap-2.5 cursor-not-allowed"
                  >
                    <Camera size={18} />
                    <span>Absen Masuk (Belum Dibuka)</span>
                  </button>
                </div>
              ) : buttonState.status === 'window_closed' ? (
                <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center flex-shrink-0 text-neutral-600">
                      <AlertCircle size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-900">{buttonState.title}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">{buttonState.message}</p>
                    </div>
                  </div>
                  <button
                    disabled
                    className="w-full py-3.5 bg-neutral-200 text-neutral-400 font-bold text-sm rounded-xl flex items-center justify-center gap-2.5 cursor-not-allowed"
                  >
                    <Camera size={18} />
                    <span>Absen Masuk (Jendela Ditutup)</span>
                  </button>
                </div>
              ) : buttonState.status === 'can_masuk' ? (
                <button
                  onClick={() => handleOpenTakeModal('masuk')}
                  className="w-full py-4 bg-neutral-900 hover:bg-black text-white font-bold text-sm rounded-xl flex items-center justify-center gap-3 transition-all shadow-sm active:scale-[0.99]"
                >
                  <Camera size={20} />
                  <span>{buttonState.title || 'Ambil Foto & Absen Masuk'}</span>
                </button>
              ) : buttonState.status === 'waiting_istirahat' ? (
                <div className="space-y-3">
                  <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center flex-shrink-0 text-neutral-600 mt-0.5">
                      <Clock size={16} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-neutral-900">{buttonState.title}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
                        {buttonState.message}
                      </p>
                    </div>
                  </div>
                  {todayRecords.masuk?.id && (
                    <Link
                      to={`/attendance/${todayRecords.masuk.id}`}
                      className="w-full py-2.5 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold rounded-xl border border-neutral-200 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>Lihat Detail Absen Masuk</span>
                      <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              ) : buttonState.status === 'can_istirahat' ? (
                <div className="space-y-3">
                  <button
                    onClick={() => handleOpenTakeModal('istirahat')}
                    className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white font-bold text-sm rounded-xl flex items-center justify-center gap-3 transition-all shadow-sm active:scale-[0.99]"
                  >
                    <Camera size={18} />
                    <span>Ambil Foto &amp; Absen Istirahat</span>
                  </button>
                  {todayRecords.masuk?.id && (
                    <Link
                      to={`/attendance/${todayRecords.masuk.id}`}
                      className="w-full py-2.5 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold rounded-xl border border-neutral-200 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>Lihat Detail Absen Masuk</span>
                      <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              ) : buttonState.status === 'waiting_pulang' ? (
                <div className="space-y-3">
                  <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center flex-shrink-0 text-neutral-600 mt-0.5">
                      <Clock size={16} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-neutral-900">{buttonState.title}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
                        {buttonState.message}
                      </p>
                    </div>
                  </div>
                  {todayRecords.masuk?.id && (
                    <Link
                      to={`/attendance/${todayRecords.masuk.id}`}
                      className="w-full py-2.5 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold rounded-xl border border-neutral-200 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>Lihat Detail Absen Masuk</span>
                      <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              ) : buttonState.status === 'can_pulang' ? (
                <div className="space-y-3">
                  <button
                    onClick={() => handleOpenTakeModal('pulang')}
                    className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white font-bold text-sm rounded-xl flex items-center justify-center gap-3 transition-all shadow-sm active:scale-[0.99]"
                  >
                    <Camera size={18} />
                    <span>Ambil Foto &amp; Absen Pulang</span>
                  </button>
                  {todayRecords.masuk?.id && (
                    <Link
                      to={`/attendance/${todayRecords.masuk.id}`}
                      className="w-full py-2.5 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold rounded-xl border border-neutral-200 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>Lihat Detail Absen Masuk</span>
                      <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                  <div className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center text-white flex-shrink-0">
                    <Check size={20} strokeWidth={2.8} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neutral-900">Presensi Selesai</p>
                    <p className="text-xs text-neutral-500">Semua presensi hari ini sudah tercatat.</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Next Attendance Banner ── */}
            {!isLoading && (
              <div className={`mt-4 rounded-xl border px-4 py-3.5 flex items-start gap-3 ${bannerBg}`}>
                {nextAttendanceBanner}
              </div>
            )}

          </div>

          {/* ── Menu Layanan (GoPay-inspired Modern Quick Actions Grid) ── */}
          <ServiceMenuGrid
            category={category}
            onPresensiClick={handlePresensiMenuClick}
          />

          {/* B. Recent Attendance Records (Desktop: Table, Mobile: Cards) */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">Riwayat Terbaru</h3>
              <Link
                to={category === 'CS' ? '/cs/history' : '/security/history'}
                className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 flex items-center gap-1 transition-colors"
              >
                Lihat Semua <ChevronRight size={13} />
              </Link>
            </div>

            {isLoading ? (
              <div className="p-8 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : recentRecords.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar size={28} className="text-neutral-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-neutral-500">Belum ada riwayat presensi</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">Presensi Anda akan muncul di sini</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-neutral-100">
                        <th className="px-5 py-3 text-left font-semibold text-neutral-500 uppercase tracking-wide">Tanggal</th>
                        <th className="px-5 py-3 text-left font-semibold text-neutral-500 uppercase tracking-wide">Tipe</th>
                        <th className="px-5 py-3 text-left font-semibold text-neutral-500 uppercase tracking-wide">Waktu</th>
                        <th className="px-5 py-3 text-left font-semibold text-neutral-500 uppercase tracking-wide">Status</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {recentRecords.map(rec => {
                        const typeLabel = rec.attendance_type === 'masuk' ? 'Absen Masuk' : rec.attendance_type === 'istirahat' ? 'Istirahat' : 'Absen Pulang'
                        const timeStr = rec.recorded_at ? formatJakartaTime(new Date(rec.recorded_at)) : '--:--'
                        const isLate = rec.attendance_status === 'terlambat'
                        return (
                          <tr key={rec.id} className="border-b border-neutral-50 hover:bg-neutral-50/60 transition-colors">
                            <td className="px-5 py-3 font-medium text-neutral-700">{rec.work_date}</td>
                            <td className="px-5 py-3 font-semibold text-neutral-900">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{typeLabel}</span>
                                {rec.shift && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                                    {rec.shift}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3 font-mono text-neutral-700">{timeStr}</td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${isLate ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                                }`}>
                                {isLate ? 'Terlambat' : 'Tepat Waktu'}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <Link to={`/attendance/${rec.id}`} className="text-neutral-400 hover:text-neutral-900 transition-colors">
                                <ChevronRight size={15} />
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-neutral-100">
                  {recentRecords.map(rec => {
                    const typeLabel = rec.attendance_type === 'masuk' ? 'Absen Masuk' : rec.attendance_type === 'istirahat' ? 'Istirahat' : 'Absen Pulang'
                    const timeStr = rec.recorded_at ? formatJakartaTime(new Date(rec.recorded_at)) : '--:--'
                    const isLate = rec.attendance_status === 'terlambat'
                    return (
                      <Link key={rec.id} to={`/attendance/${rec.id}`} className="p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-600 flex-shrink-0">
                            <Clock size={14} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-neutral-900">{typeLabel}</p>
                            <p className="text-[11px] text-neutral-400 mt-0.5">
                              {rec.work_date} · {timeStr} {rec.shift ? `· ${rec.shift}` : ''}
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
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN (1/3 width on desktop): Schedule + Stats + Weekly chart ── */}
        <div className="space-y-5">

          {/* C. Today's Schedule Card */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">Jadwal Hari Ini</h3>
              {category === 'Security' && (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-neutral-100 border border-neutral-200 rounded-full text-neutral-700">
                  {selectedShift}
                </span>
              )}
            </div>
            <div className="px-5 py-4 space-y-3">
              {category === 'CS' ? (() => {
                const cs = (() => { try { return getCSScheduleSync() } catch { return null } })()
                return (
                  <>
                    {/* CS Masuk: 3 distinct boundaries */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 text-xs text-neutral-500 pt-0.5">
                        <Sunrise size={14} />
                        <span>Masuk</span>
                      </div>
                      <div className="text-right space-y-0.5">
                        <p className="text-[10px] text-neutral-500">
                          <span className="font-semibold text-neutral-700">Buka</span>{' '}
                          {cs ? cs.masuk.open.replace(':', '.') : '--'} WIB
                        </p>
                        <p className="text-[10px] text-neutral-500">
                          <span className="font-semibold text-neutral-700">Batas</span>{' '}
                          {cs ? cs.masuk.ontime_deadline.replace(':', '.') : '--'} WIB
                        </p>
                        <p className="text-[10px] text-neutral-500">
                          <span className="font-semibold text-neutral-700">Tutup</span>{' '}
                          {cs ? cs.masuk.close.replace(':', '.') : '--'} WIB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <Clock size={14} />
                        <span>Istirahat</span>
                      </div>
                      <span className="text-xs font-bold text-neutral-900 font-mono">{scheduleDisplay.istirahat}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <Sunset size={14} />
                        <span>Pulang</span>
                      </div>
                      <span className="text-xs font-bold text-neutral-900 font-mono">{scheduleDisplay.pulang}</span>
                    </div>
                  </>
                )
              })() : (
                <>
                  {[
                    { label: 'Masuk', value: scheduleDisplay.masuk, icon: Sunrise },
                    { label: 'Istirahat', value: scheduleDisplay.istirahat, icon: Clock },
                    { label: 'Pulang', value: scheduleDisplay.pulang, icon: Sunset },
                  ].map(item => {
                    const Icon = item.icon
                    return (
                      <div key={item.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          <Icon size={14} />
                          <span>{item.label}</span>
                        </div>
                        <span className="text-xs font-bold text-neutral-900 font-mono">{item.value}</span>
                      </div>
                    )
                  })}
                  <div className="pt-2 border-t border-neutral-100">
                    <p className="text-[10px] text-neutral-400">Kamis &amp; Jumat: Shift bergeser +30 menit</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* D. Monthly Stats */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">Rekap 30 Hari</h3>
              <TrendingUp size={15} className="text-neutral-400" />
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-xl font-bold text-neutral-900">{monthStats.hadir}</p>
                <p className="text-[10px] font-medium text-neutral-500 mt-0.5 flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 inline-block" />
                  Hadir
                </p>
              </div>
              <div>
                <p className="text-xl font-bold text-neutral-900">{monthStats.terlambat}</p>
                <p className="text-[10px] font-medium text-neutral-500 mt-0.5 flex items-center justify-center gap-1">
                  <AlertCircle size={10} />
                  Terlambat
                </p>
              </div>
            </div>
          </div>

          {/* E. Weekly Bar Chart */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">Minggu Ini</h3>
              <span className="text-[10px] text-neutral-400">Kehadiran per hari</span>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-end justify-between gap-2 h-20">
                {weekChartData.map(w => {
                  const isToday = w.dateStr === today
                  const heightPercent = w.count > 0 ? 80 : 12
                  return (
                    <div key={w.day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <div
                        className={`w-full max-w-[20px] rounded-t transition-all duration-500 ${w.count > 0
                            ? 'bg-neutral-900'
                            : isToday
                              ? 'bg-neutral-300 border border-dashed border-neutral-400'
                              : 'bg-neutral-100'
                          }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                      <span className={`text-[9px] font-medium ${isToday ? 'text-neutral-900 font-bold' : 'text-neutral-400'}`}>
                        {w.day}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* F. Location/GPS info pill */}
          <div className="bg-neutral-50 rounded-xl border border-neutral-200 px-4 py-3 flex items-center gap-2.5">
            <MapPin size={14} className="text-neutral-500 flex-shrink-0" />
            <div>
              <p className="text-[11px] font-semibold text-neutral-700">Validasi Lokasi Aktif</p>
              <p className="text-[10px] text-neutral-400">GPS akan diverifikasi saat presensi</p>
            </div>
          </div>
        </div>
      </div>

      {/* Security Shift Selection Modal (Masuk only) */}
      {isShiftPickerOpen && (
        <ShiftSelectionModal
          isOpen={isShiftPickerOpen}
          workDateStr={today}
          currentShift={selectedShift}
          onClose={() => setIsShiftPickerOpen(false)}
          onConfirm={handleConfirmSecurityShift}
        />
      )}

      {/* Attendance Modal */}
      {isTakeModalOpen && (
        <TakeAttendanceModal
          category={category}
          attendanceType={attendanceTypeToTake}
          shift={selectedShift}
          onClose={() => setIsTakeModalOpen(false)}
          onSuccess={() => {
            setIsTakeModalOpen(false)
            loadAttendanceData()
          }}
        />
      )}
    </>
  )
}
