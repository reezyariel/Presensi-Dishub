// ============================================================
// ShiftTrack — Jadwal Kerja Page (Responsive)
// Desktop: Wide cards with detailed schedule info
// Mobile: Compact cards
// CS and Security shift info from real schedule engine
// ============================================================

import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { Clock, Info, Moon, Sunrise, Sunset, Calendar } from 'lucide-react'
import { formatJakartaDate, getCSScheduleSync, getSecurityScheduleSync, preloadSchedules } from '../../lib/scheduleEngine'

interface ShiftInfo {
  name: string
  masuk: string
  pulang: string
  period: string
  icon: typeof Sunrise
  note?: string
  isMidnight?: boolean
}

export default function SchedulePage() {
  const { employeeProfile, role, isAdmin } = useAuth()
  const effectiveRole = role === 'admin' ? 'admin' : (role || employeeProfile?.employee_role || 'CS')
  const [activeTab, setActiveTab] = useState<'CS' | 'Security'>(
    effectiveRole === 'Security' ? 'Security' : 'CS'
  )

  const userDefaultShift = employeeProfile?.default_shift || 'Shift I'

  const now = new Date()
  const dayOfWeek = now.getDay()
  const isThursdayFriday = dayOfWeek === 4 || dayOfWeek === 5
  const todayStr = formatJakartaDate(now)

  // Load schedule cache on mount
  useEffect(() => { preloadSchedules() }, [])

  // Dynamic CS schedule from DB cache
  const csRaw = getCSScheduleSync()
  const csSchedule = {
    masukStart:    csRaw.masuk.open.replace(':', '.'),
    masukEnd:      csRaw.masuk.ontime_deadline.replace(':', '.'),
    masukClose:    csRaw.masuk.close?.replace(':', '.'),
    istirahatStart: csRaw.istirahat.start.replace(':', '.'),
    istirahatEnd:   csRaw.istirahat.end.replace(':', '.'),
    pulangStart:   csRaw.pulang.start.replace(':', '.'),
    pulangEnd:     csRaw.pulang.end.replace(':', '.'),
  }

  // Dynamic Security shifts from DB cache with Thu/Fri offset
  const secRaw = getSecurityScheduleSync()
  const offsetMin = isThursdayFriday ? secRaw.thursday_friday_shift_minutes : 0

  const addMin = (time: string, min: number): string => {
    const [h, m] = time.split(':').map(Number)
    const total = h * 60 + m + min
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}.${String(total % 60).padStart(2, '0')}`
  }
  const fmt = (t: string) => t.replace(':', '.')

  const securityShifts: ShiftInfo[] = [
    {
      name: 'Shift I',
      masuk: `${addMin(secRaw.shifts['Shift I'].start, offsetMin)} WIB`,
      pulang: `${addMin(secRaw.shifts['Shift I'].end, offsetMin)} WIB`,
      period: 'Pagi',
      icon: Sunrise,
      note: 'Shift pagi reguler',
    },
    {
      name: 'Shift II',
      masuk: `${addMin(secRaw.shifts['Shift II'].start, offsetMin)} WIB`,
      pulang: `${addMin(secRaw.shifts['Shift II'].end, offsetMin)} WIB`,
      period: 'Sore',
      icon: Sunset,
      note: 'Shift sore reguler',
    },
    {
      name: 'Shift III',
      masuk: `${addMin(secRaw.shifts['Shift III'].start, offsetMin)} WIB`,
      pulang: `${addMin(secRaw.shifts['Shift III'].end, offsetMin)} WIB (H+1)`,
      period: 'Malam',
      icon: Moon,
      note: 'Shift malam, berakhir hari berikutnya',
      isMidnight: true,
    },
  ]
  // suppress unused import warning
  void fmt

  return (
    <div className="space-y-5">
      {/* ─── Page Header ─── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">
            {isAdmin ? 'Jadwal Kerja Seluruh Divisi' : `Jadwal Kerja Saya (${effectiveRole})`}
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">{todayStr}</p>
        </div>
        {isThursdayFriday && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-full px-3 py-1.5 flex-shrink-0">
            <Clock size={12} />
            Jadwal Hari Khusus (+30 mnt)
          </span>
        )}
      </div>

      {/* ─── Segmented Tab: ONLY FOR ADMIN ─── */}
      {isAdmin && (
        <div className="flex items-center p-1 bg-neutral-100 rounded-xl border border-neutral-200 max-w-xs">
          <button
            type="button"
            onClick={() => setActiveTab('CS')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'CS' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Customer Service
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('Security')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'Security' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Security
          </button>
        </div>
      )}

      {/* ─── CS Schedule ─── */}
      {activeTab === 'CS' && (
        <div className="space-y-4">
          {/* Main schedule cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Masuk Card */}
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

            {/* Istirahat Card */}
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
                <span className="text-[10px] font-semibold text-neutral-600">Siang • Durasi 60 menit</span>
              </div>
            </div>

            {/* Pulang Card */}
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

          {/* CS Info card */}
          <div className="bg-neutral-50 rounded-2xl border border-neutral-200 p-4 flex items-start gap-3">
            <Info size={16} className="text-neutral-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-neutral-600">
              <p className="font-semibold text-neutral-800">Ketentuan Jadwal Customer Service</p>
              <ul className="space-y-1 text-[11px] list-disc ml-3">
                <li>Jadwal berlaku tetap setiap hari kerja (Senin–Jumat).</li>
                <li>Rentang check-in: {csSchedule.masukStart} – {csSchedule.masukEnd} WIB.</li>
                <li>Rentang check-out: {csSchedule.pulangStart} – {csSchedule.pulangEnd} WIB.</li>
                <li>Tidak ada variasi shift untuk divisi CS.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ─── Security Schedule ─── */}
      {activeTab === 'Security' && (
        <div className="space-y-4">
          {/* Shift cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {securityShifts.map(shift => {
              const Icon = shift.icon
              const isMyShift = shift.name === userDefaultShift
              return (
                <div
                  key={shift.name}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                    isMyShift
                      ? 'border-neutral-900 ring-2 ring-neutral-900/10'
                      : shift.isMidnight
                      ? 'border-neutral-300'
                      : 'border-neutral-200'
                  }`}
                >
                  <div className="px-5 pt-5 pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          shift.isMidnight || isMyShift ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'
                        }`}>
                          <Icon size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-neutral-900">{shift.name}</p>
                          <p className="text-[10px] text-neutral-500">{shift.note}</p>
                        </div>
                      </div>
                      {isMyShift && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-white">
                          Shift Saya
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                          <Sunrise size={11} /> Masuk
                        </span>
                        <span className="text-sm font-bold text-neutral-900 font-mono">{shift.masuk}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                          <Sunset size={11} /> Pulang
                        </span>
                        <span className={`text-sm font-bold font-mono ${shift.isMidnight ? 'text-neutral-700' : 'text-neutral-900'}`}>
                          {shift.pulang}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={`px-5 py-2 border-t ${shift.isMidnight ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-100'}`}>
                    <span className={`text-[10px] font-semibold ${shift.isMidnight ? 'text-neutral-300' : 'text-neutral-600'}`}>
                      {shift.period}
                      {shift.isMidnight && ' · Lintas tengah malam'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Thursday/Friday special note */}
          {isThursdayFriday && (
            <div className="bg-neutral-900 text-white rounded-2xl p-4 flex items-start gap-3">
              <Calendar size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold">Jadwal Hari Ini: Kamis/Jumat (+30 Menit)</p>
                <p className="text-[11px] text-neutral-300 mt-0.5">
                  Seluruh shift Security bergeser +30 menit sesuai aturan operasional resmi. Jadwal di atas sudah menampilkan waktu yang disesuaikan.
                </p>
              </div>
            </div>
          )}

          {/* Security Info card */}
          <div className="bg-neutral-50 rounded-2xl border border-neutral-200 p-4 flex items-start gap-3">
            <Info size={16} className="text-neutral-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-neutral-600">
              <p className="font-semibold text-neutral-800">Ketentuan Jadwal Security</p>
              <ul className="space-y-1 text-[11px] list-disc ml-3">
                <li>Security memiliki 3 shift rotasi: Shift I (Pagi), Shift II (Sore), Shift III (Malam).</li>
                <li>Shift III melewati tengah malam — pulang di hari berikutnya.</li>
                <li>Khusus Kamis dan Jumat, semua shift bergeser +30 menit.</li>
                <li>Shift aktif ditentukan oleh admin dan tertera saat presensi.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
