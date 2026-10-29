// ============================================================
// SIPATEN — useProfileAvatar Hook
// Mengelola upload, get signed URL, dan delete foto profil
// Foto profil tersimpan di bucket 'avatars' (BUKAN 'selfies')
// Path: avatars/{auth_uid}/{filename}
// ============================================================

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AVATAR_BUCKET = 'avatars'
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 jam

export interface AvatarUploadResult {
  success: boolean
  avatarUrl?: string
  storagePath?: string
  error?: string
}

export function useProfileAvatar() {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  /**
   * Validasi file sebelum upload
   */
  function validateFile(file: File): string | null {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return `Format file tidak didukung. Gunakan JPEG, PNG, atau WebP.`
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `Ukuran file terlalu besar. Maksimal 2 MB.`
    }
    return null
  }

  /**
   * Upload foto profil ke bucket 'avatars'
   * Path: avatars/{authUid}/profile.{ext}
   * Mengembalikan storagePath yang disimpan ke employee_profiles.avatar_url
   */
  const uploadAvatar = useCallback(async (
    file: File,
    authUid: string,
    profileId: string,
  ): Promise<AvatarUploadResult> => {
    setIsUploading(true)
    setUploadError(null)

    try {
      // 1. Validasi file
      const validationError = validateFile(file)
      if (validationError) {
        setUploadError(validationError)
        return { success: false, error: validationError }
      }

      // 2. Tentukan path file (satu foto per user, di-overwrite saat ganti foto)
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const storagePath = `${authUid}/profile.${ext}`

      // 3. Upload ke Supabase Storage bucket 'avatars'
      const { error: uploadErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(storagePath, file, {
          upsert: true,            // overwrite jika sudah ada
          contentType: file.type,
          cacheControl: '3600',
        })

      if (uploadErr) {
        const msg = `Gagal mengupload foto: ${uploadErr.message}`
        setUploadError(msg)
        return { success: false, error: msg }
      }

      // 4. Simpan storagePath ke employee_profiles.avatar_url
      const { error: updateErr } = await supabase
        .from('employee_profiles')
        .update({ avatar_url: storagePath, updated_at: new Date().toISOString() })
        .eq('id', profileId)

      if (updateErr) {
        // Rollback: hapus file yang sudah terupload jika update profile gagal
        await supabase.storage.from(AVATAR_BUCKET).remove([storagePath])
        const msg = `Foto terupload tetapi gagal disimpan ke profil: ${updateErr.message}`
        setUploadError(msg)
        return { success: false, error: msg }
      }

      // 5. Dapatkan Signed URL untuk ditampilkan segera
      const { data: signedData, error: signedErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS)

      if (signedErr || !signedData?.signedUrl) {
        // Upload + save berhasil, tapi signed URL gagal dibuat — masih sukses
        return { success: true, storagePath }
      }

      return { success: true, avatarUrl: signedData.signedUrl, storagePath }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengupload foto profil.'
      setUploadError(msg)
      return { success: false, error: msg }
    } finally {
      setIsUploading(false)
    }
  }, [])

  /**
   * Dapatkan Signed URL dari storagePath yang tersimpan di avatar_url
   */
  const getAvatarSignedUrl = useCallback(async (
    storagePath: string | null | undefined,
  ): Promise<string | null> => {
    if (!storagePath) return null

    try {
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS)

      if (error || !data?.signedUrl) return null
      return data.signedUrl
    } catch {
      return null
    }
  }, [])

  /**
   * Hapus foto profil (opsional — saat reset ke avatar default)
   */
  const deleteAvatar = useCallback(async (
    storagePath: string,
    profileId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Hapus dari Storage
      const { error: storageErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([storagePath])

      if (storageErr) {
        return { success: false, error: `Gagal menghapus foto: ${storageErr.message}` }
      }

      // Hapus referensi dari employee_profiles
      const { error: updateErr } = await supabase
        .from('employee_profiles')
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq('id', profileId)

      if (updateErr) {
        return { success: false, error: `Foto dihapus tetapi referensi profil gagal dibersihkan: ${updateErr.message}` }
      }

      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus foto profil.'
      return { success: false, error: msg }
    }
  }, [])

  return {
    isUploading,
    uploadError,
    setUploadError,
    uploadAvatar,
    getAvatarSignedUrl,
    deleteAvatar,
    validateFile,
  }
}
