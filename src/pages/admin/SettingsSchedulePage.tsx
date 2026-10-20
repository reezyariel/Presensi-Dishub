import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Clock, Shield, Headphones, Calendar,
  Sliders, Save, CheckCircle2,
  RefreshCw, ArrowUpRight
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { AttendanceSetting } from '../../types/attendance'
import { DEFAULT_OFFICE_CONFIG } from '../../lib/officeLocation'

export default function SettingsSchedulePage() {
  const { profile } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Local state for editable settings
  const [gracePeriod, setGracePeriod] = useState<number>(0)
  const [signedUrlDuration, setSignedUrlDuration] = useState<number>(3600)
  const [autoFlagOutOfWindow, setAutoFlagOutOfWindow] = useState<boolean>(true)

  // Office Geofence GPS Settings
  const [officeLat, setOfficeLat] = useState<number>(DEFAULT_OFFICE_CONFIG.latitude)
  const [officeLng, setOfficeLng] = useState<number>(DEFAULT_OFFICE_CONFIG.longitude)
  const [officeRadius, setOfficeRadius] = useState<number>(DEFAULT_OFFICE_CONFIG.radiusMeters)
  const [officeName, setOfficeName] = useState<string>(DEFAULT_OFFICE_CONFIG.name)
  const [officeAddress, setOfficeAddress] = useState<string>(DEFAULT_OFFICE_CONFIG.address || '')

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setIsLoading(true)
    try {
      const { data } = await supabase
        .from('attendance_settings')
        .select('*')

      if (data) {
        (data as AttendanceSetting[]).forEach(s => {
          if (s.setting_key === 'grace_period_minutes') {
            setGracePeriod(Number(s.setting_value) || 0)
          } else if (s.setting_key === 'selfie_signed_url_duration_seconds') {
            setSignedUrlDuration(Number(s.setting_value) || 3600)
          } else if (s.setting_key === 'auto_flag_out_of_window') {
            setAutoFlagOutOfWindow(Boolean(s.setting_value))
          } else if (s.setting_key === 'office_coordinates') {
            const coords = s.setting_value as {
              latitude?: number
              lat?: number
              longitude?: number
              lng?: number
              name?: string
              address?: string
            }
            if (coords) {
              const lat = coords.latitude ?? coords.lat
              const lng = coords.longitude ?? coords.lng
              if (lat !== undefined && !Number.isNaN(Number(lat))) setOfficeLat(Number(lat))
              if (lng !== undefined && !Number.isNaN(Number(lng))) setOfficeLng(Number(lng))
              if (coords.name) setOfficeName(coords.name)
              if (coords.address) setOfficeAddress(coords.address)
            }
          } else if (s.setting_key === 'office_radius_meters') {
            setOfficeRadius(Number(s.setting_value) || 100)
          }
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSaveSettings() {
    if (!profile) return
    setIsSaving(true)
    setSaveSuccess(false)

    try {
      const updates: Array<{
        setting_key: string
        setting_value: unknown
        description: string
        updated_by: string
        updated_at: string
      }> = [
        {
          setting_key: 'grace_period_minutes',
          setting_value: gracePeriod,
          description: 'Toleransi keterlambatan dalam menit (0 = tanpa toleransi)',
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        },
        {
          setting_key: 'selfie_signed_url_duration_seconds',
          setting_value: signedUrlDuration,
          description: 'Masa berlaku URL foto selfie privat dalam detik',
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        },
        {
          setting_key: 'auto_flag_out_of_window',
          setting_value: autoFlagOutOfWindow,
          description: 'Tandai otomatis sebagai perlu tindak lanjut bila di luar jadwal',
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        },
        {
          setting_key: 'office_coordinates',
          setting_value: {
            latitude: officeLat,
            longitude: officeLng,
            name: officeName,
            address: officeAddress,
          },
          description: 'Koordinat titik kantor pusat untuk validasi geofence GPS presensi',
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        },
        {
          setting_key: 'office_radius_meters',
          setting_value: officeRadius,
          description: 'Radius toleransi geofence presensi kantor dalam meter',
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        },
      ]

      for (const item of updates) {
        await supabase
          .from('attendance_settings')
          .upsert(item, { onConflict: 'setting_key' })
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3500)
      await loadSettings()
    } catch {
      alert('Gagal menyimpan pengaturan ke database.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <span>Sistem & Konfigurasi</span>
            <span>/</span>
            <span className="text-neutral-900">Pengaturan Jadwal</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight mt-1">
            Konfigurasi Jadwal & Toleransi Presensi
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Parameter jendela waktu jam kerja staf CS, shift security 24 jam, toleransi keterlambatan, dan masa aktif URL selfie.
          </p>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={isSaving || isLoading}
          className="px-4 py-2.5 bg-neutral-900 hover:bg-black text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-xs flex-shrink-0"
        >
          {isSaving ? (
            <RefreshCw size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          <span>{isSaving ? 'Menyimpan...' : 'Simpan Parameter'}</span>
        </button>
      </div>

      {/* Success Notification */}
      {saveSuccess && (
        <div className="p-4 bg-neutral-900 text-white rounded-xl shadow-xs flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 size={18} className="text-white" />
            <span>Parameter jadwal dan toleransi sistem berhasil diperbarui dan aktif di seluruh antrean presensi.</span>
          </div>
        </div>
      )}

      {/* Interactive System Parameters Grid */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <Sliders size={16} />
            Parameter Toleransi & Kebijakan Otomatis
          </h2>
          <span className="text-[11px] font-medium text-neutral-500">
            Diterapkan langsung ke mesin perhitungan keterlambatan
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-800">
              Toleransi Keterlambatan (Grace Period)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={60}
                value={gracePeriod}
                onChange={(e) => setGracePeriod(Number(e.target.value))}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400">
                Menit
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              0 menit = disiplin ketat tanpa toleransi keterlambatan.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-800">
              Masa Berlaku Signed URL Foto Selfie
            </label>
            <div className="relative">
              <input
                type="number"
                min={60}
                max={86400}
                value={signedUrlDuration}
                onChange={(e) => setSignedUrlDuration(Number(e.target.value))}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400">
                Detik
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              3600 detik (1 jam) untuk privasi dan keamanan dokumen selfie.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-800">
              Peta Lokasi Kantor & Geofence
            </label>
            <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-neutral-900 truncate max-w-[170px]">
                  {officeName}
                </div>
                <div className="text-[11px] font-mono text-neutral-500">
                  Radius: {officeRadius} meter
                </div>
              </div>
              <Link
                to="/admin/settings/location"
                className="p-1.5 bg-neutral-900 text-white rounded hover:bg-black transition-colors"
                title="Buka Peta Geofence"
              >
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Konfigurasi peta interaktif di menu Peta Lokasi.
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-neutral-100 flex items-center gap-3">
          <input
            type="checkbox"
            id="autoFlag"
            checked={autoFlagOutOfWindow}
            onChange={(e) => setAutoFlagOutOfWindow(e.target.checked)}
            className="w-4 h-4 accent-neutral-900 rounded cursor-pointer"
          />
          <label htmlFor="autoFlag" className="text-xs font-medium text-neutral-800 cursor-pointer select-none">
            Tandai otomatis rekaman presensi di luar jendela waktu sebagai <strong>"Perlu Tindak Lanjut"</strong> di antrean Review Absensi.
          </label>
        </div>
      </div>

      {/* CS Shift Table Card */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <Headphones size={15} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                Jadwal Operasional — Customer Service (CS)
              </h2>
              <p className="text-[11px] text-neutral-500">
                Berlaku setiap hari kerja (Senin – Minggu)
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-neutral-900 bg-neutral-200/70 px-2.5 py-1 rounded">
            1 Shift Tetap
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/40 space-y-2">
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              1. Presensi Masuk
            </div>
            <div className="text-2xl font-bold font-mono text-neutral-900">07:00</div>
            <div className="text-xs text-neutral-600">
              <span className="font-semibold text-neutral-900">Jendela Waktu:</span> 07:00 – 08:00
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Presensi setelah pukul 07:00 dihitung terlambat menit demi menit sesuai toleransi sistem.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/40 space-y-2">
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              2. Presensi Istirahat
            </div>
            <div className="text-2xl font-bold font-mono text-neutral-900">12:00 – 14:00</div>
            <div className="text-xs text-neutral-600">
              <span className="font-semibold text-neutral-900">Frekuensi:</span> Maksimal 1x per hari kerja
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Mencatat waktu awal istirahat. Staf di luar jam ini otomatis masuk antrean konfirmasi.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/40 space-y-2">
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              3. Presensi Pulang
            </div>
            <div className="text-2xl font-bold font-mono text-neutral-900">16:00 – 18:00</div>
            <div className="text-xs text-neutral-600">
              <span className="font-semibold text-neutral-900">Jendela Waktu:</span> 16:00 – 18:00
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Absen pulang sebelum 16:00 (pulang awal) atau sesudah 18:00 memerlukan catatan verifikasi.
            </p>
          </div>
        </div>
      </div>

      {/* Security Shift Grid */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <Shield size={15} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                Jadwal Operasional — Tim Security Satpam (3 Shift)
              </h2>
              <p className="text-[11px] text-neutral-500">
                Rotasi 24 jam dengan ketentuan pergeseran khusus pada hari Kamis & Jumat (+30 menit)
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-neutral-900 bg-neutral-200/70 px-2.5 py-1 rounded">
            Rotasi 24 Jam
          </span>
        </div>

        <div className="p-5 space-y-5">
          {/* Reguler Days */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 uppercase tracking-wide mb-3">
              <Calendar size={14} />
              <span>Jadwal Reguler: Senin – Rabu & Sabtu – Minggu</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-1.5 shadow-xs">
                <div className="text-xs font-bold text-neutral-900">Shift I (Pagi)</div>
                <div className="text-xl font-bold font-mono text-neutral-900">07:30 – 16:00</div>
                <div className="text-xs text-neutral-600">
                  Masuk: <span className="font-semibold text-neutral-900">07:30 – 08:00</span>
                </div>
                <div className="text-xs text-neutral-600">
                  Pulang: <span className="font-semibold text-neutral-900">16:00 – 16:30</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-1.5 shadow-xs">
                <div className="text-xs font-bold text-neutral-900">Shift II (Sore)</div>
                <div className="text-xl font-bold font-mono text-neutral-900">16:00 – 20:00</div>
                <div className="text-xs text-neutral-600">
                  Masuk: <span className="font-semibold text-neutral-900">16:00 – 16:30</span>
                </div>
                <div className="text-xs text-neutral-600">
                  Pulang: <span className="font-semibold text-neutral-900">20:00 – 20:30</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900">Shift III (Malam)</span>
                  <span className="text-[10px] bg-neutral-900 text-white font-mono px-1.5 py-0.2 rounded font-bold">Lintas Hari</span>
                </div>
                <div className="text-xl font-bold font-mono text-neutral-900">20:00 – 07:30 (H+1)</div>
                <div className="text-xs text-neutral-600">
                  Masuk: <span className="font-semibold text-neutral-900">20:00 – 20:30</span>
                </div>
                <div className="text-xs text-neutral-600">
                  Pulang: <span className="font-semibold text-neutral-900">07:30 – 08:00 (H+1)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Shifted Days: Thu & Fri */}
          <div className="pt-4 border-t border-neutral-100">
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 uppercase tracking-wide mb-3">
              <Clock size={14} />
              <span>Jadwal Khusus: Hari Kamis & Jumat (Bergeser +30 Menit)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-1.5 shadow-xs">
                <div className="text-xs font-bold text-neutral-900">Shift I (Pagi)</div>
                <div className="text-xl font-bold font-mono text-neutral-900">08:00 – 16:30</div>
                <div className="text-xs text-neutral-600">
                  Masuk: <span className="font-semibold text-neutral-900">08:00 – 08:30</span>
                </div>
                <div className="text-xs text-neutral-600">
                  Pulang: <span className="font-semibold text-neutral-900">16:30 – 17:00</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-1.5 shadow-xs">
                <div className="text-xs font-bold text-neutral-900">Shift II (Sore)</div>
                <div className="text-xl font-bold font-mono text-neutral-900">16:30 – 20:30</div>
                <div className="text-xs text-neutral-600">
                  Masuk: <span className="font-semibold text-neutral-900">16:30 – 17:00</span>
                </div>
                <div className="text-xs text-neutral-600">
                  Pulang: <span className="font-semibold text-neutral-900">20:30 – 21:00</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900">Shift III (Malam)</span>
                  <span className="text-[10px] bg-neutral-900 text-white font-mono px-1.5 py-0.2 rounded font-bold">Lintas Hari</span>
                </div>
                <div className="text-xl font-bold font-mono text-neutral-900">20:30 – 08:00 (H+1)</div>
                <div className="text-xs text-neutral-600">
                  Masuk: <span className="font-semibold text-neutral-900">20:30 – 21:00</span>
                </div>
                <div className="text-xs text-neutral-600">
                  Pulang: <span className="font-semibold text-neutral-900">08:00 – 08:30 (H+1)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
