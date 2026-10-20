// ============================================================
// ShiftTrack — useGeolocation Hook
// GPS position tracking, browser permission handling,
// distance calculation against office geofence, and error messaging
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { calculateDistanceMeters, DEFAULT_OFFICE_CONFIG, type OfficeLocationConfig } from '../lib/officeLocation'

export interface GeolocationCoords {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

export interface GeolocationState {
  coords: GeolocationCoords | null
  isLoading: boolean
  error: string | null
  permissionState: 'granted' | 'denied' | 'prompt' | 'unknown'
  distanceMeters: number | null
  isInsideRadius: boolean | null
  isSupported: boolean
}

export function useGeolocation(officeConfig: OfficeLocationConfig = DEFAULT_OFFICE_CONFIG) {
  const [state, setState] = useState<GeolocationState>({
    coords: null,
    isLoading: false,
    error: null,
    permissionState: 'unknown',
    distanceMeters: null,
    isInsideRadius: null,
    isSupported: typeof navigator !== 'undefined' && 'geolocation' in navigator,
  })

  const officeRef = useRef(officeConfig)
  useEffect(() => {
    officeRef.current = officeConfig
  }, [officeConfig])

  // Check initial permission query if supported
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then(result => {
          setState(s => ({ ...s, permissionState: result.state as 'granted' | 'denied' | 'prompt' }))
          result.onchange = () => {
            setState(s => ({ ...s, permissionState: result.state as 'granted' | 'denied' | 'prompt' }))
          }
        })
        .catch(() => {
          // Permissions API might not support geolocation in some browsers
        })
    }
  }, [])

  const requestLocation = useCallback(async (): Promise<GeolocationCoords | null> => {
    if (!navigator.geolocation) {
      setState(s => ({
        ...s,
        isLoading: false,
        isSupported: false,
        error: 'Perangkat atau browser Anda tidak mendukung fitur Geolocation GPS.',
      }))
      return null
    }

    setState(s => ({ ...s, isLoading: true, error: null }))

    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        position => {
          const { latitude, longitude, accuracy } = position.coords
          const timestamp = position.timestamp

          const isConfigured = officeRef.current.isConfigured !== false && officeRef.current.latitude !== 0
          const distance = isConfigured
            ? calculateDistanceMeters(
                latitude,
                longitude,
                officeRef.current.latitude,
                officeRef.current.longitude,
              )
            : null

          const isInside = isConfigured && distance !== null ? distance <= officeRef.current.radiusMeters : false

          const coords: GeolocationCoords = {
            latitude,
            longitude,
            accuracy,
            timestamp,
          }

          setState({
            coords,
            isLoading: false,
            error: null,
            permissionState: 'granted',
            distanceMeters: distance,
            isInsideRadius: isInside,
            isSupported: true,
          })

          resolve(coords)
        },
        err => {
          let errorMsg = 'Gagal mendeteksi lokasi GPS Anda.'

          switch (err.code) {
            case err.PERMISSION_DENIED:
              errorMsg =
                'Izin lokasi (GPS) ditolak. Silakan aktifkan izin lokasi di pengaturan browser / HP Anda, lalu muat ulang halaman.'
              break
            case err.POSITION_UNAVAILABLE:
              errorMsg =
                'Sinyal GPS tidak tersedia atau perangkat sedang tidak dapat menentukan lokasi. Pastikan GPS/Location HP Anda aktif.'
              break
            case err.TIMEOUT:
              errorMsg =
                'Waktu pencarian lokasi habis (timeout). Silakan klik coba lagi di area yang memiliki sinyal GPS lebih baik.'
              break
          }

          setState(s => ({
            ...s,
            isLoading: false,
            error: errorMsg,
            permissionState: err.code === err.PERMISSION_DENIED ? 'denied' : s.permissionState,
          }))

          resolve(null)
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        },
      )
    })
  }, [])

  return {
    ...state,
    requestLocation,
  }
}
