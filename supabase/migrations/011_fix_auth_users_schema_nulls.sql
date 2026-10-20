-- ============================================================
-- ShiftTrack Migration 011: Fix "Database error querying schema"
--
-- ROOT CAUSE:
-- GoTrue (Supabase Auth server in Go) queries auth.users on login.
-- Go's database/sql package scans confirmation_token, recovery_token,
-- email_change, email_change_token_new, email_change_token_current,
-- phone_change, phone_change_token, reauthentication_token as string types.
-- If any of these are NULL, Go throws:
--   "converting NULL to string is unsupported"
-- which GoTrue surfaces as HTTP 500: "Database error querying schema".
--
-- FIX:
-- 1. Backfill all existing rows in auth.users with empty string for NULL tokens.
-- 2. Update public.admin_create_employee to explicitly set all token fields
--    to empty string ('') instead of NULL.
-- ============================================================

-- 1. Backfill all existing auth.users rows
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE
  confirmation_token IS NULL
  OR recovery_token IS NULL
  OR email_change_token_new IS NULL
  OR email_change IS NULL
  OR email_change_token_current IS NULL
  OR phone_change IS NULL
  OR phone_change_token IS NULL
  OR reauthentication_token IS NULL;

-- 2. Update admin_create_employee with explicit token values
DROP FUNCTION IF EXISTS public.admin_create_employee(text,text,text,text,text,text,boolean,text);
DROP FUNCTION IF EXISTS public.admin_create_employee;

CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_full_name text,
  p_employee_code text,
  p_email text,
  p_password text,
  p_role text,
  p_default_shift text DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
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
  v_pwd_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  v_new_auth_uid := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_sent_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
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
    '', -- confirmation_token: must be empty string
    '', -- recovery_token: must be empty string
    '', -- email_change: must be empty string
    '', -- email_change_token_new: must be empty string
    '', -- email_change_token_current: must be empty string
    '', -- phone_change: must be empty string
    '', -- phone_change_token: must be empty string
    '', -- reauthentication_token: must be empty string
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
