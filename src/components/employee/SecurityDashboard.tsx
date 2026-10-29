// ============================================================
// SIPATEN — Security Operational Dashboard Components
// Dedicated professional operational summary for Security officers:
// 1. Shift Status Card: Belum Absen Masuk, Sedang Bertugas, Menunggu Pulang, Shift Selesai
// 2. Schedule Card: Live schedule from backend settings for all shifts
// 3. 30-Day Operational Recap: Shift selesai, terlambat masuk, pulang belum lengkap, total catatan
// 4. Shift History: Paired shift log (work date, shift number, masuk, pulang, status)
// 5. Weekly Activity: Informative chart with proper empty state (no fake black bars)
// 6. Overnight Shift III crossover support with H+1 indicators
// ============================================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield, CheckCircle2, AlertCircle, Clock, Sunrise, Sunset,
  ChevronRight, Calendar, BarChart2, AlertTriangle, FileText,
  Camera,
} from 'lucide-react'
import type { SecurityShiftOption } from '../../types/attendance'
import {
  getSecuritySchedule,
  getSecurityScheduleSync,
  getWeekendSessionSchedule,
  isWeekendSession,
  getSecurityAvailableOptions,
  formatJakartaDate,
  type Security30DayRecap,
  type SecurityShiftSession,
} from '../../lib/scheduleEngine'

export interface WeekDayCount {
  day: string
  label: string
  count: number
  dateStr: string
}

function getShiftTimeLabel(shift: SecurityShiftOption): string {
  switch (shift) {
    case 'Shift I': return '07.00 - 15.00'
    case 'Shift II': return '15.00 - 23.00'
    case 'Shift III': return '23.00 - 07.00'
    case 'Sesi Pagi': return '08.00 - 20.00'
    case 'Sesi Malam': return '20.00 - 08.00'
    default: return ''
  }
}

// ─────────────────────────────────────────────────────────────
// 1. Shift Status Card
// ─────────────────────────────────────────────────────────────
interface SecurityShiftStatusCardProps {
  status: 'belum_masuk' | 'sedang_bertugas' | 'menunggu_pulang' | 'selesai'
  selectedShift: SecurityShiftOption | null
  workDateStr: string
  masukTime: string
  pulangTime: string
  isLate: boolean
  isOvernight: boolean
  buttonStateTitle?: string
  canTakeMasuk: boolean
  canTakePulang: boolean
  waitingMessage?: string
  masukRecordId?: string
  onOpenTakeModal: (type: 'masuk' | 'pulang') => void
  onChangeShiftClick?: () => void
  onSelectShift?: (shift: SecurityShiftOption) => void
}

export function SecurityShiftStatusCard({
  status,
  selectedShift,
  workDateStr,
  masukTime,
  pulangTime,
  isLate,
  isOvernight,
  canTakeMasuk,
  canTakePulang,
  waitingMessage,
  masukRecordId,
  onOpenTakeModal,
  onChangeShiftClick,
  onSelectShift,
}: SecurityShiftStatusCardProps) {
  const availableOptions = getSecurityAvailableOptions(workDateStr)

  const statusConfig = {
    belum_masuk: {
      badge: selectedShift ? 'Belum Absen Masuk' : 'Shift Belum Dipilih',
      badgeClass: selectedShift
        ? 'bg-neutral-100 text-neutral-700 border-neutral-300'
        : 'bg-amber-50 text-amber-800 border-amber-300',
      dotClass: selectedShift ? 'bg-neutral-400' : 'bg-amber-500 animate-pulse',
      headline: selectedShift ? 'Siap Memulai Dinas?' : 'Pilih Shift Tugas Anda',
      desc: selectedShift
        ? 'Anda belum mencatat presensi masuk untuk shift ini. Pastikan Anda berada dalam radius dinas.'
        : 'Silakan pilih shift tugas Anda hari ini (Shift I, Shift II, atau Shift III) sebelum melakukan presensi.',
      icon: Clock,
    },
    sedang_bertugas: {
      badge: 'Sedang Bertugas',
      badgeClass: 'bg-neutral-900 text-white border-neutral-800',
      dotClass: 'bg-emerald-400 animate-pulse',
      headline: 'Dinas Aktif Berlangsung',
      desc: `Presensi masuk tercatat pukul ${masukTime} WIB. Masa dinas penjagaan sedang berjalan.`,
      icon: Shield,
    },
    menunggu_pulang: {
      badge: 'Menunggu Absen Pulang',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      dotClass: 'bg-amber-500 animate-pulse',
      headline: 'Waktunya Absen Pulang',
      desc: 'Jendela presensi pulang sedang dibuka. Silakan lakukan pengambilan foto selfie untuk check-out.',
      icon: Sunset,
    },
    selesai: {
      badge: 'Shift Selesai',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      dotClass: 'bg-emerald-600',
      headline: 'Tugas Shift Selesai',
      desc: 'Presensi masuk dan pulang telah lengkap tercatat. Terima kasih atas dedikasi dan pengabdian Anda.',
      icon: CheckCircle2,
    },
  }[status]

  const StatusIcon = statusConfig.icon

  return (
    <div id="presensi-hari-ini-card" className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden scroll-mt-20">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-neutral-700" />
          <h3 className="text-sm font-bold text-neutral-900">Status Operasional Shift</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 font-medium">
            {formatJakartaDate(workDateStr)}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusConfig.badgeClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
            {statusConfig.badge}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Shift Badge & Banner */}
        <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-xs ${
              selectedShift ? 'bg-white border-neutral-200 text-neutral-700' : 'bg-amber-100/70 border-amber-200 text-amber-700'
            }`}>
              <StatusIcon size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-neutral-900">
                  {selectedShift || 'Pilih Shift Tugas'}
                </span>
                {isOvernight && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-800">
                    Lintas Hari (Overnight)
                  </span>
                )}
                {!selectedShift && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    Belum Dipilih
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">{statusConfig.desc}</p>
            </div>
          </div>

          {status === 'belum_masuk' && onChangeShiftClick && (
            <button
              onClick={onChangeShiftClick}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                selectedShift
                  ? 'text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-100 border-neutral-200'
                  : 'text-neutral-900 bg-amber-200/70 hover:bg-amber-200 border-amber-300 font-bold'
              }`}
            >
              {selectedShift ? 'Ganti Shift' : 'Pilih Shift'}
            </button>
          )}
        </div>

        {/* Quick Shift Selection Tabs/Buttons on Card */}
        {status === 'belum_masuk' && (
          <div className="space-y-2 pt-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-800">Pilih Shift Hari Ini:</span>
              <span className="text-[11px] text-neutral-400">
                {selectedShift ? `Shift aktif: ${selectedShift}` : 'Klik untuk memilih shift'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {availableOptions.map(opt => {
                const isSelected = selectedShift === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onSelectShift?.(opt)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      isSelected
                        ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm ring-2 ring-neutral-900/10'
                        : 'bg-white hover:bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <span>{opt}</span>
                    <span className={`text-[10px] font-normal ${isSelected ? 'text-neutral-300' : 'text-neutral-400'}`}>
                      {getShiftTimeLabel(opt)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Check-In / Check-Out Overview Cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Check-In Box */}
          <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
            <div className="flex items-center gap-2 mb-1.5">
              <Sunrise size={15} className="text-neutral-500" />
              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Check-In</span>
            </div>
            <p className="text-2xl font-bold text-neutral-900 font-mono tabular-nums">
              {masukTime !== '--:--' ? masukTime : '--:--'}
            </p>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {masukTime !== '--:--' ? (
                <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isLate ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-800'
                }`}>
                  {isLate ? 'Terlambat' : 'Tepat Waktu'}
                </span>
              ) : (
                <span className="text-[10px] text-neutral-400">Belum Tercatat</span>
              )}
            </div>
          </div>

          {/* Check-Out Box */}
          <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
            <div className="flex items-center gap-2 mb-1.5">
              <Sunset size={15} className="text-neutral-500" />
              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Check-Out</span>
            </div>
            <p className="text-2xl font-bold text-neutral-900 font-mono tabular-nums">
              {pulangTime !== '--:--' ? pulangTime : '--:--'}
            </p>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {pulangTime !== '--:--' ? (
                <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-800">
                  {isOvernight ? 'Selesai (H+1)' : 'Selesai'}
                </span>
              ) : status === 'sedang_bertugas' ? (
                <span className="text-[10px] font-medium text-neutral-500">Menunggu Waktu Pulang</span>
              ) : (
                <span className="text-[10px] text-neutral-400">Belum Tercatat</span>
              )}
            </div>
          </div>
        </div>

        {/* Action Button Section */}
        <div>
          {!selectedShift ? (
            <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200 space-y-2.5">
              <div className="flex items-center gap-2 text-amber-900">
                <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
                <span className="text-xs font-bold">Pilih Shift Tugas Terlebih Dahulu</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Tentukan shift dinas Anda (Shift I, Shift II, atau Shift III) menggunakan tombol di atas sebelum melakukan presensi masuk.
              </p>
              {onChangeShiftClick && (
                <button
                  type="button"
                  onClick={onChangeShiftClick}
                  className="w-full py-3 bg-neutral-900 hover:bg-black text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99]"
                >
                  <Shield size={15} />
                  <span>Buka Dialog Pemilihan Shift</span>
                </button>
              )}
            </div>
          ) : canTakeMasuk ? (
            <button
              onClick={() => onOpenTakeModal('masuk')}
              className="w-full py-4 bg-neutral-900 hover:bg-black text-white font-bold text-sm rounded-xl flex items-center justify-center gap-3 transition-all shadow-sm active:scale-[0.99]"
            >
              <Camera size={19} />
              <span>Ambil Foto &amp; Absen Masuk ({selectedShift})</span>
            </button>
          ) : canTakePulang ? (
            <button
              onClick={() => onOpenTakeModal('pulang')}
              className="w-full py-4 bg-neutral-900 hover:bg-black text-white font-bold text-sm rounded-xl flex items-center justify-center gap-3 transition-all shadow-sm active:scale-[0.99]"
            >
              <Camera size={19} />
              <span>Ambil Foto &amp; Absen Pulang ({selectedShift})</span>
            </button>
          ) : status === 'selesai' ? (
            <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-neutral-900">Semua Presensi Shift Selesai</p>
                  <p className="text-[11px] text-neutral-500">Istirahat yang cukup untuk dinas berikutnya.</p>
                </div>
              </div>
              {masukRecordId && (
                <Link
                  to={`/attendance/${masukRecordId}`}
                  className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 flex items-center gap-1"
                >
                  Detail <ChevronRight size={13} />
                </Link>
              )}
            </div>
          ) : (
            <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
              <div className="flex items-center gap-2.5 text-neutral-700">
                <Clock size={16} />
                <span className="text-xs font-bold">{waitingMessage || 'Menunggu Jendela Jadwal Presensi'}</span>
              </div>
              <button
                disabled
                className="w-full py-3 bg-neutral-200 text-neutral-400 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <Camera size={16} />
                <span>Tombol Presensi Dinonaktifkan di Luar Jadwal</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 2. Schedule Card (Live from Admin Backend)
// ─────────────────────────────────────────────────────────────
interface SecurityScheduleCardProps {
  currentShift: SecurityShiftOption | null
  workDateStr: string
  onSelectShift?: (shift: SecurityShiftOption) => void
  canChangeShift?: boolean
}

export function SecurityScheduleCard({
  currentShift,
  workDateStr,
  onSelectShift,
  canChangeShift = true,
}: SecurityScheduleCardProps) {
  const shiftList = getSecurityAvailableOptions(workDateStr)
  const [activeTab, setActiveTab] = useState<SecurityShiftOption>(currentShift || shiftList[0])

  useEffect(() => {
    if (currentShift) {
      setActiveTab(currentShift)
    }
  }, [currentShift])

  const secSettings = getSecurityScheduleSync()
  const offsetMin = secSettings.thursday_friday_shift_minutes || 0

  // Get details for active tab
  const getTabDetails = (tab: SecurityShiftOption) => {
    if (isWeekendSession(tab)) {
      const ws = getWeekendSessionSchedule(tab)
      return {
        name: tab,
        sub: tab === 'Sesi Pagi' ? 'Sesi Akhir Pekan Pagi' : 'Sesi Akhir Pekan Malam',
        masuk: `${ws.open.replace(':', '.')} – ${ws.close.replace(':', '.')} WIB`,
        pulang: tab === 'Sesi Pagi' ? '20.00 WIB' : '08.00 WIB (H+1)',
        duration: '12 Jam Dinas Operasional',
        isOvernight: tab === 'Sesi Malam',
      }
    }

    const s = getSecuritySchedule(workDateStr, tab as 'Shift I' | 'Shift II' | 'Shift III')
    const sub =
      tab === 'Shift I'
        ? 'Pagi – Sore'
        : tab === 'Shift II'
          ? 'Sore – Malam'
          : 'Malam – Pagi (Lintas Hari)'

    return {
      name: tab,
      sub,
      masuk: `${s.start.replace(':', '.')} – ${s.window_end.replace(':', '.')} WIB`,
      pulang: `${s.end.replace(':', '.')} – ${s.end_window_end.replace(':', '.')}${s.end_next_day ? ' (H+1)' : ''} WIB`,
      duration: tab === 'Shift I' ? '9 Jam' : tab === 'Shift II' ? '4.5 Jam' : '11.5 Jam',
      isOvernight: s.end_next_day,
    }
  }

  const activeDetails = getTabDetails(activeTab)

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Jadwal Shift Security</h3>
          <p className="text-[11px] text-neutral-400">Konfigurasi jadwal resmi dari Admin</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
          Asia/Jakarta
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Shift selector tabs */}
        <div className="flex rounded-xl bg-neutral-100 p-1 gap-1">
          {shiftList.map(s => {
            const isCurrent = s === currentShift
            const isSelected = s === activeTab
            return (
              <button
                key={s}
                onClick={() => {
                  setActiveTab(s)
                  if (canChangeShift && onSelectShift) {
                    onSelectShift(s)
                  }
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                  isSelected
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                <span>{s}</span>
                {isCurrent && (
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 inline-block" title="Shift Terpilih" />
                )}
              </button>
            )
          })}
        </div>
        {!currentShift && canChangeShift && (
          <p className="text-[10px] text-neutral-400 text-center">Klik tab shift untuk memilih shift dinas Anda</p>
        )}

        {/* Selected Shift Timings Box */}
        <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-900">{activeDetails.name}</span>
            <span className="text-[11px] text-neutral-500">{activeDetails.sub}</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 flex items-center gap-1.5">
                <Sunrise size={14} className="text-neutral-400" />
                Jendela Masuk
              </span>
              <span className="font-mono font-bold text-neutral-800">{activeDetails.masuk}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-500 flex items-center gap-1.5">
                <Sunset size={14} className="text-neutral-400" />
                Jendela Pulang
              </span>
              <span className="font-mono font-bold text-neutral-800">{activeDetails.pulang}</span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-neutral-200/60 text-[11px]">
              <span className="text-neutral-400">Durasi Kerja</span>
              <span className="font-medium text-neutral-600">{activeDetails.duration}</span>
            </div>
          </div>
        </div>

        {/* Kamis-Jumat offset alert if present */}
        {offsetMin > 0 && (
          <div className="text-[11px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 flex items-center gap-2">
            <Clock size={13} className="text-neutral-400 flex-shrink-0" />
            <span>Penyesuaian Kamis–Jumat (+{offsetMin} menit) otomatis diperhitungkan sistem.</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 3. 30-Day Operational Recap Card
// ─────────────────────────────────────────────────────────────
interface Security30DayRecapCardProps {
  recap: Security30DayRecap
}

export function Security30DayRecapCard({ recap }: Security30DayRecapCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Rekap 30 Hari</h3>
          <p className="text-[11px] text-neutral-400">Ringkasan operasional data aktual</p>
        </div>
        <Shield size={16} className="text-neutral-400" />
      </div>

      <div className="p-4 grid grid-cols-2 gap-3">
        {/* Shift Selesai */}
        <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500">Shift Selesai</span>
            <CheckCircle2 size={14} className="text-neutral-700" />
          </div>
          <p className="text-xl font-bold text-neutral-900 font-mono">{recap.shiftSelesai}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Masuk &amp; pulang lengkap</p>
        </div>

        {/* Terlambat Masuk */}
        <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500">Terlambat</span>
            <AlertCircle size={14} className="text-neutral-500" />
          </div>
          <p className="text-xl font-bold text-neutral-900 font-mono">{recap.keterlambatan}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Lewat batas jadwal</p>
        </div>

        {/* Pulang Belum Lengkap */}
        <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500">Belum Pulang</span>
            <AlertTriangle size={14} className="text-neutral-500" />
          </div>
          <p className="text-xl font-bold text-neutral-900 font-mono">{recap.pulangBelumLengkap}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Shift lampau tanpa checkout</p>
        </div>

        {/* Total Catatan */}
        <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500">Total Catatan</span>
            <FileText size={14} className="text-neutral-500" />
          </div>
          <p className="text-xl font-bold text-neutral-900 font-mono">{recap.totalCatatan}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">{recap.totalShifts} sesi shift kerja</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 4. Shift History Card (Paired Sessions)
// ─────────────────────────────────────────────────────────────
interface SecurityShiftHistoryCardProps {
  sessions: SecurityShiftSession[]
  isLoading: boolean
}

export function SecurityShiftHistoryCard({ sessions, isLoading }: SecurityShiftHistoryCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Riwayat Shift Operasional</h3>
          <p className="text-[11px] text-neutral-400">Pasangan presensi masuk dan pulang per shift</p>
        </div>
        <Link
          to="/security/history"
          className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 flex items-center gap-1 transition-colors"
        >
          Lihat Semua <ChevronRight size={13} />
        </Link>
      </div>

      {isLoading ? (
        <div className="p-8 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="p-8 text-center">
          <Calendar size={28} className="text-neutral-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-neutral-500">Belum ada riwayat shift</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">Catatan kehadiran shift Anda akan ditampilkan di sini</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-100 text-neutral-500 uppercase font-semibold">
                  <th className="px-5 py-3 text-left">Tanggal Shift</th>
                  <th className="px-5 py-3 text-left">Shift</th>
                  <th className="px-5 py-3 text-left">Masuk (Check-In)</th>
                  <th className="px-5 py-3 text-left">Pulang (Check-Out)</th>
                  <th className="px-5 py-3 text-left">Status Shift</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {sessions.map(s => {
                  const statusBadge = {
                    selesai: { label: 'Selesai', cls: 'bg-neutral-100 text-neutral-800 border-neutral-200' },
                    sedang_bertugas: { label: 'Sedang Bertugas', cls: 'bg-neutral-900 text-white' },
                    menunggu_pulang: { label: 'Menunggu Pulang', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
                    tidak_lengkap: { label: 'Belum Pulang', cls: 'bg-neutral-200 text-neutral-700' },
                  }[s.status]

                  const detailId = s.masukRecordId || s.pulangRecordId

                  return (
                    <tr key={s.id} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="px-5 py-3 font-medium text-neutral-800">
                        {formatJakartaDate(s.work_date)}
                      </td>
                      <td className="px-5 py-3 font-semibold text-neutral-900">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{s.shift}</span>
                          {s.isOvernight && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                              H+1
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-neutral-700">
                        <div className="flex items-center gap-1.5">
                          <span>{s.masukTime}</span>
                          {s.masuk && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full ${
                              s.isLate ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                            }`}>
                              {s.isLate ? 'Terlambat' : 'Tepat Waktu'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-neutral-700">
                        <span>{s.pulangTime}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadge.cls}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {detailId && (
                          <Link to={`/attendance/${detailId}`} className="text-neutral-400 hover:text-neutral-900">
                            <ChevronRight size={15} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-neutral-100">
            {sessions.map(s => {
              const statusBadge = {
                selesai: { label: 'Selesai', cls: 'bg-neutral-100 text-neutral-800 border-neutral-200' },
                sedang_bertugas: { label: 'Sedang Bertugas', cls: 'bg-neutral-900 text-white' },
                menunggu_pulang: { label: 'Menunggu Pulang', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
                tidak_lengkap: { label: 'Belum Pulang', cls: 'bg-neutral-200 text-neutral-700' },
              }[s.status]

              const detailId = s.masukRecordId || s.pulangRecordId

              return (
                <div key={s.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-neutral-900">{s.shift}</span>
                      {s.isOvernight && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                          Lintas Hari (H+1)
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-500">{formatJakartaDate(s.work_date)}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-100">
                      <span className="text-[10px] text-neutral-400 block mb-0.5">Masuk</span>
                      <span className="font-mono font-bold text-neutral-800">{s.masukTime}</span>
                      {s.masuk && (
                        <span className={`ml-1 text-[9px] font-semibold px-1 py-0.2 rounded ${s.isLate ? 'bg-neutral-900 text-white' : 'text-neutral-500'}`}>
                          {s.isLate ? 'Terlambat' : 'Tepat'}
                        </span>
                      )}
                    </div>

                    <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-100">
                      <span className="text-[10px] text-neutral-400 block mb-0.5">Pulang</span>
                      <span className="font-mono font-bold text-neutral-800">{s.pulangTime}</span>
                    </div>
                  </div>

                  {detailId && (
                    <div className="text-right pt-0.5">
                      <Link
                        to={`/attendance/${detailId}`}
                        className="text-[11px] font-semibold text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-0.5"
                      >
                        Lihat Detail Presensi <ChevronRight size={12} />
                      </Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 5. Weekly Chart with Proper Empty State
// ─────────────────────────────────────────────────────────────
interface SecurityWeeklyChartCardProps {
  weekChartData: WeekDayCount[]
  todayDateStr: string
}

export function SecurityWeeklyChartCard({ weekChartData, todayDateStr }: SecurityWeeklyChartCardProps) {
  const totalCount = weekChartData.reduce((sum, d) => sum + d.count, 0)
  const maxCount = Math.max(...weekChartData.map(d => d.count), 1)

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Minggu Ini</h3>
          <p className="text-[11px] text-neutral-400">Kehadiran shift per hari</p>
        </div>
        <BarChart2 size={15} className="text-neutral-400" />
      </div>

      <div className="px-5 py-4">
        {totalCount === 0 ? (
          <div className="py-6 text-center space-y-1.5">
            <BarChart2 size={24} className="text-neutral-300 mx-auto mb-1" />
            <p className="text-xs font-semibold text-neutral-600">Belum Ada Aktivitas Minggu Ini</p>
            <p className="text-[11px] text-neutral-400 max-w-xs mx-auto">
              Grafik kehadiran mingguan akan otomatis terisi setelah Anda mencatat presensi dinas.
            </p>
          </div>
        ) : (
            <div className="flex items-end justify-between gap-2 h-24 pt-4">
              {weekChartData.map(w => {
                const isToday = w.dateStr === todayDateStr
                const hasAttendance = w.count > 0
                const heightPercent = hasAttendance
                  ? Math.max((w.count / maxCount) * 85, 22)
                  : 0

                return (
                  <div key={w.day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    {hasAttendance ? (
                      <span className="text-[10px] font-bold text-neutral-800 font-mono">
                        {w.count}
                      </span>
                    ) : (
                      <span className="text-[10px] text-transparent select-none">-</span>
                    )}

                    {hasAttendance ? (
                      <div
                        className="w-full max-w-[20px] rounded-t bg-neutral-900 transition-all duration-500 shadow-xs"
                        style={{ height: `${heightPercent}%` }}
                      />
                    ) : isToday ? (
                      <div
                        className="w-full max-w-[20px] h-1.5 rounded-full bg-neutral-300 ring-2 ring-neutral-400/40"
                        title={`${w.label} (Hari ini): Belum ada presensi`}
                      />
                    ) : (
                      <div
                        className="w-full max-w-[20px] h-1 rounded-full bg-neutral-100"
                        title={`${w.label}: Tidak ada presensi`}
                      />
                    )}

                    {isToday ? (
                      <span
                        className="text-[9px] font-bold text-neutral-900 bg-neutral-100 border border-neutral-300 rounded-md px-1.5 py-0.5 leading-none"
                        title="Hari ini"
                      >
                        {w.day}
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-neutral-400">
                        {w.day}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
        )}
      </div>
    </div>
  )
}
