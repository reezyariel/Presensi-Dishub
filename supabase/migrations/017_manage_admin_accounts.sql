-- ============================================================
-- SIPATEN Migration 017: Kelola Akun Administrator (v4 Hardened)
--
-- Arsitektur & Keamanan (Revisi Ketat v4):
-- 1. Skema Profil: Tambah email & is_active pada public.admin_profiles
--    (dengan backfill aman sebelum NOT NULL diaktifkan).
-- 2. Keamanan Fungsi is_admin():
--    - Pola SET search_path = '' (identik dengan migration 005)
--    - Schema-qualify semua tabel, fungsi, dan objek
--    - Menggunakan COALESCE(...) standar SQL (tanpa pg_catalog.coalesce yang invalid)
--    - Memvalidasi is_active = true agar akun nonaktif tidak dapat login
-- 3. Pengamanan Audit Logs (Tamper-evident):
--    - attendance_audit_logs.admin_id dibuat nullable
--    - Foreign key diubah ke ON DELETE SET NULL (riwayat audit tidak terhapus)
--    - attendance_settings.updated_by FK diubah ke ON DELETE SET NULL
--    - DO block menangani berbagai kemungkinan nama constraint / duplikat FK
--      dengan verifikasi to_regclass agar aman dan idempoten.
-- 4. PENGELOLAAN AUTENTIKASI DENGAN TWO-PHASE PERSISTENT OPERATIONS:
--    - Operasi Supabase Auth (create, update email, reset password, delete user)
--      dikelola sepenuhnya melalui Supabase Edge Function 'manage-admins'
--      menggunakan Supabase Auth Admin API terpercaya.
--    - Tabel persisten public.admin_deletion_operations melacak siklus hidup
--      penghapusan (pending -> completed / cancelled) dengan operation_id unik.
--    - cancel_delete dan finalize_delete memvalidasi status dan mengambil
--      status pemulihan (previous_is_active) dari tabel persisten, BUKAN
--      memercayai parameter yang dikirim pemanggil.
--    - Tersedia jalur rekonsiliasi jika penghapusan Auth berhasil tetapi
--      finalize database mengalami kegagalan.
-- 5. Helper Atomik Database Anti Race Condition & Anti-Spoofing:
--    - Menggunakan pg_advisory_xact_lock untuk SEMUA operasi yang memengaruhi
--      jumlah admin aktif (create, update, toggle, prepare-delete, cancel-delete, finalize-delete).
--    - SEMUA helper atomik menggunakan SET search_path = ''
--    - SEMUA helper atomik dicabut (REVOKE) dari role authenticated, anon, dan public.
--      Hanya service_role yang memiliki hak EXECUTE.
--    - Setiap helper memeriksa auth.role() = 'service_role' untuk mencegah
--      pemalsuan identitas (spoofing p_caller_id) jika dipanggil langsung dari client.
--    - Mutasi langsung (INSERT, UPDATE, DELETE) pada admin_profiles dicabut dari authenticated.
-- 6. Normalisasi Email yang Konsisten:
--    - Normalisasi email seragam: pg_catalog.lower(pg_catalog.btrim(...))
--    - Validasi format email regex pada database & Edge Function
--    - Unique partial index mencegah duplikasi email aktif.
-- 7. Isolasi Data:
--    - Tidak mengubah tabel/kebijakan CS, Security, maupun absensi.
-- ============================================================

-- ============================================================
-- BAGIAN 0: Bersihkan RPC Lama & Seluruh Overload Terdahulu
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_create_admin(text, text, text, boolean);
DROP FUNCTION IF EXISTS public.admin_create_admin;
DROP FUNCTION IF EXISTS public.admin_update_admin(uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.admin_update_admin;
DROP FUNCTION IF EXISTS public.admin_toggle_admin_status(uuid);
DROP FUNCTION IF EXISTS public.admin_toggle_admin_status;
DROP FUNCTION IF EXISTS public.admin_delete_admin(uuid);
DROP FUNCTION IF EXISTS public.admin_delete_admin;
DROP FUNCTION IF EXISTS public.admin_reset_admin_password(uuid, text);
DROP FUNCTION IF EXISTS public.admin_reset_admin_password;

-- Bersihkan helper lama & semua signature terdahulu
DROP FUNCTION IF EXISTS public.admin_atomic_create_profile(uuid, uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.admin_atomic_create_profile;
DROP FUNCTION IF EXISTS public.admin_atomic_update_profile(uuid, uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.admin_atomic_update_profile;
DROP FUNCTION IF EXISTS public.admin_atomic_toggle_status(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_atomic_toggle_status;
DROP FUNCTION IF EXISTS public.admin_atomic_delete_profile(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_atomic_delete_profile;
DROP FUNCTION IF EXISTS public.admin_atomic_restore_profile(uuid, uuid, text, text, boolean, timestamptz, text);
DROP FUNCTION IF EXISTS public.admin_atomic_restore_profile;
DROP FUNCTION IF EXISTS public.admin_atomic_prepare_delete(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_atomic_prepare_delete;
DROP FUNCTION IF EXISTS public.admin_atomic_cancel_delete(uuid, uuid, boolean, text);
DROP FUNCTION IF EXISTS public.admin_atomic_cancel_delete(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.admin_atomic_cancel_delete(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.admin_atomic_cancel_delete;
DROP FUNCTION IF EXISTS public.admin_atomic_finalize_delete(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_atomic_finalize_delete(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_atomic_finalize_delete;
DROP FUNCTION IF EXISTS public.admin_log_password_reset(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_log_password_reset;
DROP FUNCTION IF EXISTS public.admin_log_sync_incident(uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS public.admin_log_sync_incident;

-- ============================================================
-- BAGIAN 1: Skema Kolom Baru pada public.admin_profiles
-- ============================================================

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.admin_profiles') IS NOT NULL THEN
    -- Tambah kolom email jika belum ada
    ALTER TABLE public.admin_profiles
      ADD COLUMN IF NOT EXISTS email text;

    -- Tambah kolom is_active nullable terlebih dahulu untuk backfill data lama
    ALTER TABLE public.admin_profiles
      ADD COLUMN IF NOT EXISTS is_active boolean;

    -- Backfill: semua akun admin yang sudah ada diset aktif
    UPDATE public.admin_profiles
    SET is_active = true
    WHERE is_active IS NULL;

    -- Terapkan default dan not null setelah backfill selesai
    ALTER TABLE public.admin_profiles
      ALTER COLUMN is_active SET DEFAULT true,
      ALTER COLUMN is_active SET NOT NULL;

    -- Backfill email dari auth.users untuk akun admin yang sudah ada (jika auth.users tersedia)
    -- Menggunakan pg_catalog.btrim (fungsi trim resmi pada pg_catalog PostgreSQL)
    IF pg_catalog.to_regclass('auth.users') IS NOT NULL THEN
      UPDATE public.admin_profiles ap
      SET email = pg_catalog.lower(pg_catalog.btrim(u.email))
      FROM auth.users u
      WHERE ap.id = u.id
        AND (ap.email IS NULL OR pg_catalog.btrim(ap.email) = '');
    END IF;

    -- Sanitisasi data email yang ada: lowercase & btrim
    UPDATE public.admin_profiles
    SET email = pg_catalog.lower(pg_catalog.btrim(email))
    WHERE email IS NOT NULL AND pg_catalog.btrim(email) <> '';

    UPDATE public.admin_profiles
    SET email = NULL
    WHERE email IS NOT NULL AND pg_catalog.btrim(email) = '';
  END IF;
END;
$$;

-- Index unik untuk email admin (case-insensitive & whitespace trimmed via pg_catalog.btrim)
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_profiles_email_unique
  ON public.admin_profiles (pg_catalog.lower(pg_catalog.btrim(email)))
  WHERE email IS NOT NULL AND pg_catalog.btrim(email) <> '';

-- ============================================================
-- BAGIAN 2: Tabel Pelacakan Operasi Penghapusan Dua Fase Persisten
-- Menjamin cancel & finalize hanya menyelesaikan operasi yang benar
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_deletion_operations (
  id                 uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  target_admin_id    uuid NOT NULL,
  caller_admin_id    uuid NOT NULL,
  previous_is_active boolean NOT NULL,
  target_full_name   text NOT NULL,
  target_email       text,
  status             text NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
  error_reason       text,
  created_at         timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at         timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_admin_deletion_ops_status
  ON public.admin_deletion_operations (status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_admin_deletion_ops_target
  ON public.admin_deletion_operations (target_admin_id);

ALTER TABLE public.admin_deletion_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_deletion_operations FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.admin_deletion_operations TO service_role;

-- ============================================================
-- BAGIAN 3: Update Helper is_admin()
-- Pola SET search_path = '' (konsisten dengan migration 005)
-- Schema-qualified penuh untuk semua tabel dan fungsi
-- Menggunakan COALESCE(...) standar SQL (bukan pg_catalog.coalesce)
-- Memastikan admin harus berstatus is_active = true
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE id = auth.uid()
      AND COALESCE(is_active, true) = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ============================================================
-- BAGIAN 4: Pengamanan Foreign Key pada attendance_audit_logs
-- Mencegah riwayat audit terhapus saat akun admin dihapus
-- Menggunakan DO block yang aman terhadap multi-constraint / nama dinamis
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  IF pg_catalog.to_regclass('public.attendance_audit_logs') IS NOT NULL THEN
    -- 1. Temukan dan hapus semua FK yang mengikat kolom admin_id pada attendance_audit_logs
    FOR r IN (
      SELECT c.conname
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'public.attendance_audit_logs'::regclass
        AND c.contype = 'f'
        AND a.attname = 'admin_id'
    ) LOOP
      EXECUTE pg_catalog.format('ALTER TABLE public.attendance_audit_logs DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;

    -- 2. Hapus nama target jika sebelumnya sudah ada
    EXECUTE 'ALTER TABLE public.attendance_audit_logs DROP CONSTRAINT IF EXISTS attendance_audit_logs_admin_id_fkey';

    -- 3. Izinkan admin_id bernilai NULL untuk rekam jejak historis
    EXECUTE 'ALTER TABLE public.attendance_audit_logs ALTER COLUMN admin_id DROP NOT NULL';

    -- 4. Pasang FK baru dengan ON DELETE SET NULL
    IF pg_catalog.to_regclass('public.admin_profiles') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE public.attendance_audit_logs ADD CONSTRAINT attendance_audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admin_profiles(id) ON DELETE SET NULL';
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- BAGIAN 5: Pengamanan Foreign Key pada attendance_settings (updated_by)
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  IF pg_catalog.to_regclass('public.attendance_settings') IS NOT NULL THEN
    FOR r IN (
      SELECT c.conname
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'public.attendance_settings'::regclass
        AND c.contype = 'f'
        AND a.attname = 'updated_by'
    ) LOOP
      EXECUTE pg_catalog.format('ALTER TABLE public.attendance_settings DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;

    EXECUTE 'ALTER TABLE public.attendance_settings DROP CONSTRAINT IF EXISTS attendance_settings_updated_by_fkey';

    IF pg_catalog.to_regclass('public.admin_profiles') IS NOT NULL THEN
      EXECUTE 'ALTER TABLE public.attendance_settings ADD CONSTRAINT attendance_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.admin_profiles(id) ON DELETE SET NULL';
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- BAGIAN 6: RLS & Hak Akses Tabel admin_profiles
-- Client HANYA boleh SELECT (dengan RLS).
-- Seluruh mutasi (INSERT, UPDATE, DELETE) dicabut dari authenticated/anon/public,
-- sehingga hanya dapat dimutasi melalui Edge Function via service_role.
-- ============================================================
DO $$
BEGIN
  IF pg_catalog.to_regclass('public.admin_profiles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.admin_profiles FROM public, anon, authenticated';
    EXECUTE 'GRANT SELECT ON public.admin_profiles TO authenticated, service_role';

    -- Bersihkan kebijakan lama
    EXECUTE 'DROP POLICY IF EXISTS "Allow users to read own profile or admin to read profiles" ON public.admin_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "Allow admins to read all profiles" ON public.admin_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "Allow admins to update their own profile" ON public.admin_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "Allow admins to update profiles" ON public.admin_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "Allow verified admins to read profiles" ON public.admin_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated admins to read profiles" ON public.admin_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "Allow admins to insert/update their profile" ON public.admin_profiles';

    -- Buat kebijakan SELECT yang aman
    EXECUTE 'CREATE POLICY "Allow users to read own profile or admin to read profiles" ON public.admin_profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin())';
  END IF;
END;
$$;

-- ============================================================
-- BAGIAN 7: Helper Atomik Database (KHUSUS Service Role Backend)
-- Keamanan & Ketahanan Ekstra:
-- 1. SET search_path = '' dengan schema-qualification penuh.
-- 2. Memeriksa auth.role() = 'service_role' (menolak pemanggilan client).
-- 3. Menggunakan pg_advisory_xact_lock secara konsisten pada SEMUA mutasi
--    yang memengaruhi jumlah admin aktif.
-- 4. Normalisasi email yang konsisten (lowercase & btrim).
-- 5. Dicabut dari public, anon, dan authenticated.
-- ============================================================

-- 7.1 Helper Atomik: Simpan Profil Admin Baru & Catat Audit Log
CREATE OR REPLACE FUNCTION public.admin_atomic_create_profile(
  p_caller_id    uuid,
  p_new_admin_id uuid,
  p_full_name    text,
  p_email        text,
  p_is_active    boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_norm_name   text;
  v_clean_email text;
  v_active_val  boolean;
BEGIN
  -- Strict assertion: Hanya boleh dieksekusi oleh service_role
  IF COALESCE(auth.role(), '') <> 'service_role' AND CURRENT_USER NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Akses ditolak: Fungsi internal ini hanya dapat diakses oleh service_role backend.';
  END IF;

  -- Serialisasi permintaan yang memengaruhi jumlah admin aktif
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_profiles_active_lock'));

  -- Verifikasi caller adalah admin aktif
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = p_caller_id AND COALESCE(is_active, true) = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'CALLER_NOT_ACTIVE_ADMIN',
      'message', 'Akses ditolak: Pemanggil bukan Administrator aktif.'
    );
  END IF;

  v_norm_name := pg_catalog.btrim(pg_catalog.regexp_replace(p_full_name, '\s+', ' ', 'g'));
  v_clean_email := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_active_val := COALESCE(p_is_active, true);

  IF v_norm_name = '' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'EMPTY_NAME',
      'message', 'Nama lengkap administrator wajib diisi.'
    );
  END IF;

  -- Validasi format email yang konsisten
  IF v_clean_email = '' OR v_clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_EMAIL',
      'message', 'Format alamat email tidak valid.'
    );
  END IF;

  -- Validasi duplikasi email sebelum insert
  IF EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE pg_catalog.lower(pg_catalog.btrim(email)) = v_clean_email
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'EMAIL_ALREADY_EXISTS',
      'message', pg_catalog.format('Email "%s" sudah terdaftar pada profil Administrator.', v_clean_email)
    );
  END IF;

  -- Insert ke admin_profiles dengan proteksi unique_violation tingkat database
  BEGIN
    INSERT INTO public.admin_profiles (id, full_name, email, is_active, created_at, updated_at)
    VALUES (p_new_admin_id, v_norm_name, v_clean_email, v_active_val, pg_catalog.now(), pg_catalog.now());
  EXCEPTION
    WHEN unique_violation THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'error_code', 'EMAIL_ALREADY_EXISTS',
        'message', pg_catalog.format('Email "%s" sudah terdaftar pada profil Administrator.', v_clean_email)
      );
  END;

  -- Catat audit log dalam transaksi yang sama
  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, new_values)
  VALUES (
    p_caller_id,
    'create_admin_account',
    pg_catalog.format('Menambahkan akun Administrator baru: %s (%s)', v_norm_name, v_clean_email),
    pg_catalog.jsonb_build_object(
      'admin_id', p_new_admin_id,
      'full_name', v_norm_name,
      'email', v_clean_email,
      'is_active', v_active_val
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'admin_id', p_new_admin_id,
    'message', pg_catalog.format('Profil Administrator "%s" berhasil disimpan.', v_norm_name)
  );
END;
$$;

-- 7.2 Helper Atomik: Update Profil Admin (dengan Advisory Lock Anti-Race Condition)
CREATE OR REPLACE FUNCTION public.admin_atomic_update_profile(
  p_caller_id uuid,
  p_target_id uuid,
  p_full_name text,
  p_email     text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_profile  public.admin_profiles%ROWTYPE;
  v_norm_name    text;
  v_clean_email  text;
  v_active_count integer;
BEGIN
  -- Strict assertion: Hanya boleh dieksekusi oleh service_role
  IF COALESCE(auth.role(), '') <> 'service_role' AND CURRENT_USER NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Akses ditolak: Fungsi internal ini hanya dapat diakses oleh service_role backend.';
  END IF;

  -- Serialisasi permintaan bersamaan menggunakan advisory lock tingkat transaksi
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_profiles_active_lock'));

  -- Verifikasi caller adalah admin aktif
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = p_caller_id AND COALESCE(is_active, true) = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'CALLER_NOT_ACTIVE_ADMIN',
      'message', 'Akses ditolak: Pemanggil bukan Administrator aktif.'
    );
  END IF;

  v_norm_name := pg_catalog.btrim(pg_catalog.regexp_replace(p_full_name, '\s+', ' ', 'g'));
  v_clean_email := pg_catalog.lower(pg_catalog.btrim(p_email));

  IF v_norm_name = '' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'EMPTY_NAME',
      'message', 'Nama lengkap administrator tidak boleh kosong.'
    );
  END IF;

  IF v_clean_email = '' OR v_clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_EMAIL',
      'message', 'Format alamat email tidak valid.'
    );
  END IF;

  SELECT * INTO v_old_profile FROM public.admin_profiles WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'TARGET_NOT_FOUND',
      'message', 'Data profil administrator tidak ditemukan.'
    );
  END IF;

  -- Proteksi: Mencegah menonaktifkan akun sendiri
  IF p_is_active = false AND p_target_id = p_caller_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'CANNOT_DEACTIVATE_SELF',
      'message', 'Akses ditolak: Anda tidak dapat menonaktifkan akun Anda sendiri saat sedang masuk.'
    );
  END IF;

  -- Proteksi: Mencegah menonaktifkan jika hanya ada 1 admin aktif tersisa
  IF p_is_active = false AND COALESCE(v_old_profile.is_active, true) = true THEN
    SELECT pg_catalog.count(*) INTO v_active_count
    FROM public.admin_profiles
    WHERE COALESCE(is_active, true) = true;

    IF v_active_count <= 1 THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'error_code', 'LAST_ACTIVE_ADMIN',
        'message', 'Akses ditolak: Minimal harus ada satu Administrator yang aktif di sistem.'
      );
    END IF;
  END IF;

  -- Cek duplikasi email pada profil admin lain (case & whitespace normalized via pg_catalog.btrim)
  IF EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE pg_catalog.lower(pg_catalog.btrim(email)) = v_clean_email AND id <> p_target_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'EMAIL_ALREADY_EXISTS',
      'message', pg_catalog.format('Email "%s" sudah digunakan oleh Administrator lain.', v_clean_email)
    );
  END IF;

  -- Update profil
  UPDATE public.admin_profiles
  SET full_name = v_norm_name,
      email = v_clean_email,
      is_active = p_is_active,
      updated_at = pg_catalog.now()
  WHERE id = p_target_id;

  -- Catat audit log
  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, old_values, new_values)
  VALUES (
    p_caller_id,
    'update_admin_account',
    pg_catalog.format('Memperbarui akun Administrator: %s (%s)', v_norm_name, v_clean_email),
    pg_catalog.jsonb_build_object('full_name', v_old_profile.full_name, 'email', v_old_profile.email, 'is_active', v_old_profile.is_active),
    pg_catalog.jsonb_build_object('full_name', v_norm_name, 'email', v_clean_email, 'is_active', p_is_active)
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'admin_id', p_target_id,
    'message', pg_catalog.format('Data Administrator "%s" berhasil diperbarui.', v_norm_name)
  );
END;
$$;

-- 7.3 Helper Atomik: Toggle Status Admin (dengan Advisory Lock Anti-Race Condition)
CREATE OR REPLACE FUNCTION public.admin_atomic_toggle_status(
  p_caller_id uuid,
  p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_profile  public.admin_profiles%ROWTYPE;
  v_next_status  boolean;
  v_active_count integer;
BEGIN
  -- Strict assertion: Hanya boleh dieksekusi oleh service_role
  IF COALESCE(auth.role(), '') <> 'service_role' AND CURRENT_USER NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Akses ditolak: Fungsi internal ini hanya dapat diakses oleh service_role backend.';
  END IF;

  -- Serialisasi permintaan bersamaan
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_profiles_active_lock'));

  -- Verifikasi caller adalah admin aktif
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = p_caller_id AND COALESCE(is_active, true) = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'CALLER_NOT_ACTIVE_ADMIN',
      'message', 'Akses ditolak: Pemanggil bukan Administrator aktif.'
    );
  END IF;

  -- Proteksi: Mencegah menonaktifkan akun sendiri
  IF p_target_id = p_caller_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'CANNOT_DEACTIVATE_SELF',
      'message', 'Akses ditolak: Anda tidak dapat menonaktifkan akun Anda sendiri saat sedang login.'
    );
  END IF;

  SELECT * INTO v_old_profile FROM public.admin_profiles WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'TARGET_NOT_FOUND',
      'message', 'Data profil administrator tidak ditemukan.'
    );
  END IF;

  v_next_status := NOT COALESCE(v_old_profile.is_active, true);

  -- Proteksi: Mencegah menonaktifkan admin terakhir yang aktif
  IF v_next_status = false THEN
    SELECT pg_catalog.count(*) INTO v_active_count
    FROM public.admin_profiles
    WHERE COALESCE(is_active, true) = true;

    IF v_active_count <= 1 THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'error_code', 'LAST_ACTIVE_ADMIN',
        'message', 'Akses ditolak: Minimal harus ada satu Administrator yang aktif di sistem.'
      );
    END IF;
  END IF;

  -- Terapkan perubahan status
  UPDATE public.admin_profiles
  SET is_active = v_next_status,
      updated_at = pg_catalog.now()
  WHERE id = p_target_id;

  -- Catat audit log
  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, old_values, new_values)
  VALUES (
    p_caller_id,
    'toggle_admin_status',
    pg_catalog.format(
      'Mengubah status Administrator %s (%s) menjadi %s',
      v_old_profile.full_name,
      COALESCE(v_old_profile.email, '-'),
      CASE WHEN v_next_status THEN 'Aktif' ELSE 'Nonaktif' END
    ),
    pg_catalog.jsonb_build_object('is_active', v_old_profile.is_active),
    pg_catalog.jsonb_build_object('is_active', v_next_status)
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'admin_id', p_target_id,
    'is_active', v_next_status,
    'message', pg_catalog.format(
      'Status Administrator "%s" berhasil diubah menjadi %s.',
      v_old_profile.full_name,
      CASE WHEN v_next_status THEN 'Aktif' ELSE 'Nonaktif' END
    )
  );
END;
$$;

-- ============================================================
-- ALUR PENGHAPUSAN TWO-PHASE PERSISTEN (PREPARE, CANCEL, FINALIZE)
-- Menggunakan Operation ID & Status Persisten pada admin_deletion_operations.
-- Status awal (previous_is_active) disimpan di database dan tidak memercayai caller.
-- ============================================================

-- 7.4 Phase 1: Prepare Delete
-- Mengambil advisory lock, memvalidasi admin aktif terakhir,
-- menyimpan rekaman operasi 'pending', dan menonaktifkan admin sementara.
-- TIDAK MENYENTUH FK AUDIT LOG ATAU SETTINGS!
CREATE OR REPLACE FUNCTION public.admin_atomic_prepare_delete(
  p_caller_id uuid,
  p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target       public.admin_profiles%ROWTYPE;
  v_active_count integer;
  v_operation_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND CURRENT_USER NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Akses ditolak: Fungsi internal ini hanya dapat diakses oleh service_role backend.';
  END IF;

  -- Serialisasi permintaan bersamaan
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_profiles_active_lock'));

  -- Verifikasi caller adalah admin aktif
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = p_caller_id AND COALESCE(is_active, true) = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'CALLER_NOT_ACTIVE_ADMIN',
      'message', 'Akses ditolak: Pemanggil bukan Administrator aktif.'
    );
  END IF;

  -- Proteksi 1: Mencegah admin menghapus akunnya sendiri
  IF p_target_id = p_caller_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'CANNOT_DELETE_SELF',
      'message', 'Akses ditolak: Anda tidak dapat menghapus akun Anda sendiri saat sedang masuk.'
    );
  END IF;

  SELECT * INTO v_target FROM public.admin_profiles WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'TARGET_NOT_FOUND',
      'message', 'Data profil administrator tidak ditemukan atau sudah dihapus.'
    );
  END IF;

  -- Proteksi 2: Cek apakah target sudah memiliki operasi penghapusan yang sedang berjalan
  IF EXISTS (
    SELECT 1 FROM public.admin_deletion_operations
    WHERE target_admin_id = p_target_id AND status = 'pending'
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'OPERATION_ALREADY_PENDING',
      'message', 'Operasi penghapusan untuk akun administrator ini sedang berlangsung. Jalankan rekonsiliasi jika terjadi proses yang terhenti.'
    );
  END IF;

  -- Proteksi 3: Mencegah penghapusan jika hanya ada 1 admin aktif tersisa
  IF COALESCE(v_target.is_active, true) = true THEN
    SELECT pg_catalog.count(*) INTO v_active_count
    FROM public.admin_profiles
    WHERE COALESCE(is_active, true) = true;

    IF v_active_count <= 1 THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'error_code', 'LAST_ACTIVE_ADMIN',
        'message', 'Akses ditolak: Minimal harus ada satu Administrator aktif di sistem.'
      );
    END IF;
  END IF;

  -- Buat ID operasi persisten
  v_operation_id := pg_catalog.gen_random_uuid();

  -- Simpan rekaman operasi penghapusan secara persisten
  INSERT INTO public.admin_deletion_operations (
    id,
    target_admin_id,
    caller_admin_id,
    previous_is_active,
    target_full_name,
    target_email,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_operation_id,
    p_target_id,
    p_caller_id,
    COALESCE(v_target.is_active, true),
    v_target.full_name,
    v_target.email,
    'pending',
    pg_catalog.now(),
    pg_catalog.now()
  );

  -- Reservasi: Nonaktifkan profil sementara waktu selama proses penghapusan di Auth berlangsung
  UPDATE public.admin_profiles
  SET is_active = false,
      updated_at = pg_catalog.now()
  WHERE id = p_target_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'operation_id', v_operation_id,
    'target_id', p_target_id,
    'full_name', v_target.full_name,
    'email', v_target.email,
    'previous_is_active', v_target.is_active,
    'created_at', v_target.created_at
  );
END;
$$;

-- 7.5 Phase 2A: Cancel Delete (Jika Auth deleteUser Gagal)
-- Memulihkan status profil target menggunakan previous_is_active DARI DATABASE.
-- Tidak memercayai input caller untuk status pemulihan.
CREATE OR REPLACE FUNCTION public.admin_atomic_cancel_delete(
  p_caller_id    uuid,
  p_operation_id uuid,
  p_error_reason text,
  p_target_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_op public.admin_deletion_operations%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND CURRENT_USER NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Akses ditolak: Fungsi internal ini hanya dapat diakses oleh service_role backend.';
  END IF;

  -- Serialisasi operasi
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_profiles_active_lock'));

  -- Verifikasi caller adalah admin aktif
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = p_caller_id AND COALESCE(is_active, true) = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'CALLER_NOT_ACTIVE_ADMIN',
      'message', 'Akses ditolak: Pemanggil bukan Administrator aktif.'
    );
  END IF;

  -- Ambil data operasi persisten
  SELECT * INTO v_op
  FROM public.admin_deletion_operations
  WHERE id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'OPERATION_NOT_FOUND',
      'message', 'Operasi penghapusan tidak ditemukan.'
    );
  END IF;

  -- Validasi target_id jika disediakan oleh pemanggil
  IF p_target_id IS NOT NULL AND v_op.target_admin_id <> p_target_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'OPERATION_TARGET_MISMATCH',
      'message', 'Target ID tidak sesuai dengan identitas operasi.'
    );
  END IF;

  -- Validasi status operasi: cegah eksekusi ulang pada operasi yang sudah selesai/dibatalkan
  IF v_op.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'OPERATION_ALREADY_CANCELLED',
      'message', 'Operasi penghapusan ini sudah pernah dibatalkan sebelumnya.'
    );
  END IF;

  IF v_op.status = 'completed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'OPERATION_ALREADY_COMPLETED',
      'message', 'Operasi penghapusan ini sudah selesai dan tidak dapat dibatalkan.'
    );
  END IF;

  IF v_op.status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'OPERATION_NOT_PENDING',
      'message', pg_catalog.format('Operasi penghapusan tidak dalam status pending (status saat ini: %s).', v_op.status)
    );
  END IF;

  -- Pulihkan status is_active awal DARI DATA PERSISTEN (bukan dari caller)
  UPDATE public.admin_profiles
  SET is_active = v_op.previous_is_active,
      updated_at = pg_catalog.now()
  WHERE id = v_op.target_admin_id;

  -- Tandai status operasi sebagai cancelled
  UPDATE public.admin_deletion_operations
  SET status = 'cancelled',
      error_reason = p_error_reason,
      updated_at = pg_catalog.now()
  WHERE id = p_operation_id;

  -- Catat audit log bahwa penghapusan dibatalkan karena kegagalan Auth
  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, new_values)
  VALUES (
    p_caller_id,
    'cancel_delete_admin_account',
    pg_catalog.format(
      'Pembatalan penghapusan admin %s (%s): %s. Seluruh data dan riwayat historis tetap utuh.',
      v_op.target_full_name,
      COALESCE(v_op.target_email, '-'),
      COALESCE(p_error_reason, 'Kegagalan pada Supabase Auth')
    ),
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'admin_id', v_op.target_admin_id,
      'full_name', v_op.target_full_name,
      'email', v_op.target_email,
      'restored_is_active', v_op.previous_is_active
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'operation_id', p_operation_id,
    'message', 'Penghapusan admin berhasil dibatalkan dan status awal dipulihkan.'
  );
END;
$$;

-- 7.6 Phase 2B: Finalize Delete (Jika Auth deleteUser Berhasil)
-- Menghapus baris admin_profiles, FK ON DELETE SET NULL akan otomatis berlaku.
CREATE OR REPLACE FUNCTION public.admin_atomic_finalize_delete(
  p_caller_id    uuid,
  p_operation_id uuid,
  p_target_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_op public.admin_deletion_operations%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND CURRENT_USER NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Akses ditolak: Fungsi internal ini hanya dapat diakses oleh service_role backend.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_profiles_active_lock'));

  -- Verifikasi caller adalah admin aktif
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = p_caller_id AND COALESCE(is_active, true) = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'CALLER_NOT_ACTIVE_ADMIN',
      'message', 'Akses ditolak: Pemanggil bukan Administrator aktif.'
    );
  END IF;

  SELECT * INTO v_op
  FROM public.admin_deletion_operations
  WHERE id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'OPERATION_NOT_FOUND',
      'message', 'Operasi penghapusan tidak ditemukan.'
    );
  END IF;

  -- Idempotensi aman: Jika operasi sudah pernah diselesaikan, kembalikan sukses tanpa mutasi ulang
  IF v_op.status = 'completed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'operation_id', p_operation_id,
      'message', 'Operasi penghapusan sudah diselesaikan sebelumnya.'
    );
  END IF;

  -- Jika operasi sudah pernah dibatalkan, cegah finalisasi tidak sengaja
  IF v_op.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'OPERATION_ALREADY_CANCELLED',
      'message', 'Operasi penghapusan ini sudah dibatalkan dan tidak dapat difinalisasi.'
    );
  END IF;

  IF v_op.status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'OPERATION_NOT_PENDING',
      'message', pg_catalog.format('Operasi penghapusan tidak dalam status pending (status saat ini: %s).', v_op.status)
    );
  END IF;

  -- Validasi target_id jika disediakan
  IF p_target_id IS NOT NULL AND v_op.target_admin_id <> p_target_id THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'OPERATION_TARGET_MISMATCH',
      'message', 'Target ID tidak sesuai dengan identitas operasi.'
    );
  END IF;

  -- 1. Catat audit log penghapusan SEBELUM profil dihapus (menggunakan identitas persisten)
  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, old_values)
  VALUES (
    p_caller_id,
    'delete_admin_account',
    pg_catalog.format(
      'Menghapus akun Administrator: %s (%s). Riwayat audit historis tetap dipertahankan.',
      v_op.target_full_name,
      COALESCE(v_op.target_email, '-')
    ),
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'admin_id', v_op.target_admin_id,
      'full_name', v_op.target_full_name,
      'email', v_op.target_email
    )
  );

  -- 2. Hapus baris dari public.admin_profiles
  -- FK attendance_audit_logs_admin_id_fkey & attendance_settings_updated_by_fkey
  -- dengan ON DELETE SET NULL akan secara otomatis men-SET NULL referensi terkait
  DELETE FROM public.admin_profiles WHERE id = v_op.target_admin_id;

  -- 3. Tandai operasi persisten sebagai completed
  UPDATE public.admin_deletion_operations
  SET status = 'completed',
      updated_at = pg_catalog.now()
  WHERE id = p_operation_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'operation_id', p_operation_id,
    'deleted_admin_id', v_op.target_admin_id,
    'full_name', v_op.target_full_name,
    'message', pg_catalog.format('Akun Administrator "%s" berhasil dihapus dari sistem.', v_op.target_full_name)
  );
END;
$$;

-- 7.7 Helper Audit Log: Catat Reset Password
CREATE OR REPLACE FUNCTION public.admin_log_password_reset(
  p_caller_id uuid,
  p_target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target_name  text;
  v_target_email text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND CURRENT_USER NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Akses ditolak: Fungsi internal ini hanya dapat diakses oleh service_role backend.';
  END IF;

  -- Verifikasi caller adalah admin aktif
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = p_caller_id AND COALESCE(is_active, true) = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error_code', 'CALLER_NOT_ACTIVE_ADMIN',
      'message', 'Akses ditolak: Pemanggil bukan Administrator aktif.'
    );
  END IF;

  SELECT full_name, email INTO v_target_name, v_target_email
  FROM public.admin_profiles
  WHERE id = p_target_id;

  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, new_values)
  VALUES (
    p_caller_id,
    'reset_admin_password',
    pg_catalog.format(
      'Mereset kata sandi login untuk Administrator: %s (%s)',
      COALESCE(v_target_name, 'Admin'),
      COALESCE(v_target_email, '-')
    ),
    pg_catalog.jsonb_build_object('admin_id', p_target_id, 'full_name', v_target_name, 'email', v_target_email)
  );

  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

-- 7.8 Helper Audit Log: Catat Insiden Ketidaksinkronan Kritis (Untuk Rekonsiliasi)
CREATE OR REPLACE FUNCTION public.admin_log_sync_incident(
  p_caller_id  uuid,
  p_action     text,
  p_reason     text,
  p_new_values jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND CURRENT_USER NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Akses ditolak: Fungsi internal ini hanya dapat diakses oleh service_role backend.';
  END IF;

  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, new_values)
  VALUES (p_caller_id, p_action, p_reason, p_new_values);

  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- BAGIAN 8: Pembatasan Hak Eksekusi Helper Functions (PRINSIP LEAST PRIVILEGE)
-- Cabut dari public, anon, dan authenticated!
-- Hanya berikan EXECUTE kepada role service_role backend.
-- ============================================================
REVOKE ALL ON FUNCTION public.admin_atomic_create_profile(uuid, uuid, text, text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atomic_create_profile(uuid, uuid, text, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_atomic_update_profile(uuid, uuid, text, text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atomic_update_profile(uuid, uuid, text, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_atomic_toggle_status(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atomic_toggle_status(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_atomic_prepare_delete(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atomic_prepare_delete(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_atomic_cancel_delete(uuid, uuid, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atomic_cancel_delete(uuid, uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_atomic_finalize_delete(uuid, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atomic_finalize_delete(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_log_password_reset(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_password_reset(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_log_sync_incident(uuid, text, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_sync_incident(uuid, text, text, jsonb) TO service_role;
