// ============================================================
// SIPATEN — LocationPickerMap Component
// Interactive Leaflet.js map for choosing office coordinates
// and visualizing geofence radius with OpenStreetMap tiles
// ============================================================

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MapPin, Navigation, Info } from 'lucide-react'

// Fix default marker icon assets issue in bundlers (Vite)
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface LocationPickerMapProps {
  latitude: number
  longitude: number
  radiusMeters: number
  onChangeLocation?: (lat: number, lng: number) => void
  onLocationChange?: (lat: number, lng: number) => void
  officeName?: string
  readOnly?: boolean
}

export default function LocationPickerMap({
  latitude,
  longitude,
  radiusMeters,
  onChangeLocation,
  onLocationChange,
  readOnly = false,
}: LocationPickerMapProps) {
  const notifyChange = (lat: number, lng: number) => {
    if (onChangeLocation) onChangeLocation(lat, lng)
    if (onLocationChange) onLocationChange(lat, lng)
  }
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const [isLocating, setIsLocating] = useState(false)

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return
    if (mapInstanceRef.current) return // Already initialized

    const initialLat = Number.isNaN(latitude) ? -6.175392 : latitude
    const initialLng = Number.isNaN(longitude) ? 106.827153 : longitude

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 16,
      zoomControl: true,
      scrollWheelZoom: !readOnly,
    })

    // OpenStreetMap tile layer with attribution
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    // Marker
    const marker = L.marker([initialLat, initialLng], {
      icon: defaultIcon,
      draggable: !readOnly,
    }).addTo(map)

    // Geofence Circle (Monochrome)
    const circle = L.circle([initialLat, initialLng], {
      radius: radiusMeters,
      color: '#18181b',
      fillColor: '#18181b',
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(map)

    if (!readOnly) {
      // Drag marker event
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        circle.setLatLng(pos)
        notifyChange(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)))
      })

      // Map click event
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng
        marker.setLatLng([lat, lng])
        circle.setLatLng([lat, lng])
        notifyChange(Number(lat.toFixed(6)), Number(lng.toFixed(6)))
      })
    }

    mapInstanceRef.current = map
    markerRef.current = marker
    circleRef.current = circle

    // Invalidate map size after mount for smooth rendering
    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 250)

    return () => {
      clearTimeout(timer)
      map.remove()
      mapInstanceRef.current = null
      markerRef.current = null
      circleRef.current = null
    }
  }, [])

  // Sync marker and circle when latitude or longitude props change externally
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && circleRef.current) {
      const currentPos = markerRef.current.getLatLng()
      if (
        Math.abs(currentPos.lat - latitude) > 0.00001 ||
        Math.abs(currentPos.lng - longitude) > 0.00001
      ) {
        markerRef.current.setLatLng([latitude, longitude])
        circleRef.current.setLatLng([latitude, longitude])
        mapInstanceRef.current.panTo([latitude, longitude])
      }
    }
  }, [latitude, longitude])

  // Sync radius circle
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusMeters)
    }
  }, [radiusMeters])

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Perangkat Anda tidak mendukung fitur Geolocation.')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = Number(pos.coords.latitude.toFixed(6))
        const lng = Number(pos.coords.longitude.toFixed(6))
        notifyChange(lat, lng)

        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          markerRef.current.setLatLng([lat, lng])
          circleRef.current.setLatLng([lat, lng])
          mapInstanceRef.current.setView([lat, lng], 17)
        }
        setIsLocating(false)
      },
      err => {
        setIsLocating(false)
        alert(`Gagal mengambil lokasi GPS: ${err.message}. Pastikan izin lokasi aktif.`)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-3">
      {/* Map Header Action */}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info size={14} className="text-emerald-600 flex-shrink-0" />
            <span>Klik pada peta atau geser pin marker untuk menentukan koordinat kantor.</span>
          </div>

          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
          >
            <Navigation size={13} className={isLocating ? 'animate-spin text-emerald-600' : 'text-slate-600'} />
            <span>{isLocating ? 'Mendeteksi...' : 'Ambil Lokasi Saya'}</span>
          </button>
        </div>
      )}

      {/* Map Canvas */}
      <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-inner">
        <div
          ref={mapContainerRef}
          className="w-full h-[320px] sm:h-[380px] z-10"
          style={{ minHeight: '300px' }}
        />

        {/* Floating Coordinates Bar */}
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto z-20 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-md text-[11px] font-mono text-slate-700 flex items-center gap-2">
          <MapPin size={13} className="text-emerald-600" />
          <span>
            {latitude.toFixed(6)}, {longitude.toFixed(6)} &bull; Radius: {radiusMeters}m
          </span>
        </div>
      </div>
    </div>
  )
}
