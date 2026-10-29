// ============================================================
// SIPATEN — TakeAttendanceModal Component
// Cross-device Camera Attendance Modal for CS & Security
// Live Video Preview, Snapshot, Confirm Photo, Geofence GPS
// ============================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Camera, MapPin, Check, AlertCircle, Clock,
  RefreshCw, RotateCcw, SwitchCamera,
  CheckCircle2, Image as ImageIcon
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCamera } from '../../hooks/useCamera'
import { useGeolocation } from '../../hooks/useGeolocation'
import {
  getActiveOfficeLocation,
  formatDistance,
  DEFAULT_OFFICE_CONFIG,
  type OfficeLocationConfig
} from '../../lib/officeLocation'
import { supabase } from '../../lib/supabase'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { formatJakartaTime, getScheduleInfo, todayJakarta, getCSScheduleSync, checkAttendanceWindow } from '../../lib/scheduleEngine'
import type { AttendanceRecord, AttendanceType, SecurityShiftOption } from '../../types/attendance'

interface TakeAttendanceModalProps {
  category: 'CS' | 'Security'
  attendanceType: AttendanceType
  shift?: SecurityShiftOption
  onClose: () => void
  onSuccess?: () => void
}

type ModalStep = 'initial' | 'camera' | 'form' | 'submitting' | 'result'

export default function TakeAttendanceModal({
  category,
  attendanceType,
  shift,
  onClose,
  onSuccess,
}: TakeAttendanceModalProps) {
  const navigate = useNavigate()
  const { profile, employeeProfile } = useAuth()
  const today = todayJakarta()

  const [step, setStep] = useState<ModalStep>('initial')
  const [officeConfig, setOfficeConfig] = useState<OfficeLocationConfig>(DEFAULT_OFFICE_CONFIG)

  // Geolocation hook
  const {
    coords,
    isLoading: isGpsLoading,
    distanceMeters,
    isInsideRadius,
    requestLocation,
  } = useGeolocation(officeConfig)

  // Camera hook
  const {
    stream,
    photo,
    error: cameraError,
    isLoading: isCameraLoading,
    isActive: isCameraActive,
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
    reset: resetCamera,
  } = useCamera()

  // Form states
  const [confirmedPhoto, setConfirmedPhoto] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [serverRequiresReason, setServerRequiresReason] = useState(false)
  const [idempotencyKey] = useState(() => `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`)
  const [resultRecord, setResultRecord] = useState<AttendanceRecord | null>(null)
  const [locationLoadError, setLocationLoadError] = useState<string | null>(null)

  // Load active office config from database
  useEffect(() => {
    getActiveOfficeLocation(supabase).then(res => {
      if (res.error) {
        setLocationLoadError(res.error)
      } else if (res.config) {
        setOfficeConfig(res.config)
        setLocationLoadError(null)
      }
    })
    requestLocation()
  }, [requestLocation])

  // Stop camera when unmounting or closing
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  const employeeName = employeeProfile?.full_name || profile?.full_name || 'Pegawai'

  // Schedule Info
  const scheduleDisplay = useMemo(() => {
    if (category === 'CS') {
      const cs = getCSScheduleSync()
      const fmt = (s: string, e: string) => `${s.replace(':', '.')} – ${e.replace(':', '.')} WIB`
      return {
        masuk: fmt(cs.masuk.open, cs.masuk.ontime_deadline),
        istirahat: fmt(cs.istirahat.start, cs.istirahat.end),
        pulang: fmt(cs.pulang.start, cs.pulang.end),
      }
    } else {
      const sched = getScheduleInfo('Security', attendanceType, shift ?? null, today)
      const schedEnd = getScheduleInfo('Security', 'pulang', shift ?? null, today)
      return {
        masuk: sched ? `${sched.scheduledStart.replace(':', '.')} WIB` : '07.00 WIB',
        istirahat: 'Shift Kerja Berlanjut',
        pulang: schedEnd ? `${schedEnd.scheduledStart.replace(':', '.')}${schedEnd.isNextDay ? ' (H+1)' : ''} WIB` : '16.00 WIB',
      }
    }
  }, [category, shift, today, attendanceType])

  // Attendance window status check
  const windowStatus = useMemo(() => {
    return checkAttendanceWindow(category, attendanceType, shift ?? null, today, new Date())
  }, [category, attendanceType, shift, today])
  const isWindowNotYet = windowStatus === 'not_yet'

  // Geofence reason requirement
  const isOutsideGeofence = isInsideRadius === false
  const isGpsMissing = !coords && !isGpsLoading
  const requiresReason = isOutsideGeofence || isGpsMissing || serverRequiresReason

  // Open camera step and start video stream
  const handleOpenLiveCamera = async () => {
    if (isWindowNotYet) {
      setSubmitError(
        `Presensi ${attendanceType} ${shift ? `${shift} ` : ''}belum dibuka. Jendela presensi dimulai pukul ${
          scheduleDisplay[attendanceType] || 'jadwal resmi'
        } WIB.`
      )
      return
    }
    setSubmitError(null)
    setStep('camera')
    await startCamera('user')
  }

  // Snap photo from live video
  const handleSnapPhoto = () => {
    const dataUrl = capturePhoto()
    if (!dataUrl) {
      setSubmitError('Gagal mengambil foto. Pastikan kamera telah menyala dan wajah terlihat jelas.')
    } else {
      setSubmitError(null)
    }
  }

  // Confirm photo: user clicks "Gunakan Foto"
  const handleConfirmPhoto = () => {
    if (!photo) return
    setConfirmedPhoto(photo)
    stopCamera()
    setStep('form')
  }

  // Retake photo: user clicks "Ulangi Foto"
  const handleRetakePhoto = () => {
    retakePhoto()
  }

  // Re-open camera from form: user wants to change photo
  const handleChangePhotoFromForm = async () => {
    setConfirmedPhoto(null)
    setSubmitError(null)
    setStep('camera')
    await startCamera(facingMode)
  }

  // Handle final attendance submission
  const handleSubmitAttendance = async () => {
    const photoToUpload = confirmedPhoto || photo
    if (!photoToUpload) {
      setSubmitError('Foto selfie wajib dilampirkan sebelum mengirim presensi.')
      setStep('camera')
      return
    }

    if (isWindowNotYet) {
      setSubmitError(
        `Presensi ${attendanceType} ${shift ? `${shift} ` : ''}belum dibuka. Jendela presensi dimulai pukul ${
          scheduleDisplay[attendanceType] || 'jadwal resmi'
        } WIB.`
      )
      return
    }

    if (requiresReason && (!reason || reason.trim().length < 5)) {
      setSubmitError('Presensi di luar radius kantor wajib menyertakan alasan resmi (minimal 5 karakter).')
      return
    }

    setSubmitError(null)
    setStep('submitting')

    try {
      const payload = {
        employee_name: employeeName,
        category,
        attendance_type: attendanceType,
        shift: category === 'Security' ? shift : null,
        selfie_base64: photoToUpload,
        idempotency_key: idempotencyKey,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        location_accuracy: coords?.accuracy ?? null,
        distance_meters: distanceMeters !== null && distanceMeters !== Infinity ? distanceMeters : null,
        reason: reason.trim() || undefined,
      }

      const { data, error: fnError } = await supabase.functions.invoke('submit-attendance', {
        body: payload,
      })

      // In Supabase JS v2, non-2xx responses throw FunctionsHttpError and data is null.
      // The real error JSON is inside error.context (the raw Response object).
      if (fnError) {
        if (fnError instanceof FunctionsHttpError) {
          try {
            const errBody = await fnError.context.json() as { error?: string; requires_reason?: boolean }
            if (errBody?.requires_reason) {
              setServerRequiresReason(true)
              setSubmitError(errBody.error || 'Harap sertakan alasan untuk melanjutkan.')
              setStep('form')
              return
            }
            if (errBody?.error) {
              throw new Error(errBody.error)
            }
          } catch (parseErr) {
            // If the error we caught is already the Error we threw above, rethrow it
            if (parseErr instanceof Error && parseErr !== fnError) throw parseErr
          }
        }
        throw new Error(fnError.message || 'Gagal menghubungi server verifikasi presensi.')
      }

      if (data?.error) {
        if (data.requires_reason) {
          setSubmitError(data.error)
          setStep('form')
          return
        }
        throw new Error(data.error)
      }

      if (data?.success && data?.data) {
        const saved = data.data as AttendanceRecord
        setResultRecord(saved)
        stopCamera()
        setStep('result')
      } else {
        throw new Error('Respons verifikasi presensi tidak valid dari server.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala saat memproses presensi.'
      setSubmitError(msg)
      setStep('form')
    }
  }

  const titleText =
    attendanceType === 'masuk'
      ? 'Presensi Masuk'
      : attendanceType === 'istirahat'
        ? 'Presensi Istirahat'
        : 'Presensi Pulang'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-3xl border border-neutral-200 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto relative animate-fade-in">
        {/* Hidden Canvas for Camera Capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* 1. Header Bar */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between sticky top-0 bg-white z-20">
          <button
            onClick={() => {
              stopCamera()
              resetCamera()
              onClose()
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 hover:text-black transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Kembali</span>
          </button>

          <h2 className="text-sm font-bold text-neutral-900">{titleText}</h2>

          <div className="w-6" />
        </div>

        {/* Submit / Validation Error Alert */}
        {submitError && (
          <div className="m-4 p-3.5 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-900 text-xs flex items-start gap-2.5 animate-fade-in">
            <AlertCircle size={16} className="text-neutral-900 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-neutral-900">Perhatian</p>
              <p className="text-neutral-700 leading-relaxed mt-0.5">{submitError}</p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP A: INITIAL VIEW (Review Schedule & GPS Status)         */}
        {/* ============================================================ */}
        {step === 'initial' && (
          <div className="p-5 flex-1 flex flex-col justify-between space-y-6">
            {/* Card Jadwal Hari Ini */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Jadwal {category} Hari Ini
                </h3>
                {category === 'Security' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-neutral-900 text-white rounded-full">
                    {shift}
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-neutral-600">
                  <span>Jendela Masuk</span>
                  <span className="font-semibold text-neutral-900 font-mono">
                    {scheduleDisplay.masuk}
                  </span>
                </div>
                <div className="flex items-center justify-between text-neutral-600">
                  <span>Istirahat</span>
                  <span className="font-semibold text-neutral-900 font-mono">
                    {scheduleDisplay.istirahat}
                  </span>
                </div>
                <div className="flex items-center justify-between text-neutral-600">
                  <span>Jendela Pulang</span>
                  <span className="font-semibold text-neutral-900 font-mono">
                    {scheduleDisplay.pulang}
                  </span>
                </div>
              </div>
            </div>

            {/* Early Attendance Window Warning Banner */}
            {isWindowNotYet && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5 animate-fade-in">
                <Clock size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-amber-900">
                    Jendela Presensi {attendanceType === 'masuk' ? 'Masuk' : attendanceType === 'pulang' ? 'Pulang' : 'Istirahat'} Belum Dibuka
                  </p>
                  <p className="text-amber-800 mt-0.5 leading-relaxed">
                    {category === 'Security'
                      ? `Waktu presensi untuk ${shift || 'shift ini'} belum dimulai. Presensi ${attendanceType} dapat dilakukan mulai pukul ${scheduleDisplay[attendanceType]} WIB.`
                      : `Waktu presensi ${attendanceType} Cleaning Service belum dimulai. Tombol akan aktif otomatis saat jadwal dibuka.`}
                  </p>
                </div>
              </div>
            )}

            {/* Location Unconfigured Alert */}
            {locationLoadError && (
              <div className="p-3.5 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-800 text-xs flex items-start gap-2.5">
                <AlertCircle size={16} className="text-neutral-900 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900">Perhatian Lokasi Kantor</p>
                  <p className="text-neutral-700 mt-0.5 leading-relaxed">{locationLoadError}</p>
                </div>
              </div>
            )}

            {/* Live GPS Status Pill */}
            <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
                  <MapPin size={15} />
                </div>
                <div>
                  <p className="font-bold text-neutral-900">
                    {!officeConfig.isConfigured ? (
                      'Lokasi Kantor Belum Dikonfigurasi'
                    ) : coords ? (
                      isInsideRadius
                        ? 'Dalam Radius Kantor'
                        : `Di Luar Radius Kantor (${formatDistance(distanceMeters)})`
                    ) : (
                      'Mendeteksi Posisi GPS...'
                    )}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {!officeConfig.isConfigured
                      ? 'Admin belum menetapkan koordinat kantor aktif'
                      : coords
                        ? `Akurasi: ±${Math.round(coords.accuracy)}m • Titik: ${officeConfig.name} (${officeConfig.radiusMeters}m)`
                        : 'Pastikan izin lokasi browser telah diaktifkan'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => requestLocation()}
                className="p-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-200 text-neutral-700 transition-colors"
                title="Perbarui Sinyal GPS"
              >
                <RefreshCw size={14} className={isGpsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Central Camera Circular Trigger */}
            <div className="flex flex-col items-center text-center py-6 space-y-4">
              {isWindowNotYet ? (
                <>
                  <div
                    className="w-24 h-24 rounded-full bg-neutral-100 border border-neutral-300 text-neutral-400 flex items-center justify-center shadow-inner cursor-not-allowed"
                    title="Jendela Presensi Belum Dibuka"
                  >
                    <Clock size={38} strokeWidth={1.8} />
                  </div>

                  <div className="space-y-1">
                    <p className="text-base font-bold text-neutral-700">
                      Presensi Belum Dibuka
                    </p>
                    <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                      Tombol kamera dinonaktifkan di luar jadwal resmi. Presensi dapat dilakukan mulai pukul {scheduleDisplay[attendanceType]} WIB.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleOpenLiveCamera}
                    className="w-24 h-24 rounded-full bg-neutral-900 hover:bg-black text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 group"
                    aria-label="Ambil Foto Selfie & Absen"
                  >
                    <Camera size={38} strokeWidth={2} />
                  </button>

                  <div className="space-y-1">
                    <p className="text-base font-bold text-neutral-900">
                      Buka Kamera & Ambil Foto
                    </p>
                    <p className="text-xs text-neutral-500">
                      Posisikan wajah Anda tegak lurus di dalam bingkai
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Bottom notice */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 flex items-center gap-2 text-xs text-neutral-600">
              <CheckCircle2 size={15} className="text-neutral-700 flex-shrink-0" />
              <p className="leading-relaxed text-[11px]">
                Foto selfie resmi diambil langsung melalui kamera perangkat secara real-time.
              </p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP B: ACTIVE CAMERA PREVIEW & PHOTO CAPTURE                */}
        {/* ============================================================ */}
        {step === 'camera' && (
          <div className="p-5 space-y-4">
            {/* Camera Error Alert */}
            {cameraError && (
              <div className="p-4 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-900 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-neutral-900 flex-shrink-0 mt-0.5" />
                  <p className="leading-relaxed font-medium">{cameraError}</p>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => startCamera('user')}
                    className="px-3 py-1.5 bg-neutral-900 hover:bg-black text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw size={13} />
                    <span>Coba Lagi</span>
                  </button>
                </div>
              </div>
            )}

            {/* Live Camera Viewfinder Box */}
            <div className="relative aspect-4/3 bg-black rounded-2xl overflow-hidden border border-neutral-300 shadow-inner flex items-center justify-center">
              {/* Video Element for live stream */}
              <video
                ref={(el) => {
                  videoRef.current = el
                  if (el && stream) {
                    attachStreamToVideo(stream)
                  }
                }}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  const target = e.currentTarget
                  target.play().catch(() => { })
                }}
                className={`w-full h-full object-cover ${photo ? 'hidden' : 'block'} ${facingMode === 'user' ? 'scale-x-[-1]' : ''
                  }`}
              />

              {/* Captured Photo Preview */}
              {photo && (
                <img
                  src={photo}
                  alt="Selfie Presensi"
                  className="w-full h-full object-cover"
                />
              )}

              {/* Viewfinder Corners (shown only when live stream is active) */}
              {!photo && isCameraActive && (
                <div className="absolute inset-6 border border-white/40 rounded-xl pointer-events-none flex flex-col justify-between p-2">
                  <div className="flex justify-between">
                    <span className="w-5 h-5 border-t-2 border-l-2 border-white rounded-tl" />
                    <span className="w-5 h-5 border-t-2 border-r-2 border-white rounded-tr" />
                  </div>
                  <div className="flex justify-between">
                    <span className="w-5 h-5 border-b-2 border-l-2 border-white rounded-bl" />
                    <span className="w-5 h-5 border-b-2 border-r-2 border-white rounded-br" />
                  </div>
                </div>
              )}

              {/* Loading Overlay */}
              {isCameraLoading && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white text-xs gap-2 z-10">
                  <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Menyiapkan kamera perangkat...</span>
                </div>
              )}

              {/* Top controls: Camera switch (front/back) */}
              {!photo && hasMultipleCameras && isCameraActive && (
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-xs transition-colors z-10"
                  title="Ganti Kamera Depan / Belakang"
                >
                  <SwitchCamera size={18} />
                </button>
              )}
            </div>

            {/* Camera Action Buttons: Ambil Foto vs Ulangi Foto & Gunakan Foto */}
            <div className="pt-2">
              {!photo ? (
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleSnapPhoto}
                    disabled={isCameraLoading || !isCameraActive}
                    className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Camera size={17} />
                    <span>Ambil Foto</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleRetakePhoto}
                      className="py-3 bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-semibold rounded-xl border border-neutral-300 flex items-center justify-center gap-2 transition-colors"
                    >
                      <RotateCcw size={15} />
                      <span>Ulangi Foto</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmPhoto}
                      className="py-3 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition-colors"
                    >
                      <Check size={16} />
                      <span>Gunakan Foto</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-center text-neutral-500">
                    Pastikan wajah terlihat jelas tanpa masker atau penutup sebelum menekan "Gunakan Foto".
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP C: ATTENDANCE CONFIRMATION FORM                        */}
        {/* ============================================================ */}
        {step === 'form' && (
          <div className="p-5 space-y-4">
            {/* Confirmed Photo Thumbnail Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                {confirmedPhoto ? (
                  <img
                    src={confirmedPhoto}
                    alt="Selfie Terkonfirmasi"
                    className="w-16 h-16 rounded-xl object-cover border border-neutral-300 shadow-xs flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-neutral-100 border border-neutral-300 flex items-center justify-center text-neutral-400">
                    <ImageIcon size={22} />
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-neutral-900" />
                    <span>Foto Selfie Siap</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {employeeName} • {category}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleChangePhotoFromForm}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg text-xs font-semibold border border-neutral-200 transition-colors"
              >
                Ganti Foto
              </button>
            </div>

            {/* Geofence / Location Status Card */}
            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-800 flex items-center gap-1.5">
                  <MapPin size={14} />
                  Lokasi Validasi Presensi:
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isInsideRadius
                    ? 'bg-neutral-200 text-neutral-900'
                    : 'bg-neutral-900 text-white'
                  }`}>
                  {isInsideRadius ? 'Dalam Radius' : 'Luar Radius'}
                </span>
              </div>
              <p className="text-[11px] text-neutral-600 font-mono">
                Jarak ke {officeConfig.name}: <strong>{formatDistance(distanceMeters)}</strong> (Batas: {officeConfig.radiusMeters}m)
              </p>
            </div>

            {/* Reason Textarea (Required if GPS missing, outside radius, or server requires reason for late/etc) */}
            {requiresReason && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-900">
                    {serverRequiresReason ? 'Alasan Wajib dari Server' : 'Alasan Presensi di Luar Radius'}
                  </label>
                  <span className="text-[10px] font-semibold text-neutral-900 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                    Wajib (Min. 5 karakter)
                  </span>
                </div>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={serverRequiresReason
                    ? 'Contoh: Terlambat karena kemacetan / GPS tidak akurat...'
                    : 'Contoh: Bertugas dinas luar di gerbang timur / GPS mengalami deviasi...'}
                  rows={3}
                  className="w-full p-3 border border-neutral-300 rounded-xl text-xs text-neutral-900 bg-white focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none placeholder:text-neutral-400"
                />
              </div>
            )}


            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleSubmitAttendance}
                disabled={!confirmedPhoto || (requiresReason && reason.trim().length < 5)}
                className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Kirim Presensi Sekarang</span>
              </button>

              <button
                type="button"
                onClick={() => setStep('initial')}
                className="w-full py-2.5 text-neutral-500 hover:text-neutral-900 text-xs font-medium transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP D: SUBMITTING                                          */}
        {/* ============================================================ */}
        {step === 'submitting' && (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-12 h-12 border-3 border-neutral-900 border-t-transparent rounded-full animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-neutral-900">
                Memverifikasi & Menyimpan Presensi...
              </p>
              <p className="text-xs text-neutral-500">
                Memvalidasi selfie, sinyal GPS, dan jadwal di server Supabase
              </p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP E: RESULT (Success Screen)                             */}
        {/* ============================================================ */}
        {step === 'result' && resultRecord && (
          <div className="p-6 space-y-6 animate-fade-in">
            <div className="flex flex-col items-center text-center space-y-2 pt-2">
              <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center text-white shadow-md mb-2">
                <Check size={40} strokeWidth={3} />
              </div>
              <h3 className="text-xl font-bold text-neutral-900">Presensi Berhasil!</h3>
              <p className="text-xs text-neutral-500">
                Data absensi {resultRecord.attendance_type} telah diverifikasi dan tersimpan di database
              </p>
            </div>

            {/* Summary Details */}
            <div className="bg-neutral-50 rounded-2xl border border-neutral-200 p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                <span className="text-neutral-500">Pegawai</span>
                <span className="font-bold text-neutral-900">{resultRecord.employee_name}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                <span className="text-neutral-500">Jenis Presensi</span>
                <span className="font-bold text-neutral-900 capitalize">{resultRecord.attendance_type}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-neutral-200/60">
                <span className="text-neutral-500">Waktu Tercatat</span>
                <span className="font-bold text-neutral-900 font-mono">
                  {formatJakartaTime(new Date(resultRecord.recorded_at))} WIB
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-neutral-500">Status Validasi</span>
                <span className="font-bold text-neutral-900">
                  {resultRecord.attendance_status === 'terlambat' ? 'Terlambat' : 'Tepat Waktu'}
                </span>
              </div>
            </div>

            {/* Return / Detail Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  stopCamera()
                  onClose()
                  navigate(`/attendance/${resultRecord.id}`)
                }}
                className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
              >
                Lihat Detail Presensi
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera()
                  onClose()
                  if (onSuccess) onSuccess()
                }}
                className="w-full py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-xs rounded-xl transition-colors border border-neutral-200"
              >
                Selesai & Kembali
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
