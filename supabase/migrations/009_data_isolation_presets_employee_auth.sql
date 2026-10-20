-- ============================================================
-- ShiftTrack Migration 009: Data Isolation, Presets, and Employee Auth
-- 1. Strict Data Isolation for CS, Security, and Admin:
--    - Add employee_profile_id & auth_uid to attendance_records
--    - Harden RLS policies so employees ONLY access their own records
--    - Harden Storage policies so employees ONLY access their own selfies
-- 2. Fully Manageable Location Presets:
--    - Create location_presets table with full Admin CRUD
--    - Sync with active office configuration in attendance_settings
-- 3. Integrated Employee Creation with Login Accounts:
--    - Add employee_code & email to employee_profiles
--    - Admin RPC functions: admin_create_employee, admin_reset_password,
--      admin_toggle_status, admin_delete_employee
--    - Update resolve_employee_identifier for instant ID login
-- ============================================================

-- ------------------------------------------------------------
-- 1. DATA ISOLATION: Schema & RLS Hardening
-- ------------------------------------------------------------

-- A. Link attendance_records directly to employee_profiles & auth.users
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS employee_profile_id uuid REFERENCES public.employee_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auth_uid uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_employee_profile_id 
  ON public.attendance_records(employee_profile_id);

CREATE INDEX IF NOT EXISTS idx_attendance_auth_uid 
  ON public.attendance_records(auth_uid);

-- Backfill existing attendance_records with profile & auth links
UPDATE public.attendance_records ar
SET employee_profile_id = ep.id,
    auth_uid = COALESCE(ar.auth_uid, ep.auth_uid)
FROM public.employee_profiles ep
WHERE ar.employee_profile_id IS NULL
  AND ep.normalized_name = ar.normalized_name
  AND ep.employee_role = ar.category;

-- B. Harden RLS on attendance_records
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow verified admins to select records" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow authenticated admins to select records" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow employees to read own attendance records" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_records_select_policy" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_records_insert_policy" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_records_update_policy" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_records_delete_policy" ON public.attendance_records;

-- SELECT Policy: Admin reads all. Employees read ONLY their own records.
CREATE POLICY "attendance_records_select_policy"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR
    (
      auth_uid = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM public.employee_profiles ep
        WHERE ep.id = attendance_records.employee_profile_id
          AND (ep.auth_uid = auth.uid() OR ep.id = auth.uid())
      )
      OR
      (
        -- Fallback link for existing records by verified employee profile
        EXISTS (
          SELECT 1 FROM public.employee_profiles ep
          WHERE (ep.auth_uid = auth.uid() OR ep.id = auth.uid())
            AND ep.employee_role = attendance_records.category
            AND (ep.normalized_name = attendance_records.normalized_name OR ep.full_name = attendance_records.employee_name)
        )
      )
    )
  );

-- INSERT Policy: Admin or authenticated employee inserting their own record
CREATE POLICY "attendance_records_insert_policy"
  ON public.attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR
    (
      auth_uid = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM public.employee_profiles ep
        WHERE ep.id = employee_profile_id
          AND (ep.auth_uid = auth.uid() OR ep.id = auth.uid())
      )
    )
  );

-- UPDATE Policy: Only verified Administrator
CREATE POLICY "attendance_records_update_policy"
  ON public.attendance_records FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE Policy: Only verified Administrator
CREATE POLICY "attendance_records_delete_policy"
  ON public.attendance_records FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- C. Storage RLS on bucket 'selfies'
DROP POLICY IF EXISTS "Allow verified admins to read selfies" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated admins to read selfies" ON storage.objects;
DROP POLICY IF EXISTS "Allow employees to read own selfies" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins and owners to read selfies" ON storage.objects;

CREATE POLICY "Allow admins and owners to read selfies"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'selfies'
    AND (
      public.is_admin()
      OR
      EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.selfie_storage_path = name
          AND (
            ar.auth_uid = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.employee_profiles ep
              WHERE ep.id = ar.employee_profile_id
                AND (ep.auth_uid = auth.uid() OR ep.id = auth.uid())
            )
            OR EXISTS (
              SELECT 1 FROM public.employee_profiles ep
              WHERE (ep.auth_uid = auth.uid() OR ep.id = auth.uid())
                AND ep.employee_role = ar.category
                AND (ep.normalized_name = ar.normalized_name OR ep.full_name = ar.employee_name)
            )
          )
      )
    )
  );

-- ------------------------------------------------------------
-- 2. LOCATION PRESETS & OFFICE CONFIGURATION
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.location_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_meters integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_presets_active ON public.location_presets(is_active);

-- Seed default initial presets only if empty
INSERT INTO public.location_presets (name, address, latitude, longitude, radius_meters, is_active)
SELECT 'Monas / Jakarta Pusat (Kantor Pusat)', 'Gambir, Kecamatan Gambir, Kota Jakarta Pusat, DKI Jakarta 10110', -6.175392, 106.827153, 100, true
WHERE NOT EXISTS (SELECT 1 FROM public.location_presets);

INSERT INTO public.location_presets (name, address, latitude, longitude, radius_meters, is_active)
SELECT 'Wisma Sudirman / SCBD', 'Jl. Jend. Sudirman Kav. 52-53, Senayan, Kebayoran Baru, Jakarta Selatan', -6.224168, 106.809675, 150, false
WHERE (SELECT count(*) FROM public.location_presets) = 1;

INSERT INTO public.location_presets (name, address, latitude, longitude, radius_meters, is_active)
SELECT 'BSD Green Office Park', 'Jl. Grand Boulevard, BSD City, Sampora, Cisauk, Tangerang, Banten 15345', -6.301980, 106.652174, 200, false
WHERE (SELECT count(*) FROM public.location_presets) = 2;

-- Enable RLS on location_presets
ALTER TABLE public.location_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admins to manage location presets" ON public.location_presets;
DROP POLICY IF EXISTS "Allow authenticated to read active location preset" ON public.location_presets;
DROP POLICY IF EXISTS "Allow authenticated to read location presets" ON public.location_presets;

-- Admin can perform all operations on location presets
CREATE POLICY "Allow admins to manage location presets"
  ON public.location_presets FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Authenticated users (CS / Security) can read location presets (needed for active office validation)
CREATE POLICY "Allow authenticated to read location presets"
  ON public.location_presets FOR SELECT
  TO authenticated
  USING (true);

-- Ensure attendance_settings is readable by all authenticated users
DROP POLICY IF EXISTS "Allow anyone to read attendance settings" ON public.attendance_settings;
DROP POLICY IF EXISTS "Allow authenticated to read attendance settings" ON public.attendance_settings;

CREATE POLICY "Allow authenticated to read attendance settings"
  ON public.attendance_settings FOR SELECT
  TO authenticated
  USING (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_presets TO authenticated;
GRANT SELECT ON public.attendance_settings TO authenticated;

-- Function for Admin to explicitly set active location preset
CREATE OR REPLACE FUNCTION public.admin_set_active_location(
  p_preset_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer,
  p_name text,
  p_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Administrator yang berwenang mengubah lokasi kantor.';
  END IF;

  v_admin_id := auth.uid();

  -- 1. Deactivate all presets
  UPDATE public.location_presets
  SET is_active = false, updated_at = now();

  -- 2. If preset_id provided, mark it active
  IF p_preset_id IS NOT NULL THEN
    UPDATE public.location_presets
    SET is_active = true,
        latitude = p_latitude,
        longitude = p_longitude,
        radius_meters = p_radius_meters,
        name = p_name,
        address = p_address,
        updated_at = now()
    WHERE id = p_preset_id;
  END IF;

  -- 3. Upsert into attendance_settings as authoritative active configuration
  INSERT INTO public.attendance_settings (setting_key, setting_value, description, updated_by, updated_at)
  VALUES (
    'office_coordinates',
    jsonb_build_object(
      'latitude', p_latitude,
      'longitude', p_longitude,
      'name', p_name,
      'address', p_address,
      'preset_id', p_preset_id
    ),
    'Koordinat titik kantor aktif untuk validasi geofence GPS presensi',
    v_admin_id,
    now()
  )
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value,
        updated_by = v_admin_id,
        updated_at = now();

  INSERT INTO public.attendance_settings (setting_key, setting_value, description, updated_by, updated_at)
  VALUES (
    'office_radius_meters',
    to_jsonb(p_radius_meters),
    'Radius toleransi geofence presensi kantor dalam meter (50-1000m)',
    v_admin_id,
    now()
  )
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value,
        updated_by = v_admin_id,
        updated_at = now();

  -- 4. Audit Log
  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, new_values)
  VALUES (
    v_admin_id,
    'update_office_location',
    format('Memperbarui lokasi kantor aktif: %s (Radius %sm)', p_name, p_radius_meters),
    jsonb_build_object(
      'preset_id', p_preset_id,
      'name', p_name,
      'latitude', p_latitude,
      'longitude', p_longitude,
      'radius_meters', p_radius_meters
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Lokasi kantor aktif dan geofence berhasil disimpan.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_active_location TO authenticated;

-- ------------------------------------------------------------
-- 3. INTEGRATED EMPLOYEE CREATION WITH AUTH ACCOUNTS
-- ------------------------------------------------------------

-- Add employee_code and email to employee_profiles
ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS employee_code text,
  ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_profiles_code_unique
  ON public.employee_profiles(lower(employee_code))
  WHERE employee_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_profiles_email_unique
  ON public.employee_profiles(lower(email))
  WHERE email IS NOT NULL;

-- Populate demo accounts codes
UPDATE public.employee_profiles
SET employee_code = 'CS001',
    email = 'cs@shifttrack.app'
WHERE normalized_name = 'demo cs officer' OR full_name ILIKE '%demo cs%';

UPDATE public.employee_profiles
SET employee_code = 'SEC001',
    email = 'security@shifttrack.app'
WHERE normalized_name = 'demo security officer' OR full_name ILIKE '%demo security%';

-- Update active_employees_directory view to include employee_code & email
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
    email
  FROM public.employee_profiles
  WHERE is_active = true;

ALTER VIEW public.active_employees_directory OWNER TO postgres;
GRANT SELECT ON public.active_employees_directory TO authenticated;

-- RPC: Admin Create Employee with Real Auth User & Identity
CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_full_name text,
  p_employee_code text,
  p_email text,
  p_role text,
  p_password text,
  p_default_shift text DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_new_auth_uid uuid;
  v_new_profile_id uuid;
  v_clean_email text;
  v_clean_code text;
  v_norm_name text;
  v_pwd_hash text;
BEGIN
  -- 1. Verify caller is verified admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Administrator yang berwenang menambah pegawai.';
  END IF;

  v_admin_id := auth.uid();
  v_clean_email := lower(trim(p_email));
  v_clean_code := upper(trim(p_employee_code));
  v_norm_name := lower(trim(regexp_replace(p_full_name, '\s+', ' ', 'g')));

  -- 2. Validation
  IF v_clean_email = '' OR v_clean_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'Format email tidak valid: %', p_email;
  END IF;

  IF v_clean_code = '' THEN
    RAISE EXCEPTION 'ID Pegawai / NIK wajib diisi.';
  END IF;

  IF p_role NOT IN ('CS', 'Security') THEN
    RAISE EXCEPTION 'Role pegawai harus "CS" atau "Security". Nilai: %', p_role;
  END IF;

  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'Kata sandi minimal 6 karakter.';
  END IF;

  -- 3. Check duplicates
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
    RAISE EXCEPTION 'Email "%" sudah terdaftar pada akun autentikasi lain.', v_clean_email;
  END IF;

  IF EXISTS (SELECT 1 FROM public.employee_profiles WHERE lower(employee_code) = lower(v_clean_code)) THEN
    RAISE EXCEPTION 'ID Pegawai "%" sudah digunakan oleh pegawai lain.', v_clean_code;
  END IF;

  IF EXISTS (SELECT 1 FROM public.employee_profiles WHERE lower(email) = v_clean_email) THEN
    RAISE EXCEPTION 'Email "%" sudah terdaftar di profil pegawai.', v_clean_email;
  END IF;

  -- 4. Create Auth User in auth.users
  v_pwd_hash := crypt(p_password, gen_salt('bf', 10));
  v_new_auth_uid := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_sent_at,
    raw_user_meta_data, raw_app_meta_data,
    is_sso_user, is_anonymous, created_at, updated_at
  ) VALUES (
    v_new_auth_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_clean_email,
    v_pwd_hash,
    now(),
    now(),
    jsonb_build_object(
      'full_name', trim(p_full_name),
      'role', p_role,
      'employee_id', v_clean_code,
      'employee_code', v_clean_code,
      'username', lower(v_clean_code),
      'email_verified', true
    ),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    false,
    false,
    now(),
    now()
  );

  -- 5. Create Identity in auth.identities
  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_new_auth_uid::text,
    v_new_auth_uid,
    jsonb_build_object('sub', v_new_auth_uid::text, 'email', v_clean_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now(),
    now()
  );

  -- 6. Insert into employee_profiles
  INSERT INTO public.employee_profiles (
    full_name, normalized_name, employee_code, email,
    employee_role, default_shift, is_active, notes, auth_uid
  ) VALUES (
    trim(p_full_name),
    v_norm_name,
    v_clean_code,
    v_clean_email,
    p_role,
    CASE WHEN p_role = 'Security' THEN p_default_shift ELSE NULL END,
    p_is_active,
    p_notes,
    v_new_auth_uid
  )
  RETURNING id INTO v_new_profile_id;

  -- 7. Audit Log
  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, new_values)
  VALUES (
    v_admin_id,
    'create_employee_with_auth',
    format('Menambahkan pegawai baru beserta akun login: %s (%s, ID: %s)', p_full_name, p_role, v_clean_code),
    jsonb_build_object(
      'profile_id', v_new_profile_id,
      'auth_uid', v_new_auth_uid,
      'full_name', p_full_name,
      'employee_code', v_clean_code,
      'email', v_clean_email,
      'role', p_role,
      'default_shift', p_default_shift,
      'is_active', p_is_active
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'profile_id', v_new_profile_id,
    'auth_uid', v_new_auth_uid,
    'employee_code', v_clean_code,
    'email', v_clean_email,
    'message', format('Akun login dan profil pegawai "%s" berhasil dibuat.', p_full_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_employee TO authenticated;

-- RPC: Admin Reset Employee Password
CREATE OR REPLACE FUNCTION public.admin_reset_employee_password(
  p_employee_id uuid,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_auth_uid uuid;
  v_emp_name text;
  v_pwd_hash text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Administrator yang berwenang mereset password.';
  END IF;

  v_admin_id := auth.uid();

  IF length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Kata sandi baru minimal 6 karakter.';
  END IF;

  SELECT auth_uid, full_name INTO v_auth_uid, v_emp_name
  FROM public.employee_profiles
  WHERE id = p_employee_id;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Pegawai ini belum terhubung dengan akun login Supabase Auth.';
  END IF;

  v_pwd_hash := crypt(p_new_password, gen_salt('bf', 10));

  UPDATE auth.users
  SET encrypted_password = v_pwd_hash,
      updated_at = now()
  WHERE id = v_auth_uid;

  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, new_values)
  VALUES (
    v_admin_id,
    'reset_employee_password',
    format('Mereset kata sandi login untuk pegawai: %s', v_emp_name),
    jsonb_build_object('employee_id', p_employee_id, 'auth_uid', v_auth_uid)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Kata sandi untuk %s berhasil diperbarui.', v_emp_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_employee_password TO authenticated;

-- RPC: Admin Delete Employee with Historical Integrity
CREATE OR REPLACE FUNCTION public.admin_delete_employee(
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  v_auth_uid uuid;
  v_emp_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Administrator yang berwenang menghapus pegawai.';
  END IF;

  v_admin_id := auth.uid();

  SELECT auth_uid, full_name INTO v_auth_uid, v_emp_name
  FROM public.employee_profiles
  WHERE id = p_employee_id;

  IF v_emp_name IS NULL THEN
    RAISE EXCEPTION 'Data pegawai tidak ditemukan.';
  END IF;

  -- 1. Preserve historical attendance records (set employee_profile_id & auth_uid to null so history remains intact)
  UPDATE public.attendance_records
  SET employee_profile_id = NULL,
      auth_uid = NULL
  WHERE employee_profile_id = p_employee_id OR (v_auth_uid IS NOT NULL AND auth_uid = v_auth_uid);

  -- 2. Delete employee profile
  DELETE FROM public.employee_profiles WHERE id = p_employee_id;

  -- 3. Delete auth user and identities if exists
  IF v_auth_uid IS NOT NULL THEN
    DELETE FROM auth.identities WHERE user_id = v_auth_uid;
    DELETE FROM auth.users WHERE id = v_auth_uid;
  END IF;

  -- 4. Audit Log
  INSERT INTO public.attendance_audit_logs (admin_id, action, reason, old_values)
  VALUES (
    v_admin_id,
    'delete_employee_complete',
    format('Menghapus pegawai dan akun login: %s (Riwayat presensi tetap dipertahankan)', v_emp_name),
    jsonb_build_object('employee_id', p_employee_id, 'auth_uid', v_auth_uid, 'full_name', v_emp_name)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Pegawai %s dan akun login terkait berhasil dihapus.', v_emp_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_employee TO authenticated;

-- Update resolve_employee_identifier to check employee_code in employee_profiles
CREATE OR REPLACE FUNCTION public.resolve_employee_identifier(p_identifier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_clean text;
  v_email text;
BEGIN
  IF p_identifier IS NULL THEN
    RETURN NULL;
  END IF;

  v_clean := lower(trim(p_identifier));
  
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;

  -- If it's already an email, return it directly
  IF v_clean LIKE '%@%' THEN
    RETURN v_clean;
  END IF;

  -- 1. Try matching employee_profiles by employee_code or email
  SELECT u.email INTO v_email
  FROM public.employee_profiles ep
  JOIN auth.users u ON u.id = ep.auth_uid
  WHERE lower(ep.employee_code) = v_clean
     OR lower(ep.email) = v_clean
  LIMIT 1;

  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  -- 2. Try matching auth.users by employee_id / employee_code / username / email prefix
  SELECT email INTO v_email
  FROM auth.users
  WHERE lower(COALESCE(raw_user_meta_data->>'employee_id', '')) = v_clean
     OR lower(COALESCE(raw_user_meta_data->>'employee_code', '')) = v_clean
     OR lower(COALESCE(raw_user_meta_data->>'username', '')) = v_clean
     OR lower(split_part(email, '@', 1)) = v_clean
  LIMIT 1;

  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  -- 3. Try matching employee_profiles linked to auth.users by normalized name
  SELECT u.email INTO v_email
  FROM public.employee_profiles ep
  JOIN auth.users u ON u.id = ep.auth_uid
  WHERE lower(ep.normalized_name) = v_clean
     OR lower(replace(ep.full_name, ' ', '')) = lower(replace(v_clean, ' ', ''))
  LIMIT 1;

  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  -- 4. Friendly aliases for standard demo logins
  IF v_clean IN ('cs001', 'cs', 'demo-cs', 'democs') THEN
    RETURN 'cs@shifttrack.app';
  ELSIF v_clean IN ('sec001', 'sec', 'security', 'security001', 'demo-sec', 'demosec') THEN
    RETURN 'security@shifttrack.app';
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_employee_identifier(text) TO anon, authenticated;
