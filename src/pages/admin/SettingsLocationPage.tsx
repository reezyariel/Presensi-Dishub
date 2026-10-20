// ============================================================
// ShiftTrack — Pengaturan Lokasi Kantor & Manajemen Preset Geofence
// Desktop-Optimized 2-Column Split Console
// Full Admin Preset Management: Add, Edit, Delete, Select, Save, Activate
// 100% Real Supabase DB & RPC integration (No hardcoded preset overrides)
// ============================================================

import { useEffect, useState } from 'react'
import {
  Save, CheckCircle2, RefreshCw, MapPin,
  Sliders, Plus, Edit2, Trash2, Check,
  AlertCircle, X
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import LocationPickerMap from '../../components/admin/LocationPickerMap'
import { getActiveOfficeLocation } from '../../lib/officeLocation'
import type { LocationPreset } from '../../types/attendance'

export default function SettingsLocationPage() {
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Current Form Values
  const [officeLat, setOfficeLat] = useState<number>(-6.175392)
  const [officeLng, setOfficeLng] = useState<number>(106.827153)
  const [officeRadius, setOfficeRadius] = useState<number>(100)
  const [officeName, setOfficeName] = useState<string>('Kantor Pusat ShiftTrack')
  const [officeAddress, setOfficeAddress] = useState<string>('')
  const [activePresetId, setActivePresetId] = useState<string | null>(null)

  // Database Presets
  const [presets, setPresets] = useState<LocationPreset[]>([])
  const [isLoadingPresets, setIsLoadingPresets] = useState(true)

  // Modal States for Presets
  const [isAddPresetModalOpen, setIsAddPresetModalOpen] = useState(false)
  const [presetModalMode, setPresetModalMode] = useState<'create' | 'edit'>('create')
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [presetFormName, setPresetFormName] = useState('')
  const [presetFormAddress, setPresetFormAddress] = useState('')
  const [presetFormLat, setPresetFormLat] = useState<number>(-6.175392)
  const [presetFormLng, setPresetFormLng] = useState<number>(106.827153)
  const [presetFormRadius, setPresetFormRadius] = useState<number>(100)
  const [isSavingPreset, setIsSavingPreset] = useState(false)
  const [presetModalError, setPresetModalError] = useState<string | null>(null)

  // Delete Confirmation Modal
  const [deletePresetTarget, setDeletePresetTarget] = useState<LocationPreset | null>(null)
  const [isDeletingPreset, setIsDeletingPreset] = useState(false)

  useEffect(() => {
    loadActiveSettingsAndPresets()
  }, [])

  async function loadActiveSettingsAndPresets() {
    setIsLoadingPresets(true)
    try {
      // 1. Load Presets from database
      const { data: dbPresets, error: pErr } = await supabase
        .from('location_presets')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true })

      if (!pErr && dbPresets) {
        setPresets(dbPresets as LocationPreset[])
      }

      // 2. Load Active Office Configuration from attendance_settings
      const activeRes = await getActiveOfficeLocation(supabase)
      if (activeRes.config) {
        setOfficeLat(activeRes.config.latitude)
        setOfficeLng(activeRes.config.longitude)
        setOfficeRadius(activeRes.config.radiusMeters)
        setOfficeName(activeRes.config.name)
        setOfficeAddress(activeRes.config.address || '')
        setActivePresetId(activeRes.config.presetId || null)
      } else if (dbPresets && dbPresets.length > 0) {
        const active = dbPresets.find(p => p.is_active) || dbPresets[0]
        setOfficeLat(active.latitude)
        setOfficeLng(active.longitude)
        setOfficeRadius(active.radius_meters)
        setOfficeName(active.name)
        setOfficeAddress(active.address || '')
        setActivePresetId(active.is_active ? active.id : null)
      }
    } catch (err) {
      console.warn('Error loading location settings:', err)
    } finally {
      setIsLoadingPresets(false)
    }
  }

  // Save current form as the ACTIVE office location
  async function handleSaveActiveLocation() {
    if (!officeName.trim()) {
      setFeedback({ type: 'error', message: 'Nama lokasi kantor wajib diisi.' })
      return
    }

    setIsSaving(true)
    setFeedback(null)

    try {
      // Call secure RPC admin_set_active_location
      const { error } = await supabase.rpc('admin_set_active_location', {
        p_preset_id: activePresetId,
        p_latitude: officeLat,
        p_longitude: officeLng,
        p_radius_meters: officeRadius,
        p_name: officeName.trim(),
        p_address: officeAddress.trim() || null,
      })

      if (error) {
        // Fallback to direct upsert if RPC fails
        await supabase.from('attendance_settings').upsert({
          setting_key: 'office_coordinates',
          setting_value: {
            latitude: officeLat,
            longitude: officeLng,
            name: officeName.trim(),
            address: officeAddress.trim(),
            preset_id: activePresetId,
          },
          description: 'Koordinat titik kantor aktif untuk validasi geofence GPS presensi',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'setting_key' })

        await supabase.from('attendance_settings').upsert({
          setting_key: 'office_radius_meters',
          setting_value: officeRadius,
          description: 'Radius toleransi geofence presensi kantor dalam meter (50-1000m)',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'setting_key' })
      }

      setFeedback({
        type: 'success',
        message: `Lokasi "${officeName}" berhasil ditetapkan sebagai Titik Presensi Aktif di seluruh sistem.`,
      })
      setTimeout(() => setFeedback(null), 5000)

      // Reload presets to update active indicators
      await loadActiveSettingsAndPresets()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan pengaturan lokasi kantor.'
      setFeedback({ type: 'error', message: msg })
    } finally {
      setIsSaving(false)
    }
  }

  // Apply a preset to form without saving as active yet
  const handleSelectPresetToForm = (preset: LocationPreset) => {
    setOfficeName(preset.name)
    setOfficeAddress(preset.address || '')
    setOfficeLat(preset.latitude)
    setOfficeLng(preset.longitude)
    setOfficeRadius(preset.radius_meters)
    setActivePresetId(preset.id)
    setFeedback({
      type: 'success',
      message: `Preset "${preset.name}" dipilih ke formulir. Klik "Tetapkan sebagai Lokasi Aktif" untuk mengaktifkan pada absensi.`,
    })
    setTimeout(() => setFeedback(null), 4000)
  }

  // Open modal to create preset from scratch or from current form values
  const handleOpenCreatePresetModal = (fromForm = false) => {
    setPresetModalMode('create')
    setEditingPresetId(null)
    setPresetModalError(null)

    if (fromForm) {
      setPresetFormName(officeName)
      setPresetFormAddress(officeAddress)
      setPresetFormLat(officeLat)
      setPresetFormLng(officeLng)
      setPresetFormRadius(officeRadius)
    } else {
      setPresetFormName('')
      setPresetFormAddress('')
      setPresetFormLat(officeLat)
      setPresetFormLng(officeLng)
      setPresetFormRadius(100)
    }
    setIsAddPresetModalOpen(true)
  }

  // Open modal to edit an existing preset
  const handleOpenEditPresetModal = (preset: LocationPreset) => {
    setPresetModalMode('edit')
    setEditingPresetId(preset.id)
    setPresetModalError(null)
    setPresetFormName(preset.name)
    setPresetFormAddress(preset.address || '')
    setPresetFormLat(preset.latitude)
    setPresetFormLng(preset.longitude)
    setPresetFormRadius(preset.radius_meters)
    setIsAddPresetModalOpen(true)
  }

  // Save or update preset in location_presets table
  const handleSavePresetModal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!presetFormName.trim()) {
      setPresetModalError('Nama preset lokasi wajib diisi.')
      return
    }

    setIsSavingPreset(true)
    setPresetModalError(null)

    try {
      if (presetModalMode === 'edit' && editingPresetId) {
        // Update existing preset
        const { error } = await supabase
          .from('location_presets')
          .update({
            name: presetFormName.trim(),
            address: presetFormAddress.trim() || null,
            latitude: presetFormLat,
            longitude: presetFormLng,
            radius_meters: presetFormRadius,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPresetId)

        if (error) throw error

        // If the edited preset was active, update active settings as well
        if (activePresetId === editingPresetId) {
          await supabase.rpc('admin_set_active_location', {
            p_preset_id: editingPresetId,
            p_latitude: presetFormLat,
            p_longitude: presetFormLng,
            p_radius_meters: presetFormRadius,
            p_name: presetFormName.trim(),
            p_address: presetFormAddress.trim() || null,
          })
        }
      } else {
        // Create new preset
        const { error } = await supabase
          .from('location_presets')
          .insert({
            name: presetFormName.trim(),
            address: presetFormAddress.trim() || null,
            latitude: presetFormLat,
            longitude: presetFormLng,
            radius_meters: presetFormRadius,
            is_active: false,
          })

        if (error) throw error
      }

      setIsAddPresetModalOpen(false)
      setFeedback({
        type: 'success',
        message: `Preset lokasi "${presetFormName}" berhasil disimpan ke database.`,
      })
      setTimeout(() => setFeedback(null), 4000)
      await loadActiveSettingsAndPresets()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan preset lokasi.'
      setPresetModalError(msg)
    } finally {
      setIsSavingPreset(false)
    }
  }

  // Delete preset
  const handleDeletePresetConfirm = async () => {
    if (!deletePresetTarget) return

    if (deletePresetTarget.is_active || activePresetId === deletePresetTarget.id) {
      setFeedback({
        type: 'error',
        message: 'Preset ini sedang aktif digunakan untuk absensi kantor. Silakan tetapkan preset lain sebagai lokasi aktif terlebih dahulu sebelum menghapus.',
      })
      setDeletePresetTarget(null)
      return
    }

    setIsDeletingPreset(true)
    try {
      const { error } = await supabase
        .from('location_presets')
        .delete()
        .eq('id', deletePresetTarget.id)

      if (error) throw error

      setFeedback({
        type: 'success',
        message: `Preset lokasi "${deletePresetTarget.name}" berhasil dihapus.`,
      })
      setTimeout(() => setFeedback(null), 4000)
      setDeletePresetTarget(null)
      await loadActiveSettingsAndPresets()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus preset lokasi.'
      setFeedback({ type: 'error', message: msg })
    } finally {
      setIsDeletingPreset(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* ─── Top Header Card ─── */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <span>Sistem &amp; Konfigurasi</span>
            <span>/</span>
            <span className="text-neutral-900">Peta Lokasi Kantor</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight mt-1">
            Pengaturan Geofence &amp; Lokasi Presensi
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Kelola koordinat acuan kantor, radius toleransi GPS, dan preset lokasi siap pakai untuk CS dan Security.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleOpenCreatePresetModal(true)}
            className="px-3.5 py-2.5 bg-white hover:bg-neutral-100 text-neutral-800 rounded-lg text-xs font-semibold flex items-center gap-2 border border-neutral-200 transition-colors shadow-xs"
          >
            <Plus size={14} />
            <span>Simpan sbg Preset Baru</span>
          </button>

          <button
            onClick={handleSaveActiveLocation}
            disabled={isSaving}
            className="px-4 py-2.5 bg-neutral-900 hover:bg-black text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-xs flex-shrink-0"
          >
            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            <span>{isSaving ? 'Menyimpan...' : 'Tetapkan sebagai Lokasi Aktif'}</span>
          </button>
        </div>
      </div>

      {/* ─── Notification Banner ─── */}
      {feedback && (
        <div
          className={`p-4 rounded-xl shadow-xs flex items-center justify-between gap-3 text-xs font-medium animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-100 border border-neutral-300 text-neutral-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 size={18} className="text-white flex-shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-neutral-900 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs underline hover:opacity-80 flex-shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* ─── 2-Column Desktop Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Controls & Presets List (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Active Configuration Form */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-2">
                <MapPin size={15} />
                Formulir Titik Kantor
              </h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-800">
                Radius {officeRadius}m
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-neutral-800">
                  Nama Titik Kantor / Proyek
                </label>
                <input
                  type="text"
                  value={officeName}
                  onChange={(e) => setOfficeName(e.target.value)}
                  placeholder="Misal: Kantor Pusat ShiftTrack"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-800">
                  Alamat Lengkap Kantor
                </label>
                <textarea
                  value={officeAddress}
                  onChange={(e) => setOfficeAddress(e.target.value)}
                  rows={2}
                  placeholder="Alamat kantor resmi untuk panduan staf lapangan"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800">
                    Latitude (Lintang)
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={officeLat}
                    onChange={(e) => setOfficeLat(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800">
                    Longitude (Bujur)
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={officeLng}
                    onChange={(e) => setOfficeLng(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>
              </div>

              {/* Radius Setting */}
              <div className="pt-2 border-t border-neutral-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-neutral-800 flex items-center gap-1.5">
                    <Sliders size={14} />
                    Radius Toleransi Geofence
                  </label>
                  <span className="font-mono text-xs font-bold text-neutral-900 bg-neutral-100 px-2.5 py-0.5 rounded border border-neutral-200">
                    {officeRadius} meter
                  </span>
                </div>

                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="25"
                  value={officeRadius}
                  onChange={(e) => setOfficeRadius(parseInt(e.target.value, 10))}
                  className="w-full accent-neutral-900 cursor-pointer"
                />

                <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                  <span>50m (Ketat)</span>
                  <span>250m (Normal)</span>
                  <span>1000m (Longgar)</span>
                </div>

                {/* Quick Radius Pills */}
                <div className="flex items-center gap-1.5 pt-1">
                  {[50, 100, 200, 500].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setOfficeRadius(r)}
                      className={`flex-1 py-1 text-[11px] font-mono rounded border transition-colors ${
                        officeRadius === r
                          ? 'bg-neutral-900 text-white border-neutral-900 font-bold'
                          : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                      }`}
                    >
                      {r}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Preset Locations Management Card */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Preset Lokasi Tersimpan ({presets.length})
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Dikelola penuh oleh Admin di database Supabase
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleOpenCreatePresetModal(false)}
                className="px-2.5 py-1.5 bg-neutral-900 hover:bg-black text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Plus size={13} />
                <span>Tambah Preset</span>
              </button>
            </div>

            {isLoadingPresets ? (
              <div className="py-8 flex flex-col items-center justify-center text-center">
                <div className="w-5 h-5 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mb-2" />
                <span className="text-xs text-neutral-400">Memuat preset lokasi...</span>
              </div>
            ) : presets.length === 0 ? (
              <div className="py-8 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-300 p-6 space-y-3">
                <MapPin size={28} className="text-neutral-300 mx-auto" />
                <div>
                  <p className="text-xs font-bold text-neutral-800">Belum ada preset lokasi tersimpan</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Tambahkan preset lokasi kantor atau proyek baru untuk digunakan kembali kapan saja.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCreatePresetModal(false)}
                  className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-black"
                >
                  Tambah Preset Lokasi
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-0.5">
                {presets.map((preset) => {
                  const isActive = preset.is_active || activePresetId === preset.id
                  return (
                    <div
                      key={preset.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isActive
                          ? 'border-neutral-900 bg-neutral-50/80 ring-1 ring-neutral-900/10'
                          : 'border-neutral-200 bg-white hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-neutral-900">
                              {preset.name}
                            </span>
                            {isActive && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-white">
                                <Check size={10} strokeWidth={3} />
                                <span>Aktif Digunakan</span>
                              </span>
                            )}
                          </div>
                          {preset.address && (
                            <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-1">
                              {preset.address}
                            </p>
                          )}
                          <p className="text-[10px] font-mono text-neutral-400 mt-1">
                            GPS: {preset.latitude.toFixed(5)}, {preset.longitude.toFixed(5)} • Radius: {preset.radius_meters}m
                          </p>
                        </div>

                        {/* Action Buttons for this Preset */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSelectPresetToForm(preset)}
                            className="px-2 py-1 bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-800 text-[11px] font-semibold rounded-md transition-colors"
                            title="Terapkan preset ke formulir"
                          >
                            Pilih
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditPresetModal(preset)}
                            className="p-1 hover:bg-neutral-100 text-neutral-600 rounded-md transition-colors"
                            title="Edit preset"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletePresetTarget(preset)}
                            className="p-1 hover:bg-red-50 text-neutral-400 hover:text-red-600 rounded-md transition-colors"
                            title="Hapus preset"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Full GIS Interactive Map (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
            <div>
              <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-2">
                <MapPin size={15} />
                Peta Geofence Interaktif
              </h2>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Klik pada peta atau geser pin marker untuk memperbarui koordinat secara visual.
              </p>
            </div>
            <div className="text-right">
              <span className="font-mono text-xs font-bold text-neutral-900">
                {officeLat.toFixed(5)}, {officeLng.toFixed(5)}
              </span>
              <p className="text-[10px] text-neutral-400">WGS84 Desimal</p>
            </div>
          </div>

          <div className="relative w-full h-[540px]">
            <LocationPickerMap
              latitude={officeLat}
              longitude={officeLng}
              radiusMeters={officeRadius}
              officeName={officeName}
              onChangeLocation={(lat: number, lng: number) => {
                setOfficeLat(lat)
                setOfficeLng(lng)
              }}
            />
          </div>

          <div className="p-3.5 bg-neutral-50 border-t border-neutral-100 text-[11px] text-neutral-500 flex items-center justify-between">
            <span>Radius lingkaran menunjukkan batas geofence yang diterima server.</span>
            <span className="font-mono text-neutral-700 font-semibold">{officeRadius}m</span>
          </div>
        </div>
      </div>

      {/* ─── Add / Edit Preset Modal ─── */}
      {isAddPresetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl p-5 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <h3 className="text-sm font-bold text-neutral-900">
                {presetModalMode === 'create' ? 'Tambah Preset Lokasi Baru' : 'Edit Preset Lokasi'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddPresetModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X size={18} />
              </button>
            </div>

            {presetModalError && (
              <div className="p-3 rounded-xl bg-neutral-100 border border-neutral-300 text-xs text-neutral-900 flex items-center gap-2">
                <AlertCircle size={15} className="flex-shrink-0" />
                <span>{presetModalError}</span>
              </div>
            )}

            <form onSubmit={handleSavePresetModal} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-neutral-800">
                  Nama Preset Lokasi <span className="text-neutral-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={presetFormName}
                  onChange={e => setPresetFormName(e.target.value)}
                  placeholder="Contoh: Kantor Cabang Sudirman"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-800">Alamat Lengkap</label>
                <textarea
                  value={presetFormAddress}
                  onChange={e => setPresetFormAddress(e.target.value)}
                  rows={2}
                  placeholder="Alamat fisik untuk informasi staf"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-neutral-900 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={presetFormLat}
                    onChange={e => setPresetFormLat(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={presetFormLng}
                    onChange={e => setPresetFormLng(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-neutral-800">
                  Radius Geofence (Meter)
                </label>
                <input
                  type="number"
                  min="50"
                  max="1000"
                  step="25"
                  required
                  value={presetFormRadius}
                  onChange={e => setPresetFormRadius(parseInt(e.target.value, 10) || 100)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              <div className="flex items-center gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddPresetModalOpen(false)}
                  className="flex-1 py-2.5 bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-semibold rounded-xl border border-neutral-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingPreset}
                  className="flex-1 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5"
                >
                  {isSavingPreset && <RefreshCw size={13} className="animate-spin" />}
                  <span>{presetModalMode === 'create' ? 'Simpan Preset' : 'Perbarui Preset'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      {deletePresetTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Hapus Preset Lokasi?</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Preset &quot;{deletePresetTarget.name}&quot; akan dihapus dari daftar preset. Data absensi historis tetap aman.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletePresetTarget(null)}
                className="flex-1 py-2 bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-semibold rounded-xl border border-neutral-200 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeletePresetConfirm}
                disabled={isDeletingPreset}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                {isDeletingPreset && <RefreshCw size={13} className="animate-spin" />}
                <span>Ya, Hapus</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
