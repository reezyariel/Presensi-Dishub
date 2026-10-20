-- ============================================================
-- ShiftTrack Migration 002: Fix RLS Recursion & Admin Roles
-- Non-destructive migration: preserves all existing data.
-- ============================================================

-- 1. Helper Function: is_admin() (SECURITY DEFINER)
-- Bypasses RLS recursion on admin_profiles and optimizes performance
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_profiles where id = auth.uid()
  );
$$;

-- 2. Ensure Database-Level Duplicate Attendance Unique Index Exists
create unique index if not exists idx_unique_employee_attendance 
  on public.attendance_records(normalized_name, work_date, attendance_type, category, coalesce(shift, 'NONE'));

-- 3. Drop all previous/conflicting RLS policies safely
drop policy if exists "Allow verified admins to read profiles" on public.admin_profiles;
drop policy if exists "Allow authenticated admins to read profiles" on public.admin_profiles;
drop policy if exists "Allow users to read own profile or admin to read profiles" on public.admin_profiles;
drop policy if exists "Allow admins to insert/update their profile" on public.admin_profiles;
drop policy if exists "Allow admins to update their own profile" on public.admin_profiles;

drop policy if exists "Allow verified admins to select records" on public.attendance_records;
drop policy if exists "Allow authenticated admins to select records" on public.attendance_records;
drop policy if exists "Allow anon to insert attendance records" on public.attendance_records;
drop policy if exists "Allow verified admins to update records" on public.attendance_records;
drop policy if exists "Allow authenticated admins to update records" on public.attendance_records;
drop policy if exists "Allow authenticated admins to delete records" on public.attendance_records;

drop policy if exists "Allow verified admins to view audit logs" on public.attendance_audit_logs;
drop policy if exists "Allow authenticated admins to view audit logs" on public.attendance_audit_logs;
drop policy if exists "Allow verified admins to insert audit logs" on public.attendance_audit_logs;
drop policy if exists "Allow authenticated admins to create audit logs" on public.attendance_audit_logs;

drop policy if exists "Allow anyone to read attendance settings" on public.attendance_settings;
drop policy if exists "Allow verified admins to update settings" on public.attendance_settings;
drop policy if exists "Allow authenticated admins to update settings" on public.attendance_settings;
drop policy if exists "Allow verified admins to manage settings" on public.attendance_settings;

drop policy if exists "Allow public upload selfies" on storage.objects;
drop policy if exists "Allow verified admins to read selfies" on storage.objects;
drop policy if exists "Allow authenticated admins to read selfies" on storage.objects;

-- 4. Re-create Clean, Non-Recursive RLS Policies

-- A. admin_profiles
create policy "Allow users to read own profile or admin to read profiles"
  on public.admin_profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "Allow admins to update their own profile"
  on public.admin_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- B. attendance_records
-- Only verified admins can read records
create policy "Allow verified admins to select records"
  on public.attendance_records for select
  to authenticated
  using (public.is_admin());

-- Only verified admins can update records
create policy "Allow verified admins to update records"
  on public.attendance_records for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- C. attendance_audit_logs
create policy "Allow verified admins to view audit logs"
  on public.attendance_audit_logs for select
  to authenticated
  using (public.is_admin());

create policy "Allow verified admins to insert audit logs"
  on public.attendance_audit_logs for insert
  to authenticated
  with check (auth.uid() = admin_id and public.is_admin());

-- D. attendance_settings
-- Pastikan tidak ada akses publik (anon) ke tabel pengaturan sistem
revoke all on public.attendance_settings from anon;

create policy "Allow verified admins to manage settings"
  on public.attendance_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- E. storage.objects (selfies bucket)
create policy "Allow verified admins to read selfies"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'selfies' and public.is_admin());

-- ============================================================
-- 5. Panduan Pendaftaran Akun Admin yang Sah (Secure Explicit Binding)
-- KEAMANAN: Dilarang melakukan mass-insert dari auth.users karena akan
-- mempromosikan akun non-admin menjadi Administrator!
-- ============================================================

-- Metode Aman 1 (Disarankan): Daftarkan akun admin secara eksplisit menggunakan UID dari auth.users
-- INSERT INTO public.admin_profiles (id, full_name)
-- VALUES ('<MASUKKAN_UID_DARI_SUPABASE_AUTH>', 'Nama Administrator')
-- ON CONFLICT (id) DO NOTHING;

-- Metode Aman 2: Kaitkan berdasarkan email admin yang sudah terverifikasi di auth.users
-- INSERT INTO public.admin_profiles (id, full_name)
-- SELECT id, coalesce(raw_user_meta_data->>'full_name', 'Administrator ShiftTrack')
-- FROM auth.users
-- WHERE email = 'admin@shifttrack.local' -- Ganti dengan email admin resmi yang valid
-- ON CONFLICT (id) DO NOTHING;

