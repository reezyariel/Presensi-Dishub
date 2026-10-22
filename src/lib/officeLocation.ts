// ============================================================
// SIPATEN — Office Location & GPS Distance Engine
// Haversine formula calculation, Admin authoritative configuration,
// and location validation utilities (Zero hardcoded override)
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export interface OfficeLocationConfig {
  latitude: number
  longitude: number
  radiusMeters: number
  name: string
  address?: string
  presetId?: string
  isConfigured: boolean
}

export interface ActiveLocationResult {
  config: OfficeLocationConfig | null
  isConfigured: boolean
  error: string | null
}

export const DEFAULT_OFFICE_CONFIG: OfficeLocationConfig = {
  latitude: -6.175392,
  longitude: 106.827153,
  radiusMeters: 100,
  name: 'Kantor Pusat SIPATEN',
  address: 'Jakarta Pusat, DKI Jakarta',
  isConfigured: true,
}


/**
 * Calculate the great-circle distance between two GPS points using the Haversine formula
 * @returns distance in meters (rounded to nearest integer)
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (
    Number.isNaN(lat1) || Number.isNaN(lon1) ||
    Number.isNaN(lat2) || Number.isNaN(lon2)
  ) {
    return Infinity
  }

  const R = 6371000 // Earth's mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/**
 * Format distance in human-readable Indonesian string
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || meters === Infinity || Number.isNaN(meters)) return 'Tidak diketahui'
  if (meters < 1000) {
    return `${Math.round(meters)} meter`
  }
  return `${(meters / 1000).toFixed(2)} km`
}

/**
 * Fetch active office coordinates and radius from database (Admin authoritative source).
 * Checks attendance_settings first, then location_presets (is_active = true).
 * Strictly reports when unconfigured or error occurs (NO silent hardcoded fallback).
 */
export async function getActiveOfficeLocation(
  supabase: SupabaseClient,
): Promise<ActiveLocationResult> {
  try {
    // 1. Check attendance_settings (authoritative active settings saved by Admin)
    const { data: settingsRows, error: settingsError } = await supabase
      .from('attendance_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['office_coordinates', 'office_radius_meters'])

    if (settingsError) {
      return {
        config: null,
        isConfigured: false,
        error: `Gagal memuat pengaturan lokasi kantor: ${settingsError.message}`,
      }
    }

    let lat: number | null = null
    let lng: number | null = null
    let radius = 100
    let name = ''
    let address = ''
    let presetId: string | undefined = undefined

    if (settingsRows && settingsRows.length > 0) {
      for (const item of settingsRows) {
        if (item.setting_key === 'office_coordinates') {
          const val = item.setting_value as {
            latitude?: number
            lat?: number
            longitude?: number
            lng?: number
            name?: string
            address?: string
            preset_id?: string
          } | null
          if (val) {
            if (typeof val.latitude === 'number') lat = val.latitude
            else if (typeof val.lat === 'number') lat = val.lat

            if (typeof val.longitude === 'number') lng = val.longitude
            else if (typeof val.lng === 'number') lng = val.lng

            if (val.name) name = val.name
            if (val.address) address = val.address
            if (val.preset_id) presetId = val.preset_id
          }
        } else if (item.setting_key === 'office_radius_meters') {
          const r = Number(item.setting_value)
          if (!Number.isNaN(r) && r > 0) {
            radius = r
          }
        }
      }
    }

    // 2. If valid coordinates found in attendance_settings
    if (lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      return {
        config: {
          latitude: lat,
          longitude: lng,
          radiusMeters: radius,
          name: name || 'Lokasi Kantor Aktif',
          address: address || undefined,
          presetId,
          isConfigured: true,
        },
        isConfigured: true,
        error: null,
      }
    }

    // 3. Secondary check: Look up active preset from location_presets
    const { data: activePreset, error: presetError } = await supabase
      .from('location_presets')
      .select('*')
      .eq('is_active', true)
      .maybeSingle()

    if (presetError) {
      return {
        config: null,
        isConfigured: false,
        error: `Gagal membaca preset lokasi: ${presetError.message}`,
      }
    }

    if (activePreset) {
      return {
        config: {
          latitude: activePreset.latitude,
          longitude: activePreset.longitude,
          radiusMeters: activePreset.radius_meters || 100,
          name: activePreset.name,
          address: activePreset.address || undefined,
          presetId: activePreset.id,
          isConfigured: true,
        },
        isConfigured: true,
        error: null,
      }
    }

    // 4. Truly unconfigured
    return {
      config: null,
      isConfigured: false,
      error: 'Lokasi kantor aktif belum dikonfigurasi oleh Administrator. Silakan hubungi admin.',
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi kendala saat membaca lokasi kantor.'
    return {
      config: null,
      isConfigured: false,
      error: msg,
    }
  }
}

/**
 * Backward compatibility wrapper for existing callers
 */
export async function getOfficeLocationConfig(
  supabase: SupabaseClient,
): Promise<OfficeLocationConfig> {
  const result = await getActiveOfficeLocation(supabase)
  if (result.config) {
    return result.config
  }
  // Return placeholder marked as unconfigured
  return {
    latitude: 0,
    longitude: 0,
    radiusMeters: 100,
    name: 'Belum Dikonfigurasi',
    isConfigured: false,
  }
}
