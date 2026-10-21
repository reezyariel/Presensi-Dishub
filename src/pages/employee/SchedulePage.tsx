// ============================================================
// ShiftTrack — Jadwal Kerja Page (Responsive & Division-Safe)
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
  type CSSchedule,
  type SecuritySchedule,
  type ShiftSchedule
} from '../../lib/scheduleEngine'
import type { ShiftType } from '../../types/attendance'

interface ShiftDisplayInfo {
  name: ShiftType
  period: string
  masuk: string
  masukClose: string
  pulang: string
  pulangClose: string
  isMidnight: boolean
  note: string
}

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
  const dayOfWeek = now.getDay()
  const isThursdayFriday = dayOfWeek === 4 || dayOfWeek === 5
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
    masukStart:    csScheduleData.masuk.open.replace(':', '.'),
    masukEnd:      csScheduleData.masuk.ontime_deadline.replace(':', '.'),
    masukClose:    csScheduleData.masuk.close?.replace(':', '.'),
    istirahatStart: csScheduleData.istirahat.start.replace(':', '.'),
    istirahatEnd:   csScheduleData.istirahat.end.replace(':', '.'),
    pulangStart:   csScheduleData.pulang.start.replace(':', '.'),
    pulangEnd:     csScheduleData.pulang.end.replace(':', '.'),
  }

  // ─────────────────────────────────────────────────────────────
  // Security Schedule Computation (with Thursday/Friday shift offset)
  // ─────────────────────────────────────────────────────────────
  const offsetMin = isThursdayFriday ? secScheduleData.thursday_friday_shift_minutes : 0

  const addMin = (timeStr: string, min: number): string => {
    if (!timeStr) return '--.--'
    const [h, m] = timeStr.split(':').map(Number)
    const total = (h * 60 + m + min + 1440) % 1440
    const hh = String(Math.floor(total / 60)).padStart(2, '0')
    const mm = String(total % 60).padStart(2, '0')
    return `${hh}.${mm}`
  }

  const formatShift = (name: ShiftType, period: string, note: string): ShiftDisplayInfo => {
    const rawShift: ShiftSchedule = secScheduleData.shifts[name]
    const masuk = `${addMin(rawShift.start, offsetMin)} WIB`
    const masukClose = `${addMin(rawShift.window_end, offsetMin)} WIB`
    const pulang = `${addMin(rawShift.end, offsetMin)} WIB${rawShift.end_next_day ? ' (H+1)' : ''}`
    const pulangClose = `${addMin(rawShift.end_window_end, offsetMin)} WIB${rawShift.end_window_end_next_day ? ' (H+1)' : ''}`

    return {
      name,
      period,
      masuk,
      masukClose,
      pulang,
      pulangClose,
      isMidnight: rawShift.end_next_day,
      note,
    }
  }

  const securityShifts: ShiftDisplayInfo[] = [
    formatShift('Shift I', 'Pagi', 'Shift pagi reguler'),
    formatShift('Shift II', 'Sore', 'Shift sore reguler'),
    formatShift('Shift III', 'Malam', 'Shift malam, berakhir keesokan hari'),
  ]

  // User's assigned shift from verified database profile
  const userAssignedShiftName = employeeProfile?.default_shift || null
  const myShiftInfo = securityShifts.find(s => s.name === userAssignedShiftName) || null

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

        {/* Thursday/Friday Badge for Security */}
        {effectiveCategory === 'Security' && isThursdayFriday && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-full px-3 py-1.5 self-start">
            <Clock size={12} />
            Hari Khusus (+{secScheduleData.thursday_friday_shift_minutes} mnt)
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
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'CS' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Cleaning Service
          </button>
          <button
            type="button"
            id="tab-schedule-security"
            onClick={() => setActiveTab('Security')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'Security' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Security
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          SECURITY VIEW: 24h Rotation & Personal Shift
      ────────────────────────────────────────────────────────── */}
      {effectiveCategory === 'Security' && (
        <div className="space-y-5">
          {/* ── 1. Hero Card "Shift Saya Hari Ini" (for employees) ── */}
          {!isAdmin && myShiftInfo && (
            <div className="bg-neutral-900 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 pt-5 pb-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <Sparkles size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                        Shift Saya Hari Ini
                      </p>
                      <h3 className="text-base font-bold text-white">
                        {myShiftInfo.name} — {myShiftInfo.period}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {myShiftInfo.isMidnight && (
                      <span className="text-[10px] font-bold text-neutral-300 bg-white/10 px-2.5 py-1 rounded-full border border-white/10">
                        Lintas Hari (H+1)
                      </span>
                    )}
                    {isThursdayFriday && (
                      <span className="text-[10px] font-bold text-white/70 bg-white/10 px-2.5 py-1 rounded-full border border-white/10">
                        +{secScheduleData.thursday_friday_shift_minutes} mnt
                      </span>
                    )}
                  </div>
                </div>

                {/* Grid details: Masuk, Batas Masuk, Pulang, Batas Pulang */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Presensi Masuk Card */}
                  <div className="bg-white/[0.07] border border-white/10 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sunrise size={13} className="text-white/60" />
                      <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">
                        Presensi Masuk
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/50">Jam Masuk</span>
                      <span className="text-xl font-black text-white font-mono">{myShiftInfo.masuk}</span>
                    </div>
                    <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-white/5">
                      <span className="text-[11px] text-white/40">Batas Tepat Waktu</span>
                      <span className="text-xs font-semibold text-white/70 font-mono">{myShiftInfo.masukClose}</span>
                    </div>
                  </div>

                  {/* Presensi Pulang Card */}
                  <div className="bg-white/[0.07] border border-white/10 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sunset size={13} className="text-white/60" />
                      <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">
                        Presensi Pulang
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/50">Jam Pulang</span>
                      <span className="text-xl font-black text-white font-mono">{myShiftInfo.pulang}</span>
                    </div>
                    <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-white/5">
                      <span className="text-[11px] text-white/40">Batas Check-out</span>
                      <span className="text-xs font-semibold text-white/70 font-mono">{myShiftInfo.pulangClose}</span>
                    </div>
                  </div>
                </div>
              </div>

              {myShiftInfo.isMidnight && (
                <div className="px-5 py-3 bg-white/5 border-t border-white/10 flex items-center gap-2">
                  <Moon size={13} className="text-white/40 flex-shrink-0" />
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    Shift III melintasi tengah malam — jam pulang dan batas akhir check-out jatuh pada keesokan harinya (H+1).
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
                    Shift default akun Anda belum ditetapkan oleh administrator. Silakan hubungi admin HR atau atasan Security Anda untuk penetapan rotasi shift.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Thursday/Friday Note Banner ── */}
          {isThursdayFriday && (
            <div className="bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-2xl p-4 flex items-start gap-3">
              <Calendar size={16} className="flex-shrink-0 mt-0.5 text-neutral-600" />
              <div>
                <p className="text-xs font-bold text-neutral-900">
                  Penyesuaian Hari Kamis & Jumat (+{secScheduleData.thursday_friday_shift_minutes} Menit)
                </p>
                <p className="text-[11px] text-neutral-600 mt-0.5 leading-relaxed">
                  Semua waktu shift Security (Shift I, II, dan III) dimajukan +{secScheduleData.thursday_friday_shift_minutes} menit sesuai Surat Keputusan Operasional Dishub. Waktu yang tertera di atas dan di bawah sudah disesuaikan otomatis.
                </p>
              </div>
            </div>
          )}

          {/* ── 2. Reference Cards: 3-Shift 24-Hour Rotation ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                <Shield size={12} className="text-neutral-500" />
                Referensi Rotasi 24 Jam Security
              </p>
              <span className="text-[11px] text-neutral-500">3 Shift Bergantian</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {securityShifts.map(shift => {
                const isMyShift = shift.name === userAssignedShiftName
                const Icon = shift.name === 'Shift I' ? Sunrise : shift.name === 'Shift II' ? Sunset : Moon

                return (
                  <div
                    key={shift.name}
                    className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                      isMyShift && !isAdmin
                        ? 'border-neutral-900 ring-2 ring-neutral-900/10'
                        : shift.isMidnight
                        ? 'border-neutral-300'
                        : 'border-neutral-200'
                    }`}
                  >
                    <div className="px-5 pt-5 pb-4">
                      {/* Card Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isMyShift && !isAdmin
                                ? 'bg-neutral-900 text-white'
                                : shift.isMidnight
                                ? 'bg-neutral-800 text-white'
                                : 'bg-neutral-100 text-neutral-700'
                            }`}
                          >
                            <Icon size={16} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-neutral-900">{shift.name}</p>
                            <p className="text-[10px] text-neutral-500">{shift.note}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isMyShift && !isAdmin && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-white">
                              Shift Anda
                            </span>
                          )}
                          {shift.isMidnight && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-200">
                              H+1
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Shift Hours Grid */}
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                            <Sunrise size={11} className="text-neutral-400" /> Jam Masuk
                          </span>
                          <span className="font-bold text-neutral-900 font-mono">{shift.masuk}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                            <Clock size={11} className="text-neutral-400" /> Batas Masuk
                          </span>
                          <span className="font-semibold text-neutral-600 font-mono">{shift.masukClose}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-neutral-100">
                          <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                            <Sunset size={11} className="text-neutral-400" /> Jam Pulang
                          </span>
                          <span className="font-bold text-neutral-900 font-mono">{shift.pulang}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                            <Clock size={11} className="text-neutral-400" /> Batas Pulang
                          </span>
                          <span className="font-semibold text-neutral-600 font-mono">{shift.pulangClose}</span>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`px-5 py-2.5 border-t text-[10px] font-semibold flex items-center justify-between ${
                        shift.isMidnight
                          ? 'bg-neutral-900 text-white border-neutral-800'
                          : 'bg-neutral-50 text-neutral-600 border-neutral-100'
                      }`}
                    >
                      <span>Periode: {shift.period}</span>
                      {shift.isMidnight && <span>Selesai di hari berikutnya</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── 3. Ketentuan Jadwal Security ── */}
          <div className="bg-neutral-50 rounded-2xl border border-neutral-200 p-4 flex items-start gap-3">
            <Info size={16} className="text-neutral-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-neutral-600">
              <p className="font-semibold text-neutral-800">Ketentuan Jadwal Security (24 Jam)</p>
              <ul className="space-y-1 text-[11px] list-disc ml-3">
                <li>Security beroperasi 24 jam dengan rotasi 3 shift: Shift I (Pagi), Shift II (Sore), dan Shift III (Malam).</li>
                <li>Shift III melewati tengah malam, sehingga jam pulang dan batas akhir presensi pulang jatuh pada hari berikutnya (H+1).</li>
                <li>Khusus hari Kamis dan Jumat, seluruh shift dimajukan +{secScheduleData.thursday_friday_shift_minutes} menit sesuai jadwal operasional.</li>
                <li>Shift aktif setiap petugas ditentukan oleh Administrator dan divalidasi langsung saat pengambilan presensi.</li>
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
