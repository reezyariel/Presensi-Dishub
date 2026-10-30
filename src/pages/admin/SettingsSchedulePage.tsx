import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield, Headphones, Calendar,
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

  // Security Schedule: Senin–Kamis (3 Shift)
  const [secShiftOffsetMin, setSecShiftOffsetMin] = useState(0)
  const [secS1Start, setSecS1Start] = useState('07:00')
  const [secS1WinEnd, setSecS1WinEnd] = useState('07:30')
  const [secS1End, setSecS1End] = useState('16:00')
  const [secS1EndWin, setSecS1EndWin] = useState('16:30')
  const [secS2Start, setSecS2Start] = useState('16:00')
  const [secS2WinEnd, setSecS2WinEnd] = useState('16:30')
  const [secS2End, setSecS2End] = useState('19:30')
  const [secS2EndWin, setSecS2EndWin] = useState('20:00')
  const [secS3Start, setSecS3Start] = useState('19:30')
  const [secS3WinEnd, setSecS3WinEnd] = useState('20:00')
  const [secS3End, setSecS3End] = useState('07:00')
  const [secS3EndWin, setSecS3EndWin] = useState('07:30')

  // Security Schedule: Jumat (2 Shift)
  const [secFriS1Start, setSecFriS1Start] = useState('07:30')
  const [secFriS1WinEnd, setSecFriS1WinEnd] = useState('08:00')
  const [secFriS1End, setSecFriS1End] = useState('19:30')
  const [secFriS1EndWin, setSecFriS1EndWin] = useState('20:00')
  const [secFriS2Start, setSecFriS2Start] = useState('19:30')
  const [secFriS2WinEnd, setSecFriS2WinEnd] = useState('20:00')
  const [secFriS2End, setSecFriS2End] = useState('07:30')
  const [secFriS2EndWin, setSecFriS2EndWin] = useState('08:00')

  // Security Schedule: Akhir Pekan (Sabtu & Minggu 2 Shift)
  const [secWkndS1Start, setSecWkndS1Start] = useState('08:00')
  const [secWkndS1WinEnd, setSecWkndS1WinEnd] = useState('08:30')
  const [secWkndS1End, setSecWkndS1End] = useState('20:00')
  const [secWkndS1EndWin, setSecWkndS1EndWin] = useState('20:30')
  const [secWkndS2Start, setSecWkndS2Start] = useState('20:00')
  const [secWkndS2WinEnd, setSecWkndS2WinEnd] = useState('20:30')
  const [secWkndS2End, setSecWkndS2End] = useState('08:00')
  const [secWkndS2EndWin, setSecWkndS2EndWin] = useState('08:30')

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sec = s.setting_value as any
            if (sec?.thursday_friday_shift_minutes != null) {
              setSecShiftOffsetMin(Number(sec.thursday_friday_shift_minutes) || 0)
            }
            if (sec?.day_groups) {
              const dg = sec.day_groups
              const m1 = dg.mon_thu?.shifts?.[0]
              const m2 = dg.mon_thu?.shifts?.[1]
              const m3 = dg.mon_thu?.shifts?.[2]
              if (m1?.in_start) setSecS1Start(m1.in_start)
              if (m1?.in_end) setSecS1WinEnd(m1.in_end)
              if (m1?.out_start) setSecS1End(m1.out_start)
              if (m1?.out_end) setSecS1EndWin(m1.out_end)

              if (m2?.in_start) setSecS2Start(m2.in_start)
              if (m2?.in_end) setSecS2WinEnd(m2.in_end)
              if (m2?.out_start) setSecS2End(m2.out_start)
              if (m2?.out_end) setSecS2EndWin(m2.out_end)

              if (m3?.in_start) setSecS3Start(m3.in_start)
              if (m3?.in_end) setSecS3WinEnd(m3.in_end)
              if (m3?.out_start) setSecS3End(m3.out_start)
              if (m3?.out_end) setSecS3EndWin(m3.out_end)

              const f1 = dg.friday?.shifts?.[0]
              const f2 = dg.friday?.shifts?.[1]
              if (f1?.in_start) setSecFriS1Start(f1.in_start)
              if (f1?.in_end) setSecFriS1WinEnd(f1.in_end)
              if (f1?.out_start) setSecFriS1End(f1.out_start)
              if (f1?.out_end) setSecFriS1EndWin(f1.out_end)

              if (f2?.in_start) setSecFriS2Start(f2.in_start)
              if (f2?.in_end) setSecFriS2WinEnd(f2.in_end)
              if (f2?.out_start) setSecFriS2End(f2.out_start)
              if (f2?.out_end) setSecFriS2EndWin(f2.out_end)

              const w1 = dg.weekend?.shifts?.[0]
              const w2 = dg.weekend?.shifts?.[1]
              if (w1?.in_start) setSecWkndS1Start(w1.in_start)
              if (w1?.in_end) setSecWkndS1WinEnd(w1.in_end)
              if (w1?.out_start) setSecWkndS1End(w1.out_start)
              if (w1?.out_end) setSecWkndS1EndWin(w1.out_end)

              if (w2?.in_start) setSecWkndS2Start(w2.in_start)
              if (w2?.in_end) setSecWkndS2WinEnd(w2.in_end)
              if (w2?.out_start) setSecWkndS2End(w2.out_start)
              if (w2?.out_end) setSecWkndS2EndWin(w2.out_end)
            } else if (sec?.shifts) {
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
            }
          } else if (s.setting_key === 'security_weekend_schedule') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wknd = s.setting_value as any
            const pagi = wknd?.sesi_pagi || wknd?.sesiPagi
            const malam = wknd?.sesi_malam || wknd?.sesiMalam
            if (pagi?.open) setSecWkndS1Start(pagi.open)
            if (pagi?.close) setSecWkndS1WinEnd(pagi.close)
            if (pagi?.out_start) setSecWkndS1End(pagi.out_start)
            if (pagi?.out_end) setSecWkndS1EndWin(pagi.out_end)
            if (malam?.open) setSecWkndS2Start(malam.open)
            if (malam?.close) setSecWkndS2WinEnd(malam.close)
            if (malam?.out_start) setSecWkndS2End(malam.out_start)
            if (malam?.out_end) setSecWkndS2EndWin(malam.out_end)
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
          day_groups: {
            mon_thu: {
              name: 'Senin – Kamis',
              days: [1, 2, 3, 4],
              shifts: [
                {
                  id: 'shift_1',
                  shift_name: 'Shift I',
                  label: 'Shift I',
                  shift_number: 1,
                  in_start: secS1Start,
                  in_end: secS1WinEnd,
                  out_start: secS1End,
                  out_end: secS1EndWin,
                  out_next_day: false,
                },
                {
                  id: 'shift_2',
                  shift_name: 'Shift II',
                  label: 'Shift II',
                  shift_number: 2,
                  in_start: secS2Start,
                  in_end: secS2WinEnd,
                  out_start: secS2End,
                  out_end: secS2EndWin,
                  out_next_day: false,
                },
                {
                  id: 'shift_3',
                  shift_name: 'Shift III',
                  label: 'Shift III',
                  shift_number: 3,
                  in_start: secS3Start,
                  in_end: secS3WinEnd,
                  out_start: secS3End,
                  out_end: secS3EndWin,
                  out_next_day: true,
                },
              ],
            },
            friday: {
              name: 'Jumat',
              days: [5],
              shifts: [
                {
                  id: 'shift_1',
                  shift_name: 'Shift I',
                  label: 'Shift I',
                  shift_number: 1,
                  in_start: secFriS1Start,
                  in_end: secFriS1WinEnd,
                  out_start: secFriS1End,
                  out_end: secFriS1EndWin,
                  out_next_day: false,
                },
                {
                  id: 'shift_2',
                  shift_name: 'Shift II',
                  label: 'Shift II',
                  shift_number: 2,
                  in_start: secFriS2Start,
                  in_end: secFriS2WinEnd,
                  out_start: secFriS2End,
                  out_end: secFriS2EndWin,
                  out_next_day: true,
                },
              ],
            },
            weekend: {
              name: 'Sabtu – Minggu',
              days: [6, 0],
              shifts: [
                {
                  id: 'shift_1',
                  shift_name: 'Shift I',
                  label: 'Shift I (Pagi)',
                  shift_number: 1,
                  in_start: secWkndS1Start,
                  in_end: secWkndS1WinEnd,
                  out_start: secWkndS1End,
                  out_end: secWkndS1EndWin,
                  out_next_day: false,
                },
                {
                  id: 'shift_2',
                  shift_name: 'Shift II',
                  label: 'Shift II (Malam)',
                  shift_number: 2,
                  in_start: secWkndS2Start,
                  in_end: secWkndS2WinEnd,
                  out_start: secWkndS2End,
                  out_end: secWkndS2EndWin,
                  out_next_day: true,
                },
              ],
            },
          },
          thursday_friday_shift_minutes: secShiftOffsetMin,
          shifts: {
            'Shift I': { start: secS1Start, window_end: secS1WinEnd, end: secS1End, end_window_end: secS1EndWin, end_next_day: false, end_window_end_next_day: false },
            'Shift II': { start: secS2Start, window_end: secS2WinEnd, end: secS2End, end_window_end: secS2EndWin, end_next_day: false, end_window_end_next_day: false },
            'Shift III': { start: secS3Start, window_end: secS3WinEnd, end: secS3End, end_window_end: secS3EndWin, end_next_day: true, end_window_end_next_day: true },
          },
        },
        description: 'Jadwal Security day-based (Senin-Kamis 3 shift, Jumat 2 shift, Sabtu-Minggu 2 shift).',
        updated_by: profile.id, updated_at: now,
      },
      {
        setting_key: 'security_weekend_schedule',
        setting_value: {
          sesi_pagi: { open: secWkndS1Start, close: secWkndS1WinEnd, out_start: secWkndS1End, out_end: secWkndS1EndWin },
          sesi_malam: { open: secWkndS2Start, close: secWkndS2WinEnd, out_start: secWkndS2End, out_end: secWkndS2EndWin },
        },
        description: 'Jadwal Security akhir pekan (Sabtu & Minggu). Shift I Pagi: 08:00–20:00, Shift II Malam: 20:00–08:00 WIB.',
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

      {/* Security Schedule - Editable Day Groups */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <Shield size={15} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                Jadwal Security — Otomatis Berdasarkan Hari (Day-Based)
              </h2>
              <p className="text-[11px] text-neutral-500">
                Senin–Kamis (3 Shift) · Jumat (2 Shift 12 Jam) · Sabtu–Minggu (2 Shift: Pagi &amp; Malam). Tersinkronisasi otomatis dengan Supabase.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Edit3 size={14} className="text-neutral-400" />
            <span className="text-[11px] font-bold text-neutral-900 bg-neutral-200/70 px-2.5 py-1 rounded">
              3 Kelompok Hari
            </span>
          </div>
        </div>

        <div className="p-5 space-y-8">
          {/* Kelompok 1: Senin – Kamis (3 Shift) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 uppercase tracking-wide">
                <Calendar size={14} className="text-blue-600" />
                <span>1. Senin – Kamis (3 Shift Rotasi 24 Jam)</span>
              </div>
              <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-bold">
                Senin – Kamis
              </span>
            </div>

            {/* Shift I */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-neutral-900">Shift I (07:00 – 16:00)</span>
                <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                  Check-In: {secS1Start}–{secS1WinEnd} • Check-Out: {secS1End}–{secS1EndWin} WIB
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-neutral-200 bg-white">
                {timeInput(secS1Start, setSecS1Start, 'Mulai Check-In')}
                {timeInput(secS1WinEnd, setSecS1WinEnd, 'Batas Check-In')}
                {timeInput(secS1End, setSecS1End, 'Mulai Check-Out')}
                {timeInput(secS1EndWin, setSecS1EndWin, 'Batas Check-Out')}
              </div>
            </div>

            {/* Shift II */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-neutral-900">Shift II (16:00 – 19:30)</span>
                <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                  Check-In: {secS2Start}–{secS2WinEnd} • Check-Out: {secS2End}–{secS2EndWin} WIB
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-neutral-200 bg-white">
                {timeInput(secS2Start, setSecS2Start, 'Mulai Check-In')}
                {timeInput(secS2WinEnd, setSecS2WinEnd, 'Batas Check-In')}
                {timeInput(secS2End, setSecS2End, 'Mulai Check-Out')}
                {timeInput(secS2EndWin, setSecS2EndWin, 'Batas Check-Out')}
              </div>
            </div>

            {/* Shift III */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-900">Shift III (19:30 – 07:00 H+1)</span>
                  <span className="text-[10px] bg-neutral-900 text-white font-mono px-1.5 py-0.5 rounded font-bold">Lintas Hari (Besok)</span>
                </div>
                <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                  Check-In: {secS3Start}–{secS3WinEnd} • Check-Out: {secS3End}–{secS3EndWin} WIB
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-neutral-200 bg-neutral-50/50">
                {timeInput(secS3Start, setSecS3Start, 'Mulai Check-In')}
                {timeInput(secS3WinEnd, setSecS3WinEnd, 'Batas Check-In')}
                {timeInput(secS3End, setSecS3End, 'Mulai Check-Out (H+1)')}
                {timeInput(secS3EndWin, setSecS3EndWin, 'Batas Check-Out (H+1)')}
              </div>
            </div>
          </div>

          {/* Kelompok 2: Jumat (2 Shift) */}
          <div className="pt-6 border-t border-neutral-200 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 uppercase tracking-wide">
                <Calendar size={14} className="text-emerald-600" />
                <span>2. Jumat (2 Shift Khusus 12 Jam)</span>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                Jumat
              </span>
            </div>

            {/* Shift I Jumat */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-neutral-900">Shift I (07:30 – 19:30)</span>
                <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                  Check-In: {secFriS1Start}–{secFriS1WinEnd} • Check-Out: {secFriS1End}–{secFriS1EndWin} WIB
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-neutral-200 bg-white">
                {timeInput(secFriS1Start, setSecFriS1Start, 'Mulai Check-In')}
                {timeInput(secFriS1WinEnd, setSecFriS1WinEnd, 'Batas Check-In')}
                {timeInput(secFriS1End, setSecFriS1End, 'Mulai Check-Out')}
                {timeInput(secFriS1EndWin, setSecFriS1EndWin, 'Batas Check-Out')}
              </div>
            </div>

            {/* Shift II Jumat */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-900">Shift II (19:30 – 07:30 H+1)</span>
                  <span className="text-[10px] bg-neutral-900 text-white font-mono px-1.5 py-0.5 rounded font-bold">Lintas Hari (Besok)</span>
                </div>
                <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                  Check-In: {secFriS2Start}–{secFriS2WinEnd} • Check-Out: {secFriS2End}–{secFriS2EndWin} WIB
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-neutral-200 bg-neutral-50/50">
                {timeInput(secFriS2Start, setSecFriS2Start, 'Mulai Check-In')}
                {timeInput(secFriS2WinEnd, setSecFriS2WinEnd, 'Batas Check-In')}
                {timeInput(secFriS2End, setSecFriS2End, 'Mulai Check-Out (H+1)')}
                {timeInput(secFriS2EndWin, setSecFriS2EndWin, 'Batas Check-Out (H+1)')}
              </div>
            </div>
          </div>

          {/* Kelompok 3: Sabtu – Minggu (2 Shift: Pagi & Malam) */}
          <div className="pt-6 border-t border-neutral-200 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 uppercase tracking-wide">
                  <Calendar size={14} className="text-amber-600" />
                  <span>3. Sabtu – Minggu (2 Shift Akhir Pekan)</span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Shift I dilabeli Pagi (08:00–20:00) dan Shift II dilabeli Malam (20:00–08:00 H+1).
                </p>
              </div>
              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full font-bold">
                Sabtu – Minggu
              </span>
            </div>

            {/* Shift I Weekend (Pagi) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-neutral-900">Shift I — Pagi (08:00 – 20:00)</span>
                <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                  Check-In: {secWkndS1Start}–{secWkndS1WinEnd} • Check-Out: {secWkndS1End}–{secWkndS1EndWin} WIB
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-neutral-200 bg-white">
                {timeInput(secWkndS1Start, setSecWkndS1Start, 'Mulai Check-In')}
                {timeInput(secWkndS1WinEnd, setSecWkndS1WinEnd, 'Batas Check-In')}
                {timeInput(secWkndS1End, setSecWkndS1End, 'Mulai Check-Out')}
                {timeInput(secWkndS1EndWin, setSecWkndS1EndWin, 'Batas Check-Out')}
              </div>
            </div>

            {/* Shift II Weekend (Malam) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-900">Shift II — Malam (20:00 – 08:00 H+1)</span>
                  <span className="text-[10px] bg-neutral-900 text-white font-mono px-1.5 py-0.5 rounded font-bold">Lintas Hari (Besok)</span>
                </div>
                <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                  Check-In: {secWkndS2Start}–{secWkndS2WinEnd} • Check-Out: {secWkndS2End}–{secWkndS2EndWin} WIB
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-neutral-200 bg-neutral-50/50">
                {timeInput(secWkndS2Start, setSecWkndS2Start, 'Mulai Check-In')}
                {timeInput(secWkndS2WinEnd, setSecWkndS2WinEnd, 'Batas Check-In')}
                {timeInput(secWkndS2End, setSecWkndS2End, 'Mulai Check-Out (H+1)')}
                {timeInput(secWkndS2EndWin, setSecWkndS2EndWin, 'Batas Check-Out (H+1)')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
