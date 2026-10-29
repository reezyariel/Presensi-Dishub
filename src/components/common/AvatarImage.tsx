// ============================================================
// SIPATEN — AvatarImage Component
// Menampilkan foto profil dengan signed URL.
// Fallback ke inisial jika foto tidak tersedia atau gagal dimuat.
// Dipakai di: ProfilePage, EmployeeSidebar, EmployeeTopbar, EmployeesPage
// ============================================================

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'

const AVATAR_BUCKET = 'avatars'
const SIGNED_URL_EXPIRY_SECONDS = 3600

interface AvatarImageProps {
  /** Path di Supabase Storage: "{authUid}/profile.jpg" atau null jika belum ada foto */
  storagePath?: string | null
  /** Nama untuk menghasilkan inisial fallback */
  name: string
  /** Ukuran komponen (w & h) — Tailwind class, misal: 'w-16 h-16' */
  sizeClass?: string
  /** Class tambahan untuk container */
  className?: string
  /** Border radius — default 'rounded-full' */
  roundedClass?: string
  /** Font size inisial — misal 'text-sm' */
  initialsTextClass?: string
}

export default function AvatarImage({
  storagePath,
  name,
  sizeClass = 'w-10 h-10',
  className = '',
  roundedClass = 'rounded-full',
  initialsTextClass = 'text-sm',
}: AvatarImageProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)

  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  useEffect(() => {
    let isMounted = true
    setImgError(false)
    setSignedUrl(null)

    async function fetchSignedUrl() {
      if (!storagePath) return

      try {
        const { data, error } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS)

        if (isMounted && !error && data?.signedUrl) {
          setSignedUrl(data.signedUrl)
        }
      } catch {
        // Tetap tampilkan avatar inisial jika signed URL gagal dibuat
      }
    }

    fetchSignedUrl()
    return () => { isMounted = false }
  }, [storagePath])

  const showPhoto = signedUrl && !imgError

  return (
    <div
      className={cn(
        sizeClass,
        roundedClass,
        'flex items-center justify-center overflow-hidden flex-shrink-0',
        showPhoto ? '' : 'bg-neutral-900 text-white',
        className,
      )}
    >
      {showPhoto ? (
        <img
          src={signedUrl}
          alt={`Foto profil ${name}`}
          className={cn('w-full h-full object-cover', roundedClass)}
          onError={() => setImgError(true)}
        />
      ) : (
        <span className={cn('font-bold leading-none select-none', initialsTextClass)}>
          {initials}
        </span>
      )}
    </div>
  )
}
