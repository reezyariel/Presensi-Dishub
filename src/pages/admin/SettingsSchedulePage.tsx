import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Clock, Shield, Headphones, Calendar,
  Sliders, Save, CheckCircle2,
  RefreshCw, ArrowUpRight, Edit3
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { AttendanceSetting } from '../../types/attendance'
import { DEFAULT_OFFICE_CONFIG } from '../../lib/officeLocation'
import { invalidateScheduleCache } from '../../lib/scheduleEngine'

export default function SettingsSchedulePage() {
  const { profile } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Operational Parameters
  const [gracePeriod, setGracePeriod] = useState<number>(0)
  const [signedUrlDuration, setSignedUrlDuration] = useState<number>(3600)
  const [autoFlagOutOfWindow, setAutoFlagOutOfWindow] = useState<boolean>(true)

  // Office Geofence GPS Settings
  const [officeLat, setOfficeLat] = useState<number>(DEFAULT_OFFICE_CONFIG.latitude)
  const [officeLng, setOfficeLng] = useState<number>(DEFAULT_OFFICE_CONFIG.longitude)
  const [officeRadius, setOfficeRadius] = useState<number>(DEFAULT_OFFICE_CONFIG.radiusMeters)
  const [officeName, setOfficeName] = useState<string>(DEFAULT_OFFICE_CONFIG.name)
  const [officeAddress, setOfficeAddress] = useState<string>(DEFAULT_OFFICE_CONFIG.address || '')

  // CS Schedule (editable windows)
  const [csMasukOpen, setCsMasukOpen] = useState('07:30')
  const [csMasukDeadline, setCsMasukDeadline] = useState('08:00')
  const [csMasukClose, setCsMasukClose] = useState('11:59')
  const [csIstirahatStart, setCsIstirahatStart] = useState('12:00')
  const [csIstirahatEnd, setCsIstirahatEnd] = useState('14:00')
  const [csPulangStart, setCsPulangStart] = useState('16:00')
  const [csPulangEnd, setCsPulangEnd] = useState('18:00')

  // Security Schedule (Senin–Jumat)
  const [secShiftOffsetMin, setSecShiftOffsetMin] = useState(0)
  const [secS1Start, setSecS1Start] = useState('07:00')
  const [secS1WinEnd, setSecS1WinEnd] = useState('07:30')
  const [secS1End, setSecS1End] = useState('16:00')
  const [secS1EndWin, setSecS1EndWin] = useState('16:30')
  const [secS2Start, setSecS2Start] = useState('15:00')
  const [secS2WinEnd, setSecS2WinEnd] = useState('15:30')
  const [secS2End, setSecS2End] = useState('19:30')
  const [secS2EndWin, setSecS2EndWin] = useState('20:00')
  const [secS3Start, setSecS3Start] = useState('19:30')
  const [secS3WinEnd, setSecS3WinEnd] = useState('20:00')
  const [secS3End, setSecS3End] = useState('07:00')
  const [secS3EndWin, setSecS3EndWin] = useState('07:30')

  // Security Weekend Schedule (Sabtu & Minggu - Sesi Pagi & Sesi Malam)
  const [secWkndPagiOpen, setSecWkndPagiOpen] = useState('08:00')
  const [secWkndPagiClose, setSecWkndPagiClose] = useState('08:30')
  const [secWkndMalamOpen, setSecWkndMalamOpen] = useState('20:00')
  const [secWkndMalamClose, setSecWkndMalamClose] = useState('20:30')

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
              latitude?: number; lat?: number
              longitude?: number; lng?: number
              name?: string; address?: string
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
          } else if (s.setting_key === 'cs_schedule') {
            const cs = s.setting_value as {
              masuk?: { open?: string; ontime_deadline?: string; close?: string; start?: string; end?: string }
              istirahat?: { start?: string; end?: string }
              pulang?: { start?: string; end?: string }
            }
            // Support both old schema (start/end) and new schema (open/ontime_deadline/close)
            if (cs.masuk?.open) setCsMasukOpen(cs.masuk.open)
            else if (cs.masuk?.start) setCsMasukOpen(cs.masuk.start)
            if (cs.masuk?.ontime_deadline) setCsMasukDeadline(cs.masuk.ontime_deadline)
            else if (cs.masuk?.end) setCsMasukDeadline(cs.masuk.end)
            if (cs.masuk?.close) setCsMasukClose(cs.masuk.close)
            if (cs.istirahat?.start) setCsIstirahatStart(cs.istirahat.start)
            if (cs.istirahat?.end) setCsIstirahatEnd(cs.istirahat.end)
            if (cs.pulang?.start) setCsPulangStart(cs.pulang.start)
            if (cs.pulang?.end) setCsPulangEnd(cs.pulang.end)
          } else if (s.setting_key === 'security_schedule') {
            const sec = s.setting_value as {
              thursday_friday_shift_minutes?: number
              shifts?: Record<string, {
                start?: string; window_end?: string
                end?: string; end_window_end?: string
              }>
            }
            if (sec.thursday_friday_shift_minutes != null) setSecShiftOffsetMin(sec.thursday_friday_shift_minutes)
            const s1 = sec.shifts?.['Shift I']
            const s2 = sec.shifts?.['Shift II']
            const s3 = sec.shifts?.['Shift III']
            if (s1?.start) setSecS1Start(s1.start)
            if (s1?.window_end) setSecS1WinEnd(s1.window_end)
            if (s1?.end) setSecS1End(s1.end)
            if (s1?.end_window_end) setSecS1EndWin(s1.end_window_end)
            if (s2?.start) setSecS2Start(s2.start)
            if (s2?.window_end) setSecS2WinEnd(s2.window_end)
            if (s2?.end) setSecS2End(s2.end)
            if (s2?.end_window_end) setSecS2EndWin(s2.end_window_end)
            if (s3?.start) setSecS3Start(s3.start)
            if (s3?.window_end) setSecS3WinEnd(s3.window_end)
            if (s3?.end) setSecS3End(s3.end)
            if (s3?.end_window_end) setSecS3EndWin(s3.end_window_end)
          } else if (s.setting_key === 'security_weekend_schedule') {
            const wknd = s.setting_value as {
              sesi_pagi?: { open?: string; close?: string }
              sesiPagi?: { open?: string; close?: string }
              sesi_malam?: { open?: string; close?: string }
              sesiMalam?: { open?: string; close?: string }
            }
            const pagi = wknd?.sesi_pagi || wknd?.sesiPagi
            const malam = wknd?.sesi_malam || wknd?.sesiMalam
            if (pagi?.open) setSecWkndPagiOpen(pagi.open)
            if (pagi?.close) setSecWkndPagiClose(pagi.close)
            if (malam?.open) setSecWkndMalamOpen(malam.open)
            if (malam?.close) setSecWkndMalamClose(malam.close)
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

    const now = new Date().toISOString()

    const updates = [
      {
        setting_key: 'grace_period_minutes',
        setting_value: gracePeriod,
        description: 'Toleransi keterlambatan dalam menit (0 = tanpa toleransi)',
        updated_by: profile.id, updated_at: now,
      },
      {
        setting_key: 'selfie_signed_url_duration_seconds',
        setting_value: signedUrlDuration,
        description: 'Masa berlaku URL foto selfie privat dalam detik',
        updated_by: profile.id, updated_at: now,
      },
      {
        setting_key: 'auto_flag_out_of_window',
        setting_value: autoFlagOutOfWindow,
        description: 'Tandai otomatis rekaman presensi di luar jadwal',
        updated_by: profile.id, updated_at: now,
      },
      {
        setting_key: 'office_coordinates',
        setting_value: { latitude: officeLat, longitude: officeLng, name: officeName, address: officeAddress },
        description: 'Koordinat titik kantor untuk validasi geofence GPS',
        updated_by: profile.id, updated_at: now,
      },
      {
        setting_key: 'office_radius_meters',
        setting_value: officeRadius,
        description: 'Radius toleransi geofence presensi kantor dalam meter',
        updated_by: profile.id, updated_at: now,
      },
      {
        setting_key: 'cs_schedule',
        setting_value: {
          masuk: {
            open: csMasukOpen,
            ontime_deadline: csMasukDeadline,
            close: csMasukClose,
          },
          istirahat: { start: csIstirahatStart, end: csIstirahatEnd },
          pulang: { start: csPulangStart, end: csPulangEnd },
        },
        description: 'Jadwal CS: open=mulai jendela, ontime_deadline=batas tepat_waktu, close=tutup jendela, plus istirahat dan pulang.',
        updated_by: profile.id, updated_at: now,
      },
      {
        setting_key: 'security_schedule',
        setting_value: {
          thursday_friday_shift_minutes: secShiftOffsetMin,
          shifts: {
            'Shift I': { start: secS1Start, window_end: secS1WinEnd, end: secS1End, end_window_end: secS1EndWin, end_next_day: false, end_window_end_next_day: false },
            'Shift II': { start: secS2Start, window_end: secS2WinEnd, end: secS2End, end_window_end: secS2EndWin, end_next_day: false, end_window_end_next_day: false },
            'Shift III': { start: secS3Start, window_end: secS3WinEnd, end: secS3End, end_window_end: secS3EndWin, end_next_day: true, end_window_end_next_day: true },
          },
        },
        description: 'Jadwal Security 3 shift 24 jam. Jendela masuk: Shift I 07.00–07.30 (Sen-Kam), Shift II 15.00–15.30, Shift III 19.30–20.00 WIB.',
        updated_by: profile.id, updated_at: now,
      },
      {
        setting_key: 'security_weekend_schedule',
        setting_value: {
          sesi_pagi: { open: secWkndPagiOpen, close: secWkndPagiClose },
          sesi_malam: { open: secWkndMalamOpen, close: secWkndMalamClose },
        },
        description: 'Jadwal Security akhir pekan (Sabtu & Minggu). Sesi Pagi: 08.00–08.30, Sesi Malam: 20.00–20.30 WIB.',
        updated_by: profile.id, updated_at: now,
      },
    ]

    try {
      for (const item of updates) {
        await supabase
          .from('attendance_settings')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(item as any, { onConflict: 'setting_key' })
      }
      // Invalidate in-memory schedule cache so next check-in uses new config
      invalidateScheduleCache()
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3500)
      await loadSettings()
    } catch {
      // error handled silently — user can retry
    } finally {
      setIsSaving(false)
    }
  }

  const timeInput = (value: string, onChange: (v: string) => void, label: string) => (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-neutral-600">{label}</label>
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
      />
    </div>
  )

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
            Atur jendela waktu CS, shift Security 24 jam, toleransi keterlambatan, dan parameter sistem lainnya.
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
          <span>{isSaving ? 'Menyimpan...' : 'Simpan Semua Perubahan'}</span>
        </button>
      </div>

      {/* Success Notification */}
      {saveSuccess && (
        <div className="p-4 bg-neutral-900 text-white rounded-xl shadow-xs flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 size={18} className="text-white" />
            <span>Semua pengaturan jadwal berhasil diperbarui dan aktif di seluruh sistem presensi.</span>
          </div>
        </div>
      )}

      {/* Operational Parameters */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <Sliders size={16} />
            Parameter Toleransi & Kebijakan Otomatis
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-800">
              Toleransi Keterlambatan (Grace Period)
            </label>
            <div className="relative">
              <input
                type="number" min={0} max={60} value={gracePeriod}
                onChange={(e) => setGracePeriod(Number(e.target.value))}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400">Menit</span>
            </div>
            <p className="text-[11px] text-neutral-500">0 = disiplin ketat tanpa toleransi.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-800">
              Masa Berlaku Signed URL Foto Selfie
            </label>
            <div className="relative">
              <input
                type="number" min={60} max={86400} value={signedUrlDuration}
                onChange={(e) => setSignedUrlDuration(Number(e.target.value))}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400">Detik</span>
            </div>
            <p className="text-[11px] text-neutral-500">3600 detik (1 jam) default untuk keamanan foto.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-800">
              Peta Lokasi Kantor & Geofence
            </label>
            <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-neutral-900 truncate max-w-[170px]">{officeName}</div>
                <div className="text-[11px] font-mono text-neutral-500">Radius: {officeRadius} meter</div>
              </div>
              <Link
                to="/admin/settings/location"
                className="p-1.5 bg-neutral-900 text-white rounded hover:bg-black transition-colors"
                title="Buka Peta Geofence"
              >
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <p className="text-[11px] text-neutral-500">Konfigurasi peta interaktif di menu Peta Lokasi.</p>
          </div>
        </div>

        <div className="pt-3 border-t border-neutral-100 flex items-center gap-3">
          <input
            type="checkbox" id="autoFlag"
            checked={autoFlagOutOfWindow}
            onChange={(e) => setAutoFlagOutOfWindow(e.target.checked)}
            className="w-4 h-4 accent-neutral-900 rounded cursor-pointer"
          />
          <label htmlFor="autoFlag" className="text-xs font-medium text-neutral-800 cursor-pointer select-none">
            Tandai otomatis rekaman di luar jendela waktu sebagai <strong>"Perlu Tindak Lanjut"</strong> di Review Absensi.
          </label>
        </div>
      </div>

      {/* CS Schedule - Editable */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <Headphones size={15} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                Jadwal CS — Cleaning Service
              </h2>
              <p className="text-[11px] text-neutral-500">
                Masuk: <strong>sebelum open</strong> = ditolak · <strong>open–batas tepat waktu</strong> = tepat waktu · <strong>batas–tutup</strong> = terlambat · <strong>setelah tutup</strong> = ditolak
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Edit3 size={14} className="text-neutral-400" />
            <span className="text-[11px] font-bold text-neutral-900 bg-neutral-200/70 px-2.5 py-1 rounded">
              1 Shift Tetap
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Masuk — 3 batas waktu */}
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/40 space-y-3">
              <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                1. Presensi Masuk
              </div>
              <p className="text-[11px] text-neutral-500">
                Sistem 3-batas: tombol aktif antara <em>Open</em> dan <em>Tutup</em>. Status tepat waktu jika ≤ <em>Batas Tepat Waktu</em>.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {timeInput(csMasukOpen, setCsMasukOpen, '⏰ Mulai Check-in (Open)')}
                {timeInput(csMasukDeadline, setCsMasukDeadline, '✅ Batas Tepat Waktu (Ontime Deadline)')}
                {timeInput(csMasukClose, setCsMasukClose, '🔒 Tutup Check-in (Close)')}
              </div>

              <div className="text-xs font-mono text-neutral-700 bg-white border border-neutral-200 rounded-lg px-3 py-2 space-y-0.5">
                <div><span className="text-neutral-400">Buka:  </span><strong>{csMasukOpen}</strong></div>
                <div><span className="text-neutral-400">Batas: </span><strong>{csMasukDeadline}</strong></div>
                <div><span className="text-neutral-400">Tutup: </span><strong>{csMasukClose}</strong></div>
              </div>
            </div>

            {/* Istirahat */}
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/40 space-y-3">
              <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                2. Presensi Istirahat
              </div>
              <p className="text-[11px] text-neutral-500">
                Jendela waktu pencatatan istirahat siang.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {timeInput(csIstirahatStart, setCsIstirahatStart, 'Mulai Jendela')}
                {timeInput(csIstirahatEnd, setCsIstirahatEnd, 'Batas Jendela')}
              </div>
              <div className="text-xs font-bold font-mono text-neutral-900 bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-center">
                {csIstirahatStart} – {csIstirahatEnd}
              </div>
            </div>

            {/* Pulang */}
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/40 space-y-3">
              <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                3. Presensi Pulang
              </div>
              <p className="text-[11px] text-neutral-500">
                Jendela waktu absen pulang. Di luar jendela perlu verifikasi admin.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {timeInput(csPulangStart, setCsPulangStart, 'Mulai Jendela')}
                {timeInput(csPulangEnd, setCsPulangEnd, 'Batas Jendela')}
              </div>
              <div className="text-xs font-bold font-mono text-neutral-900 bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-center">
                {csPulangStart} – {csPulangEnd}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Security Schedule - Editable */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <Shield size={15} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                Jadwal Security — Hari Kerja &amp; Akhir Pekan
              </h2>
              <p className="text-[11px] text-neutral-500">
                Senin–Jumat (3 Shift Rotasi) · Sabtu–Minggu (Sesi Pagi &amp; Sesi Malam). Waktu masuk adalah jendela check-in, bukan durasi kerja.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Edit3 size={14} className="text-neutral-400" />
            <span className="text-[11px] font-bold text-neutral-900 bg-neutral-200/70 px-2.5 py-1 rounded">
              Rotasi 24 Jam &amp; Sesi
            </span>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Subheader Hari Kerja */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 uppercase tracking-wide">
                <Calendar size={14} />
                <span>Hari Kerja (Senin–Jumat) — 3 Shift Rotasi</span>
              </div>
              <span className="text-[10px] bg-neutral-100 text-neutral-700 border border-neutral-200 px-2 py-0.5 rounded-full font-bold">
                Senin–Jumat
              </span>
            </div>

            {/* Offset setting */}
            <div className="flex items-center gap-4 p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
              <Clock size={16} className="text-neutral-500 flex-shrink-0" />
              <div className="flex-1 text-xs">
                <span className="font-semibold text-neutral-800">Pergeseran Kamis &amp; Jumat:</span>
                <span className="text-neutral-500 ml-1">Tambahkan menit ke semua shift pada hari Kamis dan Jumat.</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={120} value={secShiftOffsetMin}
                  onChange={e => setSecShiftOffsetMin(Number(e.target.value))}
                  className="w-20 px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 text-center"
                />
                <span className="text-xs text-neutral-500 font-medium">menit</span>
              </div>
            </div>

            {/* Shift I */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-neutral-900">Shift I (Pagi)</span>
                <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                  Jendela Check-In: {secS1Start}–{secS1WinEnd} WIB
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-neutral-200 bg-white">
                {timeInput(secS1Start, setSecS1Start, 'Mulai Check-In (Open)')}
                {timeInput(secS1WinEnd, setSecS1WinEnd, 'Batas Check-In (Close)')}
                {timeInput(secS1End, setSecS1End, 'Pulang Mulai')}
                {timeInput(secS1EndWin, setSecS1EndWin, 'Pulang Batas')}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1.5">
                Reguler: Check-In {secS1Start}–{secS1WinEnd} • Pulang {secS1End}–{secS1EndWin}
              </p>
            </div>

            {/* Shift II */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-neutral-900">Shift II (Sore)</span>
                <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                  Jendela Check-In: {secS2Start}–{secS2WinEnd} WIB
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-neutral-200 bg-white">
                {timeInput(secS2Start, setSecS2Start, 'Mulai Check-In (Open)')}
                {timeInput(secS2WinEnd, setSecS2WinEnd, 'Batas Check-In (Close)')}
                {timeInput(secS2End, setSecS2End, 'Pulang Mulai')}
                {timeInput(secS2EndWin, setSecS2EndWin, 'Pulang Batas')}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1.5">
                Reguler: Check-In {secS2Start}–{secS2WinEnd} • Pulang {secS2End}–{secS2EndWin}
              </p>
            </div>

            {/* Shift III */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-900">Shift III (Malam)</span>
                  <span className="text-[10px] bg-neutral-900 text-white font-mono px-1.5 py-0.5 rounded font-bold">Lintas Hari</span>
                </div>
                <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                  Jendela Check-In: {secS3Start}–{secS3WinEnd} WIB
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-neutral-200 bg-neutral-50/50">
                {timeInput(secS3Start, setSecS3Start, 'Mulai Check-In (Open)')}
                {timeInput(secS3WinEnd, setSecS3WinEnd, 'Batas Check-In (Close)')}
                {timeInput(secS3End, setSecS3End, 'Pulang Mulai (H+1)')}
                {timeInput(secS3EndWin, setSecS3EndWin, 'Pulang Batas (H+1)')}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1.5">
                Reguler: Check-In {secS3Start}–{secS3WinEnd} • Pulang {secS3End}–{secS3EndWin} (H+1)
              </p>
            </div>
          </div>

          {/* Akhir Pekan (Sabtu & Minggu) — Sesi Pagi & Sesi Malam */}
          <div className="pt-6 border-t border-neutral-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 uppercase tracking-wide">
                  <Calendar size={14} className="text-amber-600" />
                  <span>Jadwal Akhir Pekan (Sabtu &amp; Minggu) — Sesi Masuk</span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Khusus Sabtu dan Minggu tidak menggunakan label Shift I, II, atau III. Gunakan label Sesi Pagi dan Sesi Malam dengan jendela check-in di bawah ini.
                </p>
              </div>
              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                Khusus Sabtu &amp; Minggu
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sesi Pagi */}
              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900">Sesi Pagi (Akhir Pekan)</span>
                  <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-white px-2 py-0.5 rounded border border-neutral-200">
                    Jendela: {secWkndPagiOpen} – {secWkndPagiClose} WIB
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Waktu presensi masuk petugas keamanan sesi pagi pada hari Sabtu dan Minggu.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {timeInput(secWkndPagiOpen, setSecWkndPagiOpen, 'Mulai Check-in (Open)')}
                  {timeInput(secWkndPagiClose, setSecWkndPagiClose, 'Batas Check-in (Close)')}
                </div>
                <div className="text-xs font-bold font-mono text-neutral-900 bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-center">
                  {secWkndPagiOpen} – {secWkndPagiClose} WIB
                </div>
              </div>

              {/* Sesi Malam */}
              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900">Sesi Malam (Akhir Pekan)</span>
                  <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-white px-2 py-0.5 rounded border border-neutral-200">
                    Jendela: {secWkndMalamOpen} – {secWkndMalamClose} WIB
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Waktu presensi masuk petugas keamanan sesi malam pada hari Sabtu dan Minggu.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {timeInput(secWkndMalamOpen, setSecWkndMalamOpen, 'Mulai Check-in (Open)')}
                  {timeInput(secWkndMalamClose, setSecWkndMalamClose, 'Batas Check-in (Close)')}
                </div>
                <div className="text-xs font-bold font-mono text-neutral-900 bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-center">
                  {secWkndMalamOpen} – {secWkndMalamClose} WIB
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
