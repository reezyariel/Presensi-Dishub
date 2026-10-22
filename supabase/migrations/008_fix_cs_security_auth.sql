-- ============================================================
-- SIPATEN Migration 008: Comprehensive Fix for CS & Security Auth
-- 1. Ensure auth_uid column exists and is indexed
-- 2. Create demo CS and Security Auth accounts in auth.users and auth.identities
-- 3. Populate employee_profiles and link auth_uid
-- 4. Enable secure RLS policies for employees to read own profiles and attendance records
-- 5. Create secure PostgreSQL RPC resolver: resolve_employee_identifier
-- ============================================================

-- 1. Ensure auth_uid exists in employee_profiles
alter table public.employee_profiles
  add column if not exists auth_uid uuid references auth.users(id) on delete set null;

create index if not exists idx_employee_profiles_auth_uid
  on public.employee_profiles(auth_uid);

-- 2. Function & Procedure to create / update Auth user and identity cleanly
do $$
declare
  cs_id uuid;
  sec_id uuid;
  cs_demo_id uuid;
  sec_demo_id uuid;
  pwd_hash text;
begin
  -- Standard password hash for 'password123'
  pwd_hash := crypt('password123', gen_salt('bf', 10));

  -- A. Create / Update cs@SIPATEN.app
  select id into cs_id from auth.users where email = 'cs@SIPATEN.app';
  if cs_id is null then
    cs_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_sent_at,
      raw_user_meta_data, raw_app_meta_data,
      is_sso_user, is_anonymous, created_at, updated_at
    ) values (
      cs_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'cs@SIPATEN.app',
      pwd_hash,
      now(),
      now(),
      jsonb_build_object(
        'full_name', 'Demo CS Officer',
        'role', 'CS',
        'employee_id', 'CS001',
        'employee_code', 'CS001',
        'username', 'cs001',
        'email_verified', true
      ),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      false,
      false,
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = pwd_hash,
        raw_user_meta_data = jsonb_build_object(
          'full_name', 'Demo CS Officer',
          'role', 'CS',
          'employee_id', 'CS001',
          'employee_code', 'CS001',
          'username', 'cs001',
          'email_verified', true
        ),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = cs_id;
  end if;

  -- Ensure identity exists for cs@SIPATEN.app (note: email column is generated, omitted)
  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    cs_id::text,
    cs_id,
    jsonb_build_object('sub', cs_id::text, 'email', 'cs@SIPATEN.app', 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do update
    set identity_data = excluded.identity_data,
        updated_at = now();

  -- B. Create / Update security@SIPATEN.app
  select id into sec_id from auth.users where email = 'security@SIPATEN.app';
  if sec_id is null then
    sec_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_sent_at,
      raw_user_meta_data, raw_app_meta_data,
      is_sso_user, is_anonymous, created_at, updated_at
    ) values (
      sec_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'security@SIPATEN.app',
      pwd_hash,
      now(),
      now(),
      jsonb_build_object(
        'full_name', 'Demo Security Officer',
        'role', 'Security',
        'employee_id', 'SEC001',
        'employee_code', 'SEC001',
        'username', 'sec001',
        'email_verified', true
      ),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      false,
      false,
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = pwd_hash,
        raw_user_meta_data = jsonb_build_object(
          'full_name', 'Demo Security Officer',
          'role', 'Security',
          'employee_id', 'SEC001',
          'employee_code', 'SEC001',
          'username', 'sec001',
          'email_verified', true
        ),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = sec_id;
  end if;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    sec_id::text,
    sec_id,
    jsonb_build_object('sub', sec_id::text, 'email', 'security@SIPATEN.app', 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do update
    set identity_data = excluded.identity_data,
        updated_at = now();

  -- C. Also support cs.demo@SIPATEN.app
  select id into cs_demo_id from auth.users where email = 'cs.demo@SIPATEN.app';
  if cs_demo_id is null then
    cs_demo_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_sent_at,
      raw_user_meta_data, raw_app_meta_data,
      is_sso_user, is_anonymous, created_at, updated_at
    ) values (
      cs_demo_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'cs.demo@SIPATEN.app',
      pwd_hash,
      now(),
      now(),
      jsonb_build_object(
        'full_name', 'Demo CS Officer',
        'role', 'CS',
        'employee_id', 'CS001',
        'employee_code', 'CS001',
        'username', 'cs001',
        'email_verified', true
      ),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      false,
      false,
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = pwd_hash,
        raw_user_meta_data = jsonb_build_object(
          'full_name', 'Demo CS Officer',
          'role', 'CS',
          'employee_id', 'CS001',
          'employee_code', 'CS001',
          'username', 'cs001',
          'email_verified', true
        ),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = cs_demo_id;
  end if;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    cs_demo_id::text,
    cs_demo_id,
    jsonb_build_object('sub', cs_demo_id::text, 'email', 'cs.demo@SIPATEN.app', 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do update
    set identity_data = excluded.identity_data,
        updated_at = now();

  -- D. Also support security.demo@SIPATEN.app
  select id into sec_demo_id from auth.users where email = 'security.demo@SIPATEN.app';
  if sec_demo_id is null then
    sec_demo_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_sent_at,
      raw_user_meta_data, raw_app_meta_data,
      is_sso_user, is_anonymous, created_at, updated_at
    ) values (
      sec_demo_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'security.demo@SIPATEN.app',
      pwd_hash,
      now(),
      now(),
      jsonb_build_object(
        'full_name', 'Demo Security Officer',
        'role', 'Security',
        'employee_id', 'SEC001',
        'employee_code', 'SEC001',
        'username', 'sec001',
        'email_verified', true
      ),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      false,
      false,
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = pwd_hash,
        raw_user_meta_data = jsonb_build_object(
          'full_name', 'Demo Security Officer',
          'role', 'Security',
          'employee_id', 'SEC001',
          'employee_code', 'SEC001',
          'username', 'sec001',
          'email_verified', true
        ),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = sec_demo_id;
  end if;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    sec_demo_id::text,
    sec_demo_id,
    jsonb_build_object('sub', sec_demo_id::text, 'email', 'security.demo@SIPATEN.app', 'email_verified', true, 'phone_verified', false),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do update
    set identity_data = excluded.identity_data,
        updated_at = now();

  -- 3. Populate / Upsert employee_profiles
  -- CS Demo Officer
  insert into public.employee_profiles (full_name, normalized_name, employee_role, default_shift, is_active, notes, auth_uid)
  values ('Demo CS Officer', 'demo cs officer', 'CS', null, true, 'Akun demo resmi Customer Service SIPATEN', cs_id)
  on conflict (normalized_name, employee_role) do update
    set auth_uid = cs_id, is_active = true, updated_at = now();

  -- Security Demo Officer
  insert into public.employee_profiles (full_name, normalized_name, employee_role, default_shift, is_active, notes, auth_uid)
  values ('Demo Security Officer', 'demo security officer', 'Security', 'Shift I', true, 'Akun demo resmi Security SIPATEN', sec_id)
  on conflict (normalized_name, employee_role) do update
    set auth_uid = sec_id, is_active = true, default_shift = 'Shift I', updated_at = now();

  -- Populate historical employees from attendance_records
  insert into public.employee_profiles (full_name, normalized_name, employee_role, default_shift, is_active, notes)
  values
    ('Triza Nabila Ariely', 'triza nabila ariely', 'CS', null, true, 'Petugas Customer Service'),
    ('ariely nabe', 'ariely nabe', 'CS', null, true, 'Petugas Customer Service'),
    ('Fahrezy', 'fahrezy', 'CS', null, true, 'Petugas Customer Service'),
    ('rezy', 'rezy', 'Security', 'Shift I', true, 'Petugas Keamanan Shift I'),
    ('triza', 'triza', 'Security', 'Shift II', true, 'Petugas Keamanan Shift II')
  on conflict (normalized_name, employee_role) do update
    set is_active = true, updated_at = now();

end $$;

-- 4. Enable RLS and Configure Policies
alter table public.employee_profiles enable row level security;

drop policy if exists "Allow admins to read all employee profiles" on public.employee_profiles;
drop policy if exists "Allow employees to read own profile" on public.employee_profiles;
drop policy if exists "Allow employees to update own profile" on public.employee_profiles;
drop policy if exists "Allow admins to insert employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to update employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to delete employee profiles" on public.employee_profiles;

-- Allow admins full access
create policy "Allow admins to read all employee profiles"
  on public.employee_profiles for select
  to authenticated
  using (public.is_admin());

create policy "Allow admins to insert employee profiles"
  on public.employee_profiles for insert
  to authenticated
  with check (public.is_admin());

create policy "Allow admins to update employee profiles"
  on public.employee_profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Allow admins to delete employee profiles"
  on public.employee_profiles for delete
  to authenticated
  using (public.is_admin());

-- Allow authenticated employees to read their own profile
create policy "Allow employees to read own profile"
  on public.employee_profiles for select
  to authenticated
  using (auth_uid = auth.uid() or id = auth.uid() or public.is_admin());

create policy "Allow employees to update own profile"
  on public.employee_profiles for update
  to authenticated
  using (auth_uid = auth.uid())
  with check (auth_uid = auth.uid());

-- RLS policies for attendance_records
drop policy if exists "Allow verified admins to select records" on public.attendance_records;
drop policy if exists "Allow employees to read own attendance records" on public.attendance_records;

create policy "Allow verified admins to select records"
  on public.attendance_records for select
  to authenticated
  using (public.is_admin());

create policy "Allow employees to read own attendance records"
  on public.attendance_records for select
  to authenticated
  using (
    public.is_admin()
    or
    exists (
      select 1 from public.employee_profiles ep
      where (ep.auth_uid = auth.uid() or ep.id = auth.uid())
        and (
          ep.normalized_name = attendance_records.normalized_name
          or ep.full_name = attendance_records.employee_name
        )
    )
    or
    exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and (
          lower(coalesce(u.raw_user_meta_data->>'full_name', '')) = lower(attendance_records.employee_name)
          or lower(attendance_records.normalized_name) = lower(coalesce(u.raw_user_meta_data->>'full_name', ''))
        )
    )
  );

-- 5. Recreate active_employees_directory view with proper permissions
create or replace view public.active_employees_directory
with (security_barrier = true) as
  select
    id,
    full_name,
    normalized_name,
    employee_role,
    default_shift,
    auth_uid
  from public.employee_profiles
  where is_active = true;

alter view public.active_employees_directory owner to postgres;
grant select on public.active_employees_directory to anon, authenticated;

-- 6. RPC Function to securely resolve Employee ID / Code / Name to Auth Email
create or replace function public.resolve_employee_identifier(p_identifier text)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_clean text;
  v_email text;
begin
  if p_identifier is null then
    return null;
  end if;

  v_clean := lower(trim(p_identifier));
  
  if v_clean = '' then
    return null;
  end if;

  -- If it's already an email, return it directly
  if v_clean like '%@%' then
    return v_clean;
  end if;

  -- 1. Try matching auth.users by employee_id / employee_code / username / email prefix
  select email into v_email
  from auth.users
  where lower(coalesce(raw_user_meta_data->>'employee_id', '')) = v_clean
     or lower(coalesce(raw_user_meta_data->>'employee_code', '')) = v_clean
     or lower(coalesce(raw_user_meta_data->>'username', '')) = v_clean
     or lower(split_part(email, '@', 1)) = v_clean
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- 2. Try matching employee_profiles linked to auth.users
  select u.email into v_email
  from public.employee_profiles ep
  join auth.users u on u.id = ep.auth_uid
  where lower(ep.normalized_name) = v_clean
     or lower(replace(ep.full_name, ' ', '')) = lower(replace(v_clean, ' ', ''))
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- 3. Friendly aliases
  if v_clean in ('cs001', 'cs', 'demo-cs', 'democs') then
    return 'cs@SIPATEN.app';
  elsif v_clean in ('sec001', 'sec', 'security', 'security001', 'demo-sec', 'demosec') then
    return 'security@SIPATEN.app';
  end if;

  return null;
end;
$$;

grant execute on function public.resolve_employee_identifier(text) to anon, authenticated;
