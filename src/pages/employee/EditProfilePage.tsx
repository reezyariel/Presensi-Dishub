// ============================================================
// SIPATEN — Halaman Kelola Profil (Security & CS)
// Subhalaman terpisah dari Profil Utama.
// Fitur:
//   - Foto profil saat ini (via bucket 'avatars')
//   - Ganti foto: pilih file, validasi MIME & ukuran (maks 2MB)
//   - Preview foto sebelum disimpan
//   - Tombol Simpan & Batal
//   - Tombol Hapus Foto (kembali ke inisial default)
//   - Informasi akun read-only (Nama, ID, Divisi, Email)
//   - Navigasi kembali ke Halaman Profil Utama
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Camera, Upload, Trash2, X, CheckCircle2,
  AlertCircle, Loader2, Shield, Headphones, Mail,
  BadgeCheck, Info, User,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useProfileAvatar } from '../../hooks/useProfileAvatar'
import AvatarImage from '../../components/common/AvatarImage'

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

// ─── Read-Only Field Component ────────────────────────────────
interface ReadOnlyFieldProps {
  label: string
  value: string | undefined | null
  mono?: boolean
  icon?: React.ReactNode
}
function ReadOnlyField({ label, value, mono, icon }: ReadOnlyFieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-neutral-50 rounded-xl border border-neutral-200 text-neutral-800 text-xs">
        {icon && <span className="text-neutral-400 flex-shrink-0">{icon}</span>}
        <span className={`truncate font-medium ${mono ? 'font-mono' : ''}`}>
          {value || '—'}
        </span>
      </div>
    </div>
  )
}

export default function EditProfilePage() {
  const navigate = useNavigate()
  const { user, profile, employeeProfile, role, refreshProfile } = useAuth()
  const { isUploading, uploadError, setUploadError, uploadAvatar, getAvatarSignedUrl, deleteAvatar } = useProfileAvatar()

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isSavingPhoto, setIsSavingPhoto] = useState(false)
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false)
  const [currentAvatarSignedUrl, setCurrentAvatarSignedUrl] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const basePath = role === 'Security' ? '/security' : '/cs'
  const displayName = employeeProfile?.full_name || profile?.full_name || 'Karyawan'
  const roleLabel = role === 'Security' ? 'Security / Keamanan' : 'Cleaning Service'
  const RoleIcon = role === 'Security' ? Shield : Headphones
  const avatarStoragePath = employeeProfile?.avatar_url || null

  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
  const MAX_SIZE = 2 * 1024 * 1024

  // Ambil signed URL foto saat ini
  useEffect(() => {
    let isMounted = true
    async function fetchUrl() {
      if (!avatarStoragePath) {
        setCurrentAvatarSignedUrl(null)
        return
      }
      const url = await getAvatarSignedUrl(avatarStoragePath)
      if (isMounted) setCurrentAvatarSignedUrl(url)
    }
    fetchUrl()
    return () => { isMounted = false }
  }, [avatarStoragePath, getAvatarSignedUrl])

  // Handler pilih file
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setPreviewError(null)
    setUploadError(null)

    if (!ALLOWED_MIME.includes(file.type)) {
      setPreviewError('Format tidak didukung. Gunakan JPEG, PNG, atau WebP.')
      return
    }
    if (file.size > MAX_SIZE) {
      setPreviewError('Ukuran file terlalu besar. Maksimal 2 MB.')
      return
    }

    const objUrl = URL.createObjectURL(file)
    setPreviewUrl(objUrl)
    setPreviewFile(file)
    e.target.value = ''
  }

  function handleCancelPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPreviewFile(null)
    setPreviewError(null)
  }

  // Handler simpan foto
  const handleSavePhoto = useCallback(async () => {
    if (!previewFile || !user?.id || !employeeProfile?.id) return

    setIsSavingPhoto(true)
    const result = await uploadAvatar(previewFile, user.id, employeeProfile.id)
    setIsSavingPhoto(false)

    if (result.success) {
      await refreshProfile()
      if (result.avatarUrl) setCurrentAvatarSignedUrl(result.avatarUrl)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setPreviewFile(null)
      setToast({ type: 'success', message: 'Foto profil berhasil diperbarui.' })
    } else {
      setToast({ type: 'error', message: result.error || 'Gagal menyimpan foto profil.' })
    }
  }, [previewFile, user?.id, employeeProfile?.id, uploadAvatar, refreshProfile, previewUrl])

  // Handler hapus foto
  const handleDeletePhoto = useCallback(async () => {
    if (!avatarStoragePath || !employeeProfile?.id) return
    if (!window.confirm('Hapus foto profil dan gunakan inisial default?')) return

    setIsDeletingPhoto(true)
    const result = await deleteAvatar(avatarStoragePath, employeeProfile.id)
    setIsDeletingPhoto(false)

    if (result.success) {
      await refreshProfile()
      setCurrentAvatarSignedUrl(null)
      setToast({ type: 'success', message: 'Foto profil berhasil dihapus.' })
    } else {
      setToast({ type: 'error', message: result.error || 'Gagal menghapus foto profil.' })
    }
  }, [avatarStoragePath, employeeProfile?.id, deleteAvatar, refreshProfile])

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
          <h2 className="text-lg font-bold text-neutral-900">Kelola Profil</h2>
          <p className="text-xs text-neutral-500">Perbarui foto dan lihat rincian akun Anda</p>
        </div>
      </div>

      {/* ─── Card 1: Foto Profil ─── */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Foto Profil</h3>
            <p className="text-[11px] text-neutral-400">Foto untuk identitas akun Anda di SIPATEN</p>
          </div>
          <BadgeCheck size={18} className="text-neutral-400" />
        </div>

        {/* Input file tersembunyi */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
          id="profile-avatar-input"
        />

        {/* Tampilan Avatar / Preview */}
        <div className="flex flex-col sm:flex-row items-center gap-5 pt-1">
          {/* Avatar frame */}
          <div className="relative flex-shrink-0">
            <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-neutral-200 bg-neutral-100 shadow-inner flex items-center justify-center">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview Foto Baru"
                  className="w-full h-full object-cover"
                />
              ) : currentAvatarSignedUrl ? (
                <img
                  src={currentAvatarSignedUrl}
                  alt={`Foto ${displayName}`}
                  className="w-full h-full object-cover"
                  onError={() => setCurrentAvatarSignedUrl(null)}
                />
              ) : (
                <AvatarImage
                  storagePath={avatarStoragePath}
                  name={displayName}
                  sizeClass="w-full h-full"
                  roundedClass="rounded-2xl"
                  initialsTextClass="text-2xl"
                />
              )}
            </div>
            {previewUrl && (
              <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 bg-neutral-900 text-[9px] font-bold text-white rounded-md shadow">
                Preview
              </span>
            )}
          </div>

          {/* Controls & Petunjuk */}
          <div className="space-y-2.5 text-center sm:text-left flex-1 min-w-0">
            {previewUrl ? (
              /* State saat sedang preview file baru */
              <div className="space-y-2">
                <p className="text-xs font-semibold text-neutral-800">
                  Foto baru siap disimpan
                </p>
                <p className="text-[11px] text-neutral-500">
                  Pastikan wajah terlihat jelas dan tegak menghadap kamera.
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSavePhoto}
                    disabled={isSavingPhoto || isUploading}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-60 shadow-sm"
                  >
                    {isSavingPhoto || isUploading ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Upload size={13} />
                    )}
                    {isSavingPhoto || isUploading ? 'Menyimpan...' : 'Simpan Foto'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelPreview}
                    disabled={isSavingPhoto || isUploading}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-60"
                  >
                    <X size={13} />
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              /* State default: Tombol Pilih & Hapus Foto */
              <div className="space-y-2">
                <p className="text-xs text-neutral-600">
                  {avatarStoragePath
                    ? 'Foto profil aktif. Anda dapat mengganti atau menghapusnya kapan saja.'
                    : 'Belum ada foto profil. Unggah foto resmi Anda.'}
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
                  >
                    <Camera size={13} />
                    {avatarStoragePath ? 'Ganti Foto' : 'Pilih Foto'}
                  </button>
                  {avatarStoragePath && (
                    <button
                      type="button"
                      onClick={handleDeletePhoto}
                      disabled={isDeletingPhoto}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl transition-colors border border-red-200 disabled:opacity-60"
                    >
                      {isDeletingPhoto ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Hapus Foto
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-neutral-400">
                  Format: JPEG, PNG, WebP · Maksimal: 2 MB
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Error message */}
        {(previewError || uploadError) && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl border border-red-200 text-red-700 text-xs">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>{previewError || uploadError}</span>
          </div>
        )}
      </div>

      {/* ─── Card 2: Informasi Akun (Read-only) ─── */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-5 space-y-4">
        <div className="border-b border-neutral-100 pb-3">
          <h3 className="text-sm font-bold text-neutral-900">Informasi Akun Pegawai</h3>
          <p className="text-[11px] text-neutral-400">Data verifikasi resmi dari sistem HRD SIPATEN</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <ReadOnlyField
            label="Nama Lengkap"
            value={displayName}
            icon={<User size={13} />}
          />
          <ReadOnlyField
            label="ID Pegawai / NIK"
            value={employeeProfile?.employee_code || employeeProfile?.id?.slice(0, 8).toUpperCase()}
            mono
            icon={<BadgeCheck size={13} />}
          />
          <ReadOnlyField
            label="Divisi / Penugasan"
            value={roleLabel}
            icon={<RoleIcon size={13} />}
          />
          <ReadOnlyField
            label="Email Login"
            value={user?.email}
            mono
            icon={<Mail size={13} />}
          />
          {role === 'Security' && (
            <div className="sm:col-span-2">
              <ReadOnlyField
                label="Shift Default"
                value={employeeProfile?.default_shift || 'Shift Standar (I)'}
              />
            </div>
          )}
        </div>

        <div className="flex items-start gap-2.5 p-3 bg-neutral-50 rounded-xl border border-neutral-100 text-neutral-500 text-xs">
          <Info size={15} className="flex-shrink-0 text-neutral-400 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            Data nama, ID pegawai, dan divisi telah diverifikasi oleh manajemen. Jika ada ketidaksesuaian data, silakan hubungi tim IT atau HRD untuk pembaharuan data resmi.
          </p>
        </div>
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
