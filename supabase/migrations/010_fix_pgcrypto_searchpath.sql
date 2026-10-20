-- ============================================================
-- Fix search_path and extensions qualifier for pgcrypto in admin RPCs
-- ============================================================

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

  -- 4. Create Auth User in auth.users using pgcrypto from extensions schema
  v_pwd_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
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

-- Fix admin_reset_employee_password
DROP FUNCTION IF EXISTS public.admin_reset_employee_password;

CREATE OR REPLACE FUNCTION public.admin_reset_employee_password(
  p_employee_id uuid,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
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

  v_pwd_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf', 10));

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
