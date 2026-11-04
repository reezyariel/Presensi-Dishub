import { useEffect, useState } from 'react'
import { Camera, ImageOff, Loader2 } from 'lucide-react'
import { getSignedSelfieUrl } from '../../lib/selfieStorage'

interface Props {
  storagePath: string | null | undefined
  alt?: string
  title?: string
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  className?: string
}

export default function AttendanceSelfieThumbnail({
  storagePath,
  alt = 'Foto Selfie Presensi',
  title = 'Klik untuk memperbesar foto selfie',
  size = 'md',
  onClick,
  className = '',
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(storagePath))
  const [hasError, setHasError] = useState<boolean>(false)

  useEffect(() => {
    let isMounted = true

    if (!storagePath) {
      setImageUrl(null)
      setIsLoading(false)
      setHasError(false)
      return
    }

    setIsLoading(true)
    setHasError(false)

    getSignedSelfieUrl(storagePath)
      .then(url => {
        if (!isMounted) return
        if (url) {
          setImageUrl(url)
          setHasError(false)
        } else {
          setHasError(true)
        }
      })
      .catch(() => {
        if (!isMounted) return
        setHasError(true)
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [storagePath])

  const sizeClasses = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-12 h-12 text-sm',
  }[size]

  // Case 1: No storage path provided
  if (!storagePath) {
    return (
      <div
        className={`${sizeClasses} rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-400 flex flex-col items-center justify-center flex-shrink-0 select-none ${className}`}
        title="Foto selfie tidak tersedia untuk transaksi ini"
      >
        <ImageOff size={size === 'sm' ? 12 : 14} className="opacity-60" />
      </div>
    )
  }

  // Case 2: Loading signed URL
  if (isLoading) {
    return (
      <div
        className={`${sizeClasses} rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-400 flex items-center justify-center flex-shrink-0 animate-pulse ${className}`}
        title="Memuat foto selfie..."
      >
        <Loader2 size={13} className="animate-spin opacity-50" />
      </div>
    )
  }

  // Case 3: Failed to load URL or broken image
  if (hasError || !imageUrl) {
    return (
      <div
        className={`${sizeClasses} rounded-lg bg-rose-50 border border-rose-200 text-rose-400 flex flex-col items-center justify-center flex-shrink-0 select-none ${className}`}
        title="Gagal memuat foto selfie"
      >
        <Camera size={size === 'sm' ? 12 : 14} className="opacity-70" />
      </div>
    )
  }

  // Case 4: Image successfully resolved
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative group ${sizeClasses} rounded-lg overflow-hidden border border-neutral-200 shadow-2xs hover:border-neutral-900 transition-all flex-shrink-0 focus:outline-hidden focus:ring-2 focus:ring-neutral-900/30 ${className}`}
      title={title}
    >
      <img
        src={imageUrl}
        alt={alt}
        loading="lazy"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
        <Camera size={13} className="text-white drop-shadow-sm" />
      </div>
    </button>
  )
}
