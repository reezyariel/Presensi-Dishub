// ============================================================
// SIPATEN — Halaman Kata Sandi & Keamanan (Security & CS)
// Subhalaman terpisah dari Profil Utama.
// Fitur:
//   - Input Kata Sandi Saat Ini (dengan tombol tampil/sembunyikan)
//   - Input Kata Sandi Baru (dengan validasi min 6 karakter)
//   - Input Konfirmasi Kata Sandi Baru (dengan indikator kecocokan)
//   - Re-autentikasi kata sandi lama via Supabase Auth
//   - Update kata sandi aman via supabase.auth.updateUser
//   - Notifikasi sukses/error
//   - Navigasi kembali ke Halaman Profil Utama
// ============================================================

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Lock, Eye, EyeOff, CheckCircle2,
  AlertCircle, Loader2, ShieldCheck, X,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

// ─── Toast Notification Component ─────────────────────────────
interface ToastProps {
  type: 'success' | 'error'
  message: string
  onClose: () => void
}
function Toast({ type, message, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      className={`fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold max-w-sm w-[90%] sm:w-full transition-all ${
        type === 'success' ? 'bg-neutral-900 text-white' : 'bg-red-600 text-white'
      }`}
    >
      {type === 'success' ? (
        <CheckCircle2 size={16} className="flex-shrink-0 text-green-400" />
      ) : (
        <AlertCircle size={16} className="flex-shrink-0 text-white" />
      )}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="p-0.5 rounded opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  )
}

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user, role } = useAuth()

  const [pwCurrentPw, setPwCurrentPw] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')

  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  const [pwError, setPwError] = useState<string | null>(null)
  const [isChangingPw, setIsChangingPw] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const basePath = role === 'Security' ? '/security' : '/cs'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPwError(null)

    if (!pwCurrentPw.trim()) {
      setPwError('Masukkan kata sandi saat ini.')
      return
    }
    if (pwNew.length < 6) {
      setPwError('Kata sandi baru minimal harus 6 karakter.')
      return
    }
    if (pwNew !== pwConfirm) {
      setPwError('Konfirmasi kata sandi baru tidak cocok.')
      return
    }
    if (pwNew === pwCurrentPw) {
      setPwError('Kata sandi baru tidak boleh sama dengan kata sandi saat ini.')
      return
    }

    setIsChangingPw(true)
    try {
      const email = user?.email
      if (!email) throw new Error('Sesi tidak valid. Silakan login ulang.')

      // 1. Verifikasi kata sandi saat ini (re-auth)
      const { error: reAuthErr } = await supabase.auth.signInWithPassword({
        email,
        password: pwCurrentPw,
      })

      if (reAuthErr) {
        setPwError('Kata sandi saat ini tidak benar. Silakan periksa kembali.')
        return
      }

      // 2. Update kata sandi baru menggunakan supabase.auth.updateUser
      const { error: updateErr } = await supabase.auth.updateUser({
        password: pwNew,
      })

      if (updateErr) {
        setPwError(`Gagal memperbarui kata sandi: ${updateErr.message}`)
        return
      }

      // 3. Berhasil
      setPwCurrentPw('')
      setPwNew('')
      setPwConfirm('')
      setToast({ type: 'success', message: 'Kata sandi berhasil diperbarui.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat mengubah kata sandi.'
      setPwError(msg)
    } finally {
      setIsChangingPw(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* ─── Header dengan Tombol Kembali ─── */}
      <div className="flex items-center gap-3">
        <Link
          to={`${basePath}/profile`}
          className="p-2 rounded-xl text-neutral-600 hover:text-neutral-900 hover:bg-white border border-neutral-200 transition-colors shadow-sm"
          title="Kembali ke Profil"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Kata Sandi & Keamanan</h2>
          <p className="text-xs text-neutral-500">Perbarui kata sandi login untuk keamanan akun Anda</p>
        </div>
      </div>

      {/* ─── Card Formulir Keamanan ─── */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-5 space-y-5">
        {/* Banner informasi */}
        <div className="flex items-start gap-3 p-3.5 bg-neutral-50 rounded-xl border border-neutral-100 text-neutral-600 text-xs">
          <ShieldCheck size={18} className="text-neutral-700 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-neutral-800">Tips Keamanan Akun</p>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Gunakan minimal 6 karakter. Jangan gunakan kombinasi angka yang mudah ditebak atau membagikan kata sandi kepada orang lain.
            </p>
          </div>
        </div>

        {/* Formulir */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Kata Sandi Saat Ini */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700">
              Kata Sandi Saat Ini <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrentPw ? 'text' : 'password'}
                value={pwCurrentPw}
                onChange={e => {
                  setPwCurrentPw(e.target.value)
                  if (pwError) setPwError(null)
                }}
                placeholder="Masukkan kata sandi saat ini"
                className="w-full px-3.5 py-2.5 pr-10 text-xs bg-white rounded-xl border border-neutral-200 focus:border-neutral-900 focus:outline-none transition-colors"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                tabIndex={-1}
              >
                {showCurrentPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-3 space-y-4">
            {/* Kata Sandi Baru */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700">
                Kata Sandi Baru <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={pwNew}
                  onChange={e => {
                    setPwNew(e.target.value)
                    if (pwError) setPwError(null)
                  }}
                  placeholder="Minimal 6 karakter"
                  className="w-full px-3.5 py-2.5 pr-10 text-xs bg-white rounded-xl border border-neutral-200 focus:border-neutral-900 focus:outline-none transition-colors"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                  tabIndex={-1}
                >
                  {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {pwNew.length > 0 && pwNew.length < 6 && (
                <p className="text-[10px] text-amber-600">
                  Kata sandi harus memiliki minimal 6 karakter.
                </p>
              )}
            </div>

            {/* Konfirmasi Kata Sandi Baru */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700">
                Konfirmasi Kata Sandi Baru <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={pwConfirm}
                  onChange={e => {
                    setPwConfirm(e.target.value)
                    if (pwError) setPwError(null)
                  }}
                  placeholder="Ulangi kata sandi baru"
                  className="w-full px-3.5 py-2.5 pr-10 text-xs bg-white rounded-xl border border-neutral-200 focus:border-neutral-900 focus:outline-none transition-colors"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                  tabIndex={-1}
                >
                  {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {pwConfirm.length > 0 && pwNew !== pwConfirm && (
                <p className="text-[10px] text-red-500">Kata sandi tidak cocok.</p>
              )}
              {pwConfirm.length > 0 && pwNew === pwConfirm && pwNew.length >= 6 && (
                <p className="text-[10px] text-green-600 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Kata sandi cocok.
                </p>
              )}
            </div>
          </div>

          {/* Pesan Error */}
          {pwError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl border border-red-200 text-red-700 text-xs">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>{pwError}</span>
            </div>
          )}

          {/* Tombol Simpan & Batal */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-3">
            <button
              type="submit"
              disabled={isChangingPw || pwNew.length < 6 || pwNew !== pwConfirm}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isChangingPw ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Lock size={13} />
              )}
              {isChangingPw ? 'Memperbarui...' : 'Simpan Perubahan'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`${basePath}/profile`)}
              disabled={isChangingPw}
              className="px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              Batal
            </button>
          </div>
        </form>
      </div>

      {/* ─── Tombol Kembali Cepat ─── */}
      <div className="pt-1 text-center">
        <button
          type="button"
          onClick={() => navigate(`${basePath}/profile`)}
          className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          ← Kembali ke Halaman Profil
        </button>
      </div>

      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
