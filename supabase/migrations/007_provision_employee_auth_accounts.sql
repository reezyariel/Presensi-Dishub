-- ============================================================
-- SIPATEN Migration 007: Link Employee Auth Accounts
-- Adds auth_uid column to employee_profiles to link
-- Supabase Auth users directly to employee records.
-- Each CS/Security employee needs their own Supabase Auth
-- account whose UID is stored in auth_uid column.
-- ============================================================

-- 1. Add auth_uid column to employee_profiles
alter table public.employee_profiles
  add column if not exists auth_uid uuid references auth.users(id) on delete set null;

-- Enforce 1 employee = 1 auth account
create unique index if not exists idx_employee_auth_uid
  on public.employee_profiles(auth_uid)
  where auth_uid is not null;

create index if not exists idx_employee_profiles_auth_uid
  on public.employee_profiles(auth_uid);

-- 2. RLS policy: employees can read their own profile
drop policy if exists "Allow employees to read own profile" on public.employee_profiles;

create policy "Allow employees to read own profile"
  on public.employee_profiles for select
  to authenticated
  using (auth_uid = auth.uid() or public.is_admin());

-- 3. Update active_employees_directory view to include auth_uid
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
revoke all on public.active_employees_directory from public;
grant select on public.active_employees_directory to anon, authenticated;

-- 4. Allow employees to read their own attendance records
drop policy if exists "Allow employees to read own attendance records" on public.attendance_records;

create policy "Allow employees to read own attendance records"
  on public.attendance_records for select
  to authenticated
  using (
    public.is_admin()
    or
    exists (
      select 1 from public.employee_profiles ep
      where ep.auth_uid = auth.uid()
        and (
          ep.normalized_name = attendance_records.normalized_name
          or ep.full_name = attendance_records.employee_name
        )
    )
  );
