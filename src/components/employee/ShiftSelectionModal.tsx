import { useState, useEffect, useRef } from 'react'
import {
  Shield, Clock, Check, AlertCircle, Sunrise,
  Sun, Moon, ArrowRight, X, AlertTriangle, CheckCircle2
} from 'lucide-react'
import {
  isWeekend,
  getSecurityAvailableOptions,
  getSecurityShiftCheckInStatus,
  getAutoSelectSecurityShift,
  formatJakartaTime,
  formatJakartaDate,
  nowJakarta,
} from '../../lib/scheduleEngine'
import type { SecurityShiftOption } from '../../types/attendance'
import { parseISO } from 'date-fns'

interface ShiftSelectionModalProps {
  isOpen: boolean
  workDateStr: string
  currentShift?: SecurityShiftOption | null
  onClose: () => void
  onConfirm: (selected: SecurityShiftOption) => void
}

export default function ShiftSelectionModal({
  isOpen,
  workDateStr,
  currentShift: _currentShift,
  onClose,
  onConfirm,
}: ShiftSelectionModalProps) {
  const [selected, setSelected] = useState<SecurityShiftOption | null>(null)
  const [now, setNow] = useState<Date>(() => nowJakarta())
  const hasUserInteracted = useRef(false)

  // Determine if it is a weekend or weekday in Jakarta
  const parsedDate = parseISO(workDateStr)
  const isWeekendDay = isWeekend(parsedDate)
  const availableOptions = getSecurityAvailableOptions(workDateStr)

  // Auto-selection and state reset on modal open
  useEffect(() => {
    if (!isOpen) {
      setSelected(null)
      hasUserInteracted.current = false
      return
    }

    // Reset user interaction tracking on open
    hasUserInteracted.current = false
    const initialNow = nowJakarta()
    setNow(initialNow)

    // Evaluate active check-in window
    const autoShift = getAutoSelectSecurityShift(workDateStr, initialNow)
    if (autoShift && availableOptions.includes(autoShift)) {
      setSelected(autoShift)
    } else {
      setSelected(null)
    }
  }, [isOpen, workDateStr])

  // Periodic live time tick while modal is open (clean up on close)
  useEffect(() => {
    if (!isOpen) return

    const timer = setInterval(() => {
      setNow(nowJakarta())
    }, 1000)

    return () => clearInterval(timer)
  }, [isOpen])

  if (!isOpen) return null

  const getOptionIcon = (opt: SecurityShiftOption) => {
    switch (opt) {
      case 'Shift I':
      case 'Sesi Pagi':
        return Sunrise
      case 'Shift II':
        return Sun
      case 'Shift III':
      case 'Sesi Malam':
        return Moon
      default:
        return Clock
    }
  }

  const selectedStatus = selected ? getSecurityShiftCheckInStatus(selected, workDateStr, now) : null

  const handleSelectOption = (option: SecurityShiftOption) => {
    hasUserInteracted.current = true
    setSelected(option)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shift-picker-title"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-neutral-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-100 flex items-start justify-between bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Shield size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 id="shift-picker-title" className="text-base font-bold text-neutral-900">
                {isWeekendDay ? 'Pilih Sesi Presensi Akhir Pekan' : 'Pilih Shift Presensi Masuk'}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {isWeekendDay
                  ? 'Sabtu & Minggu menggunakan format Sesi Pagi dan Sesi Malam'
                  : 'Pilih shift kerja resmi Security untuk hari ini'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-neutral-200/60 text-neutral-400 hover:text-neutral-700 flex items-center justify-center transition-colors -mr-1 -mt-1 cursor-pointer"
            aria-label="Tutup modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Date and Live Time indicator */}
        <div className="px-6 py-2.5 bg-neutral-100/60 border-b border-neutral-200/60 flex items-center justify-between text-xs text-neutral-600">
          <div className="flex items-center gap-1.5 font-medium">
            <Clock size={13} className="text-neutral-500" />
            <span>Tanggal: <strong className="text-neutral-900">{formatJakartaDate(parsedDate)}</strong></span>
          </div>
          <div className="font-mono text-neutral-700 bg-white px-2 py-0.5 rounded-md border border-neutral-200 text-[11px] font-semibold">
            {formatJakartaTime(now)} WIB
          </div>
        </div>

        {/* Options List */}
        <div className="p-6 space-y-3 overflow-y-auto flex-1">
          <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Pilihan yang Tersedia ({availableOptions.length})</span>
            <span className="text-[10px] text-neutral-400 font-normal">Semua shift dapat dipilih</span>
          </div>

          {availableOptions.map(option => {
            const status = getSecurityShiftCheckInStatus(option, workDateStr, now)
            const isSelected = selected === option
            const Icon = getOptionIcon(option)

            return (
              <div
                key={option}
                onClick={() => handleSelectOption(option)}
                className={`relative rounded-2xl p-4 border-2 cursor-pointer transition-all ${
                  isSelected
                    ? status.windowStatus === 'jendela_selesai'
                      ? 'border-amber-500 bg-amber-50/30 shadow-sm ring-1 ring-amber-400'
                      : status.windowStatus === 'belum_dibuka'
                        ? 'border-neutral-400 bg-neutral-50 shadow-sm'
                        : 'border-neutral-900 bg-neutral-900/[0.03] shadow-sm'
                    : 'border-neutral-200/80 bg-white hover:border-neutral-300 hover:bg-neutral-50/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? status.windowStatus === 'jendela_selesai'
                            ? 'bg-amber-600 text-white'
                            : 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      <Icon size={18} />
                    </div>

                    {/* Title & Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-neutral-900">{status.label}</span>

                        {status.windowStatus === 'tepat_waktu' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Tepat Waktu
                          </span>
                        )}

                        {status.windowStatus === 'jendela_selesai' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            <AlertTriangle size={11} className="text-amber-600" />
                            Jendela Selesai
                          </span>
                        )}

                        {status.windowStatus === 'belum_dibuka' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                            <Clock size={11} className="text-neutral-500" />
                            Belum Dibuka
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-0.5">{status.sublabel}</p>

                      {/* Time Window Badge */}
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-800 border border-neutral-200">
                          <Clock size={12} className="text-neutral-500" />
                          <span>Jendela Masuk: <strong>{status.timeRangeDisplay}</strong></span>
                        </div>
                        <span className="text-[11px] text-neutral-400">
                          Durasi Tugas: {status.workHoursDisplay}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Radio indicator */}
                  <div className="pt-1 flex-shrink-0">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? status.windowStatus === 'jendela_selesai'
                            ? 'border-amber-600 bg-amber-600 text-white'
                            : 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Detailed Feedback & Warning Card */}
          {selectedStatus ? (
            selectedStatus.windowStatus === 'jendela_selesai' ? (
              <div className="mt-4 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
                  <span>Peringatan Keterlambatan: Jendela Masuk {selectedStatus.label} Telah Selesai</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/80">
                    <span className="text-[10px] text-amber-700 font-medium block">Jendela Masuk Resmi</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono mt-0.5 block">
                      {selectedStatus.timeRangeDisplay}
                    </span>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/80">
                    <span className="text-[10px] text-amber-700 font-medium block">Status Jendela Masuk</span>
                    <span className="text-xs font-bold mt-1 inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      Jendela Selesai
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-amber-900/90 leading-relaxed pt-1">
                  Jendela presensi masuk untuk <strong>{selectedStatus.label}</strong> adalah pukul {selectedStatus.timeRangeDisplay}. Waktu saat ini ({formatJakartaTime(now)} WIB) telah melewati batas jendela masuk, sehingga presensi yang Anda ajukan <strong>berpotensi dicatat terlambat</strong>.
                </p>
                <p className="text-[10px] text-amber-700 italic">
                  * Status presensi dan durasi keterlambatan akan diverifikasi dan ditentukan oleh server SIPATEN.
                </p>
              </div>
            ) : selectedStatus.windowStatus === 'tepat_waktu' ? (
              <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                  <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                  <span>Jendela Masuk {selectedStatus.label} Sedang Aktif</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-200/80">
                    <span className="text-[10px] text-emerald-700 font-medium block">Batas Check-In Tepat Waktu</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono mt-0.5 block">
                      {selectedStatus.timeRangeDisplay}
                    </span>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-200/80">
                    <span className="text-[10px] text-emerald-700 font-medium block">Status Jendela Masuk</span>
                    <span className="text-xs font-bold mt-1 inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Tepat Waktu
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed pt-1">
                  Waktu saat ini berada di dalam jendela presensi masuk resmi. Foto selfie presensi Anda akan diproses sebagai <strong>Tepat Waktu</strong>.
                </p>
              </div>
            ) : (
              <div className="mt-4 p-4 rounded-2xl bg-neutral-100/80 border border-neutral-200 text-neutral-800 space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
                  <Clock size={16} className="text-neutral-600 flex-shrink-0" />
                  <span>Presensi {selectedStatus.label} Belum Dibuka</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-white p-2.5 rounded-xl border border-neutral-200/80">
                    <span className="text-[10px] text-neutral-500 font-medium block">Jadwal Jendela Masuk</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono mt-0.5 block">
                      {selectedStatus.timeRangeDisplay}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-neutral-200/80">
                    <span className="text-[10px] text-neutral-500 font-medium block">Status Jendela Masuk</span>
                    <span className="text-xs font-bold mt-1 inline-block px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
                      Belum Dibuka
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed pt-1">
                  Jendela presensi masuk untuk <strong>{selectedStatus.label}</strong> baru akan dibuka pada pukul <strong>{selectedStatus.scheduledStart.replace(':', '.')} WIB</strong>. Anda tidak dapat melakukan presensi lebih awal untuk shift ini.
                </p>
              </div>
            )
          ) : (
            <div className="mt-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-200 text-neutral-700 text-xs space-y-1.5 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 font-bold text-neutral-900">
                <AlertCircle size={15} className="text-amber-600 flex-shrink-0" />
                <span>Pilih Shift Tugas Anda</span>
              </div>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Saat ini tidak ada shift yang sedang berada dalam jendela masuk tepat waktu. Anda tetap dapat memilih shift yang sesuai dengan jadwal tugas Anda hari ini untuk melanjutkan presensi.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50 rounded-xl transition-colors cursor-pointer"
          >
            Batal
          </button>

          {!selected ? (
            <button
              type="button"
              disabled
              className="px-6 py-3 text-neutral-400 bg-neutral-200 text-xs font-bold rounded-xl flex items-center gap-2 cursor-not-allowed opacity-60"
            >
              <span>Pilih Shift Terlebih Dahulu</span>
              <ArrowRight size={15} />
            </button>
          ) : selectedStatus?.windowStatus === 'belum_dibuka' ? (
            <button
              type="button"
              disabled
              className="px-6 py-3 text-neutral-400 bg-neutral-200 text-xs font-bold rounded-xl flex items-center gap-2 cursor-not-allowed opacity-75"
              title="Presensi belum dibuka untuk shift ini"
            >
              <Clock size={15} />
              <span>Presensi Belum Dibuka (Mulai {selectedStatus.scheduledStart.replace(':', '.')} WIB)</span>
            </button>
          ) : selectedStatus?.windowStatus === 'jendela_selesai' ? (
            <button
              type="button"
              onClick={() => onConfirm(selected)}
              className="px-6 py-3 text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              <span>Lanjutkan Presensi (Tercatat Terlambat)</span>
              <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConfirm(selected)}
              className="px-6 py-3 text-white bg-neutral-900 hover:bg-black active:bg-neutral-800 text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              <span>Lanjutkan ke Foto Presensi</span>
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
