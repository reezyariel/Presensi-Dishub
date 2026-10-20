-- ============================================================
-- Migration 006: Add GPS Geolocation & Office Geofence Support
-- Status: DRAFT / PENDING MANUAL REVIEW
-- PERINGATAN: File ini adalah referensi migration tambahan.
-- JANGAN MENJALANKAN SQL INI SECARA OTOMATIS KE LIVE DATABASE.
-- ============================================================
--
-- DESKRIPSI & ANALISIS KOMPATIBILITAS:
-- 1. Aplikasi ShiftTrack telah dirancang backward & forward compatible.
--    Edge Function 'submit-attendance' dan portal presensi secara otomatis
--    mencatat koordinat GPS, akurasi, jarak ke kantor, serta alasan di kolom
--    'admin_notes' jika kolom-kolom baru di bawah ini belum ada di database live.
--
-- 2. Jika tim infrastruktur memutuskan untuk mengeksekusi migration ini,
--    PostgreSQL akan menambahkan kolom khusus terstruktur tanpa mengganggu
--    data, indeks, foreign key, atau fungsi RLS yang sudah ada pada migration 005.
-- ============================================================

-- 1. Tambahkan kolom opsional terstruktur untuk data GPS dan Alasan
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_accuracy double precision,
  ADD COLUMN IF NOT EXISTS distance_meters integer,
  ADD COLUMN IF NOT EXISTS reason text;

-- 2. Komentar dokumentasi kolom demi kejelasan audit trail
COMMENT ON COLUMN public.attendance_records.latitude IS 'Koordinat lintang GPS saat presensi diambil (desimal WGS84)';
COMMENT ON COLUMN public.attendance_records.longitude IS 'Koordinat bujur GPS saat presensi diambil (desimal WGS84)';
COMMENT ON COLUMN public.attendance_records.location_accuracy IS 'Perkiraan radius akurasi sinyal GPS perangkat dalam meter';
COMMENT ON COLUMN public.attendance_records.distance_meters IS 'Jarak terhitung (Haversine) antara posisi pegawai dan titik kantor pusat dalam meter';
COMMENT ON COLUMN public.attendance_records.reason IS 'Alasan yang wajib disertakan pegawai jika terlambat atau berada di luar radius kantor';

-- 3. Inisialisasi konfigurasi titik kantor & radius default pada attendance_settings
--    (Hanya diinsert jika key belum ada di tabel attendance_settings)
INSERT INTO public.attendance_settings (setting_key, setting_value, description, updated_at)
VALUES
  (
    'office_coordinates',
    '{"latitude": -6.175392, "longitude": 106.827153, "name": "Kantor Pusat ShiftTrack", "address": "Jl. Medan Merdeka Barat, Gambir, Jakarta Pusat"}'::jsonb,
    'Koordinat titik kantor pusat untuk validasi geofence GPS presensi',
    NOW()
  ),
  (
    'office_radius_meters',
    '100'::jsonb,
    'Radius toleransi geofence presensi kantor dalam meter (50-1000m)',
    NOW()
  )
ON CONFLICT (setting_key) DO NOTHING;

-- 4. Pastikan role anon dan authenticated dapat membaca konfigurasi titik kantor
--    (agar portal presensi CS/Security dapat menghitung jarak awal sebelum submit)
GRANT SELECT ON public.attendance_settings TO anon, authenticated;

-- Policy baca attendance_settings (jika belum ada)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attendance_settings'
      AND policyname = 'Allow anyone to read attendance settings'
  ) THEN
    CREATE POLICY "Allow anyone to read attendance settings"
      ON public.attendance_settings
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
