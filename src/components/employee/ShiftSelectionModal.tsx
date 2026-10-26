import { useState, useEffect } from 'react'
import {
  Shield, Clock, Check, AlertCircle, Sunrise,
  Sun, Moon, ArrowRight, X, Sparkles
} from 'lucide-react'
import {
  isWeekend,
  getSecurityAvailableOptions,
  getSecurityOptionInfo,
  formatJakartaTime,
  formatJakartaDate,
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
  currentShift,
  onClose,
  onConfirm,
}: ShiftSelectionModalProps) {
  const [selected, setSelected] = useState<SecurityShiftOption | null>(null)
  const [now, setNow] = useState(new Date())

  // Keep live time ticking while modal is open
  useEffect(() => {
    if (!isOpen) return
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [isOpen])

  // Determine if it is a weekend or weekday in Jakarta
  const parsedDate = parseISO(workDateStr)
  const isWeekendDay = isWeekend(parsedDate)
  const availableOptions = getSecurityAvailableOptions(workDateStr)

  // Auto-suggest or pre-select if current window is active
  useEffect(() => {
    if (!isOpen) {
      setSelected(null)
      return
    }

    // Check if any option's window is currently active right now
    const activeOpt = availableOptions.find(opt => {
      const info = getSecurityOptionInfo(opt, workDateStr, new Date())
      return info.isOpenNow
    })

    if (activeOpt) {
      setSelected(activeOpt)
    } else if (currentShift && availableOptions.includes(currentShift)) {
      setSelected(currentShift)
    } else {
      setSelected(null)
    }
  }, [isOpen, workDateStr])

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

  const selectedInfo = selected ? getSecurityOptionInfo(selected, workDateStr, now) : null

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
            className="w-8 h-8 rounded-full hover:bg-neutral-200/60 text-neutral-400 hover:text-neutral-700 flex items-center justify-center transition-colors -mr-1 -mt-1"
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
            <span className="text-[10px] text-neutral-400 font-normal">Wajib pilih 1 untuk melanjutkan</span>
          </div>

          {availableOptions.map(option => {
            const info = getSecurityOptionInfo(option, workDateStr, now)
            const isSelected = selected === option
            const Icon = getOptionIcon(option)

            return (
              <div
                key={option}
                onClick={() => setSelected(option)}
                className={`relative rounded-2xl p-4 border-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-neutral-900 bg-neutral-900/[0.03] shadow-sm'
                    : 'border-neutral-200/80 bg-white hover:border-neutral-300 hover:bg-neutral-50/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      <Icon size={18} />
                    </div>

                    {/* Title & Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-neutral-900">{info.label}</span>
                        {info.isOpenNow && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Jendela Aktif Saat Ini
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-0.5">{info.sublabel}</p>

                      {/* Time Window Badge */}
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-800 border border-neutral-200">
                          <Clock size={12} className="text-neutral-500" />
                          <span>Jendela Masuk: <strong>{info.timeRangeDisplay}</strong></span>
                        </div>
                        <span className="text-[11px] text-neutral-400">
                          Durasi Tugas: {info.workHoursDisplay}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Radio indicator */}
                  <div className="pt-1 flex-shrink-0">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-neutral-900 bg-neutral-900 text-white'
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

          {/* Selected Option Detail Box */}
          {selectedInfo && (
            <div className="mt-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
                <Sparkles size={14} className="text-amber-500" />
                <span>Waktu Presensi yang Berlaku untuk {selectedInfo.label}:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="bg-white p-2.5 rounded-xl border border-neutral-200/60">
                  <span className="text-[10px] text-neutral-400 font-medium block">Batas Check-In Tepat Waktu</span>
                  <span className="text-sm font-bold text-neutral-900 font-mono mt-0.5 block">
                    {selectedInfo.timeRangeDisplay}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-neutral-200/60">
                  <span className="text-[10px] text-neutral-400 font-medium block">Status Jendela Saat Ini</span>
                  <span
                    className={`text-xs font-bold mt-1 inline-block px-2 py-0.5 rounded-full ${
                      selectedInfo.isOpenNow
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedInfo.windowStatus === 'not_yet'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {selectedInfo.isOpenNow
                      ? 'Sedang Dibuka'
                      : selectedInfo.windowStatus === 'not_yet'
                        ? 'Belum Dimulai'
                        : 'Jendela Selesai'}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-neutral-500 leading-relaxed pt-1">
                {selectedInfo.isOpenNow
                  ? 'Waktu saat ini berada di dalam jendela presensi. Foto presensi Anda akan diproses sebagai Tepat Waktu.'
                  : selectedInfo.windowStatus === 'not_yet'
                    ? `Jendela presensi untuk ${selectedInfo.label} dimulai pukul ${selectedInfo.scheduledStart.replace(':', '.')} WIB.`
                    : 'Jendela check-in telah lewat. Presensi yang dikirimkan akan dicatat sebagai terlambat.'}
              </p>
            </div>
          )}

          {!selected && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/70 text-amber-800 text-xs flex items-center gap-2.5">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
              <span>Silakan pilih salah satu opsi di atas sebelum melanjutkan ke foto presensi.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50 rounded-xl transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onConfirm(selected)
              }
            }}
            className="px-6 py-3 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-neutral-900"
          >
            <span>Lanjutkan ke Foto Presensi</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
