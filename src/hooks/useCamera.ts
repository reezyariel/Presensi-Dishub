// ============================================================
// SIPATEN — Robust Device Camera Hook
// Full cross-browser support, front/back camera toggling,
// safe stream binding, dimension validation, and cleanup
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react'

export interface CameraState {
  stream: MediaStream | null
  photo: string | null        // Base64 Data URL (image/jpeg)
  photoBlob: Blob | null      // Binary Blob
  error: string | null
  isLoading: boolean
  isActive: boolean
  facingMode: 'user' | 'environment'
  hasMultipleCameras: boolean
}

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isActive, setIsActive] = useState<boolean>(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Keep streamRef in sync
  useEffect(() => {
    streamRef.current = stream
  }, [stream])

  // Check if multiple cameras are available
  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        setHasMultipleCameras(videoInputs.length > 1)
      }).catch(() => { })
    }
  }, [])

  // Safely attach stream to video element whenever stream or videoRef becomes available
  const attachStreamToVideo = useCallback((streamToAttach: MediaStream | null) => {
    const video = videoRef.current
    if (video && streamToAttach) {
      if (video.srcObject !== streamToAttach) {
        video.srcObject = streamToAttach
      }
      video.setAttribute('playsinline', 'true')
      video.muted = true
      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          // Auto-play might be restricted until user interacts or loadedmetadata fires
          console.warn('[SIPATEN Camera] Video play deferred:', err.message)
        })
      }
    }
  }, [])

  // Whenever stream changes, re-attach
  useEffect(() => {
    if (stream && videoRef.current) {
      attachStreamToVideo(stream)
    }
  }, [stream, attachStreamToVideo])

  // Helper: Stop active stream tracks
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop()
        } catch {
          // ignore
        }
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null
      } catch {
        // ignore
      }
    }
  }, [])

  // Stop camera and release hardware
  const stopCamera = useCallback(() => {
    stopTracks()
    setStream(null)
    setIsActive(false)
    setIsLoading(false)
  }, [stopTracks])

  // Start Camera with fallback strategies
  const startCamera = useCallback(async (requestedFacingMode?: 'user' | 'environment') => {
    setIsLoading(true)
    setError(null)

    // 1. Check Secure Context
    const isLocalhost = Boolean(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]'
    )
    if (!window.isSecureContext && !isLocalhost) {
      setIsLoading(false)
      setError('Akses kamera memerlukan protokol aman (HTTPS) atau dijalankan di localhost.')
      return
    }

    // 2. Check Browser API Support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsLoading(false)
      setError('Browser ini tidak mendukung navigator.mediaDevices.getUserMedia. Gunakan Chrome, Edge, Safari, atau Firefox versi terbaru.')
      return
    }

    // Stop any existing stream first
    stopTracks()

    const targetFacingMode = requestedFacingMode || facingMode

    try {
      let activeStream: MediaStream | null = null

      // Strategy A: Ideal constraints with requested facing mode
      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: targetFacingMode },
            width: { ideal: 1280, min: 480 },
            height: { ideal: 720, min: 360 },
          },
        }
        activeStream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (err) {
        console.warn('[SIPATEN Camera] Strategy A failed, trying generic constraints:', err)
        // Strategy B: Fallback without specific facingMode or resolution limits
        const fallbackConstraints: MediaStreamConstraints = {
          audio: false,
          video: true,
        }
        activeStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
      }

      if (!activeStream) {
        throw new Error('Aliran video kamera tidak dapat diinisialisasi.')
      }

      streamRef.current = activeStream
      setStream(activeStream)
      setFacingMode(targetFacingMode)
      setIsActive(true)
      setIsLoading(false)
      setError(null)

      // Bind to video element immediately
      attachStreamToVideo(activeStream)
    } catch (err: unknown) {
      stopTracks()
      let friendlyMsg = 'Kamera tidak dapat diakses saat ini.'

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          friendlyMsg = 'Izin kamera ditolak. Silakan klik ikon gembok / izin di sebelah bilah URL browser Anda, izinkan akses kamera, lalu klik tombol "Coba Lagi".'
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          friendlyMsg = 'Kamera tidak ditemukan. Pastikan perangkat Anda memiliki webcam atau modul kamera yang terhubung.'
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          friendlyMsg = 'Kamera sedang digunakan oleh aplikasi lain (seperti Zoom, Teams, atau browser lain). Tutup aplikasi tersebut dan coba lagi.'
        } else if (err.name === 'OverconstrainedError') {
          friendlyMsg = 'Kamera pada perangkat ini tidak mendukung resolusi yang diminta. Sistem akan mencoba konfigurasi standar.'
        } else if (err.name === 'AbortError') {
          friendlyMsg = 'Pengambilan akses kamera dibatalkan oleh sistem.'
        }
      } else if (err instanceof Error) {
        friendlyMsg = err.message
      }

      setError(friendlyMsg)
      setIsActive(false)
      setIsLoading(false)
    }
  }, [facingMode, stopTracks, attachStreamToVideo])

  // Switch between front and rear cameras
  const toggleFacingMode = useCallback(async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user'
    await startCamera(nextMode)
  }, [facingMode, startCamera])

  // Capture Photo to Canvas
  const capturePhoto = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || !streamRef.current) {
      console.warn('[SIPATEN Camera] Cannot capture: video or stream unavailable')
      return null
    }

    // Ensure video has loaded frames
    const width = video.videoWidth || 640
    const height = video.videoHeight || 480

    if (width === 0 || height === 0) {
      console.warn('[SIPATEN Camera] Video dimensions are 0, frame not ready yet')
      return null
    }

    // Use internal canvasRef or create dynamic canvas
    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return null

    // Mirror image only when using front selfie camera
    if (facingMode === 'user') {
      ctx.save()
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, width, height)
      ctx.restore()
    } else {
      ctx.drawImage(video, 0, 0, width, height)
    }

    // Generate high quality JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)

    // Generate binary Blob
    canvas.toBlob(
      blob => {
        if (blob) {
          setPhotoBlob(blob)
        }
      },
      'image/jpeg',
      0.88
    )

    setPhoto(dataUrl)
    return dataUrl
  }, [facingMode])

  // Retake photo: discard captured photo, keep or resume camera stream
  const retakePhoto = useCallback(() => {
    setPhoto(null)
    setPhotoBlob(null)
    if (!isActive || !streamRef.current) {
      startCamera(facingMode)
    }
  }, [isActive, facingMode, startCamera])

  // Reset all state and release hardware
  const reset = useCallback(() => {
    stopTracks()
    setStream(null)
    setPhoto(null)
    setPhotoBlob(null)
    setError(null)
    setIsLoading(false)
    setIsActive(false)
  }, [stopTracks])

  // Auto cleanup on hook unmount
  useEffect(() => {
    return () => {
      stopTracks()
    }
  }, [stopTracks])

  return {
    stream,
    photo,
    photoBlob,
    error,
    isLoading,
    isActive,
    facingMode,
    hasMultipleCameras,
    videoRef,
    canvasRef,
    startCamera,
    stopCamera,
    capturePhoto,
    retakePhoto,
    toggleFacingMode,
    attachStreamToVideo,
    reset,
  }
}
