import { Clock, AlertTriangle, LogOut, CheckCircle2, ShieldAlert } from 'lucide-react'

interface IdleWarningModalProps {
  isOpen: boolean
  remainingSeconds: number
  roleLabel: string
  isAttendancePage: boolean
  onStayLoggedIn: () => void
  onLogoutNow: () => void
}

export default function IdleWarningModal({
  isOpen,
  remainingSeconds,
  roleLabel,
  isAttendancePage,
  onStayLoggedIn,
  onLogoutNow,
}: IdleWarningModalProps) {
  if (!isOpen) return null

  // Normalisasi progress 0 - 100% dari 60 detik
  const progressPercent = Math.max(0, Math.min(100, (remainingSeconds / 60) * 100))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden text-neutral-900 animate-scale-up">
        {/* Progress Bar Hitung Mundur */}
        <div className="w-full h-1.5 bg-neutral-100 overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              remainingSeconds <= 15 ? 'bg-red-500' : remainingSeconds <= 30 ? 'bg-amber-500' : 'bg-neutral-900'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="p-6 sm:p-7 space-y-5">
          {/* Header & Icon */}
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                remainingSeconds <= 15
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-amber-50 text-amber-600 border border-amber-200'
              }`}
            >
              <Clock size={24} className="animate-pulse" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                  {roleLabel}
                </span>
                <span className="text-[10px] text-neutral-400 font-medium">Batas Idle Sesi</span>
              </div>
              <h3 id="idle-warning-title" className="text-lg font-bold text-neutral-900 tracking-tight">
                Sesi Anda Akan Berakhir
              </h3>
            </div>
          </div>

          {/* Countdown Display */}
          <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200/80 text-center space-y-1">
            <p className="text-xs text-neutral-500">Otomatis keluar karena tidak ada aktivitas dalam:</p>
            <div className="text-3xl font-black text-neutral-900 tracking-tight font-mono">
              {remainingSeconds}{' '}
              <span className="text-sm font-semibold text-neutral-500 font-sans">detik</span>
            </div>
          </div>

          {/* Konteks Perlindungan Formulir & Absensi */}
          {isAttendancePage ? (
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="font-semibold block mb-0.5">Peringatan Formulir Absensi:</strong>
                Anda sedang berada di halaman presensi. Pastikan menekan <strong>Tetap Masuk</strong> agar
                foto atau data absensi yang sedang diproses tidak hilang.
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-600 text-xs flex items-start gap-2.5">
              <ShieldAlert size={16} className="text-neutral-500 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Demi keamanan sistem SIPATEN, sesi login akan otomatis dinonaktifkan jika tidak ada interaksi pengguna.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={onLogoutNow}
              className="w-full sm:w-1/3 py-2.5 px-3 rounded-xl border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <LogOut size={14} />
              <span>Keluar</span>
            </button>

            <button
              type="button"
              onClick={onStayLoggedIn}
              autoFocus
              className="w-full sm:w-2/3 py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <CheckCircle2 size={15} />
              <span>Tetap Masuk</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
