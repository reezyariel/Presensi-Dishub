-- ============================================================
-- SIPATEN Migration 019: Foto Profil Karyawan & Keamanan Akun
-- 1. Tambah kolom avatar_url pada employee_profiles
-- 2. Buat bucket 'avatars' untuk foto profil (terpisah dari 'selfies')
-- 3. RLS Storage: hanya pemilik yang bisa upload/hapus foto miliknya sendiri
-- 4. Admin dapat membaca semua foto profil
-- 5. Tidak mengubah tabel/kebijakan absensi
-- ============================================================

-- 1. Tambah kolom avatar_url ke employee_profiles (foto profil, terpisah dari selfie absensi)
ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Update active_employees_directory view untuk menyertakan avatar_url
-- (supaya AuthContext dan Admin dapat membaca avatar_url via view)
DROP VIEW IF EXISTS public.active_employees_directory CASCADE;

CREATE OR REPLACE VIEW public.active_employees_directory
WITH (security_barrier = true) AS
  SELECT
    id,
    full_name,
    normalized_name,
    employee_role,
    default_shift,
    auth_uid,
    employee_code,
    email,
    avatar_url
  FROM public.employee_profiles
  WHERE is_active = true;

ALTER VIEW public.active_employees_directory OWNER TO postgres;

-- Berikan hak SELECT pada view kepada authenticated (termasuk anon untuk login flow)
GRANT SELECT ON public.active_employees_directory TO authenticated;
GRANT SELECT ON public.active_employees_directory TO anon;

-- 2. RLS Policy employee_profiles: izinkan karyawan UPDATE avatar_url miliknya sendiri
-- (policy "Allow employees to update own profile" sudah ada dari migration 008)
-- Pastikan kebijakan ini masih berlaku setelah penambahan kolom
-- Policy yang ada sudah cukup: using(auth_uid = auth.uid()) with check(auth_uid = auth.uid())
-- Tidak perlu perubahan karena UPDATE pada kolom apa pun sudah terproteksi oleh RLS

-- 3. Buat bucket 'avatars' untuk foto profil (private, terpisah dari 'selfies' untuk selfie absensi)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  2097152,  -- 2 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4. Storage RLS Policies untuk bucket 'avatars'

-- 4a. Karyawan hanya dapat SELECT foto miliknya sendiri (berdasarkan auth.uid())
DROP POLICY IF EXISTS "Allow employees to read own avatar" ON storage.objects;
CREATE POLICY "Allow employees to read own avatar"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      -- Admin dapat baca semua foto profil
      public.is_admin()
      OR
      -- Karyawan hanya dapat baca folder miliknya sendiri: avatars/{auth.uid()}/...
      (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- 4b. Karyawan hanya dapat INSERT/UPLOAD ke folder miliknya sendiri
DROP POLICY IF EXISTS "Allow employees to upload own avatar" ON storage.objects;
CREATE POLICY "Allow employees to upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND NOT public.is_admin()  -- Admin tidak perlu upload avatar karyawan; karyawan yg upload sendiri
    OR (
      bucket_id = 'avatars'
      AND public.is_admin()
    )
  );

-- 4c. Karyawan hanya dapat UPDATE/REPLACE foto miliknya sendiri
DROP POLICY IF EXISTS "Allow employees to update own avatar" ON storage.objects;
CREATE POLICY "Allow employees to update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

-- 4d. Karyawan hanya dapat DELETE foto miliknya sendiri
DROP POLICY IF EXISTS "Allow employees to delete own avatar" ON storage.objects;
CREATE POLICY "Allow employees to delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

-- ============================================================
-- CATATAN UNTUK PENERAPAN MANUAL:
-- Jalankan migration ini di Supabase SQL Editor.
-- Bucket 'avatars' bersifat private (public=false).
-- Foto diakses dengan Signed URL yang dihasilkan oleh frontend.
-- Foto profil dan foto absensi (selfies) TIDAK saling menimpa:
--   - Selfie absensi => bucket 'selfies', path: {category}/{date}/...
--   - Foto profil    => bucket 'avatars', path: {auth_uid}/{filename}
-- ============================================================
