import { supabase } from './supabase'

interface CacheEntry {
  url: string
  expiresAt: number
}

// In-memory cache for signed URLs to prevent repeated requests
const signedUrlCache = new Map<string, CacheEntry>()
const inFlightRequests = new Map<string, Promise<string | null>>()

/**
 * Get a secure signed URL for a selfie from Supabase Storage with caching.
 * @param storagePath Path in 'selfies' bucket
 * @param expiresIn Expiration duration in seconds (default 3600 = 1 hour)
 */
export async function getSignedSelfieUrl(
  storagePath: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!storagePath || !storagePath.trim()) return null

  const trimmedPath = storagePath.trim()
  const now = Date.now()

  // Check valid cache (with 5-minute safety margin)
  const cached = signedUrlCache.get(trimmedPath)
  if (cached && cached.expiresAt - 300_000 > now) {
    return cached.url
  }

  // Deduplicate concurrent requests for the same path
  const pending = inFlightRequests.get(trimmedPath)
  if (pending) {
    return pending
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.storage
        .from('selfies')
        .createSignedUrl(trimmedPath, expiresIn)

      if (error || !data?.signedUrl) {
        console.warn(`[SIPATEN Storage] Failed to get signed URL for ${trimmedPath}:`, error?.message)
        return null
      }

      signedUrlCache.set(trimmedPath, {
        url: data.signedUrl,
        expiresAt: now + expiresIn * 1000,
      })

      return data.signedUrl
    } catch (err) {
      console.error(`[SIPATEN Storage] Unexpected error creating signed URL for ${trimmedPath}:`, err)
      return null
    } finally {
      inFlightRequests.delete(trimmedPath)
    }
  })()

  inFlightRequests.set(trimmedPath, promise)
  return promise
}

export interface ResizedSelfieResult {
  base64: string // Raw base64 data without data:image/... prefix
  dataUrl: string // Full data URL (data:image/jpeg;base64,...)
  extension: 'jpeg' | 'png'
  width: number
  height: number
}

/**
 * Fetch a selfie image and resize it to max 50x50 px keeping aspect ratio.
 * Used for embedding inside Excel and PDF documents without distorting faces.
 */
export async function fetchResizedSelfieBase64(
  storagePath: string | null | undefined,
  maxDimension = 50
): Promise<ResizedSelfieResult | null> {
  if (!storagePath) return null

  try {
    const signedUrl = await getSignedSelfieUrl(storagePath, 1800)
    if (!signedUrl) return null

    // Fetch image as blob
    const response = await fetch(signedUrl)
    if (!response.ok) return null
    const blob = await response.blob()

    // Browser environment: use HTMLImageElement + Canvas
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return new Promise<ResizedSelfieResult | null>((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'

        const objectUrl = URL.createObjectURL(blob)

        img.onload = () => {
          URL.revokeObjectURL(objectUrl)
          const origW = img.naturalWidth || img.width || 50
          const origH = img.naturalHeight || img.height || 50

          // Calculate aspect-ratio preserved dimensions (max 50x50)
          const scale = Math.min(maxDimension / origW, maxDimension / origH, 1)
          const targetW = Math.max(1, Math.round(origW * scale))
          const targetH = Math.max(1, Math.round(origH * scale))

          const canvas = document.createElement('canvas')
          canvas.width = targetW
          canvas.height = targetH
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            resolve(null)
            return
          }

          ctx.drawImage(img, 0, 0, targetW, targetH)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '')

          resolve({
            base64,
            dataUrl,
            extension: 'jpeg',
            width: targetW,
            height: targetH,
          })
        }

        img.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          resolve(null)
        }

        img.src = objectUrl
      })
    }

    // Fallback: convert blob directly to base64
    const buffer = await blob.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )
    return {
      base64,
      dataUrl: `data:${blob.type || 'image/jpeg'};base64,${base64}`,
      extension: blob.type.includes('png') ? 'png' : 'jpeg',
      width: maxDimension,
      height: maxDimension,
    }
  } catch (err) {
    console.warn(`[SIPATEN Storage] Failed to fetch/resize selfie ${storagePath}:`, err)
    return null
  }
}
