-- ============================================================
-- SIPATEN Migration 004: Harden Existing Database
-- Non-destructive security patch for existing Supabase instance.
-- Preserves all existing tables, attendance records, and verified admin accounts.
-- ============================================================

-- 1. Helper Function: is_admin() (SECURITY DEFINER with Empty Search Path)
-- Prevents RLS infinite recursion and search path injection attacks.
-- Uses explicit schema qualification: public.admin_profiles and auth.uid().
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.admin_profiles where id = auth.uid()
  );
$$;

-- Revoke execute from PUBLIC and anon (anonymous users are never admins)
-- Grant execute strictly to authenticated role so admin RLS policies can evaluate it
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2. Trigger Function: set_updated_at() (Hardened with Empty Search Path & Security Invoker)
-- Uses isolated pg_catalog.now() to prevent mutable search path vulnerabilities.
-- Catatan Keamanan: Sengaja TIDAK menggunakan SECURITY DEFINER karena fungsi trigger ini
-- hanya memodifikasi field record dalam memori (NEW.updated_at) dan tidak memerlukan hak akses elevated.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- Cabut hak eksekusi langsung dari public dan anon
revoke all on function public.set_updated_at() from public, anon;

-- Berikan hak EXECUTE secara eksplisit kepada authenticated.
-- Pada PostgreSQL, ketika user authenticated melakukan UPDATE pada tabel dengan trigger,
-- database engine memverifikasi bahwa caller memiliki hak EXECUTE pada trigger function.
grant execute on function public.set_updated_at() to authenticated;

-- Attach trigger to employee_profiles (idempotent drop & recreate)
drop trigger if exists trg_employee_profiles_updated_at on public.employee_profiles;
create trigger trg_employee_profiles_updated_at
  before update on public.employee_profiles
  for each row
  execute function public.set_updated_at();

-- 3. Database-Level Unique Indexes (Prevent Duplicate Names & Attendance)
-- Catatan Keamanan & Idempotensi:
-- IF NOT EXISTS memastikan script tidak error jika index bernama sama sudah ada.
-- Namun IF NOT EXISTS tidak mengubah definisi jika index lama menggunakan kolom berbeda.
-- Audit database aktual telah mengonfirmasi 0 duplikasi data pada kedua tabel.
create unique index if not exists idx_unique_employee_role
  on public.employee_profiles(normalized_name, employee_role);

create unique index if not exists idx_unique_employee_attendance 
  on public.attendance_records(normalized_name, work_date, attendance_type, category, coalesce(shift, 'NONE'));

create index if not exists idx_employee_role on public.employee_profiles(employee_role);
create index if not exists idx_employee_active on public.employee_profiles(is_active);

-- 4. Public Secure Directory View (active_employees_directory)
-- Dibuat langsung tanpa DROP atau CASCADE (view belum ada pada database saat audit).
-- Exposes ONLY non-sensitive columns: id, full_name, normalized_name, employee_role, default_shift.
-- Kolom privat notes, created_at, dan updated_at sama sekali tidak diekspos ke publik.
-- Filter bawaan: where is_active = true.
-- Catatan: Sengaja TIDAK memakai security_invoker = true agar role anon dapat membaca
-- daftar direktori tanpa harus membuka akses RLS tabel master employee_profiles.
create or replace view public.active_employees_directory 
with (security_barrier = true) as
  select
    id,
    full_name,
    normalized_name,
    employee_role,
    default_shift
  from public.employee_profiles
  where is_active = true;

-- Pastikan kepemilikan view dipegang oleh role tepercaya (postgres / superuser)
alter view public.active_employees_directory owner to postgres;

-- Cabut seluruh hak bawaan dari pseudo-role PUBLIC pada view
revoke all on public.active_employees_directory from public;

-- Berikan HANYA hak SELECT kepada role anon dan authenticated
grant select on public.active_employees_directory to anon, authenticated;

-- 5. Revoke Excessive Table Grants from anon, PUBLIC, & authenticated (Least Privilege / Defense-in-Depth)
-- Tutup total seluruh default privilege berlebih pada tabel master dari public, anon, dan authenticated.
-- Catatan: service_role sengaja TIDAK dicabut agar Edge Function (submit-attendance) tetap berfungsi penuh.
revoke all on public.admin_profiles from public, anon, authenticated;
revoke all on public.attendance_settings from public, anon, authenticated;
revoke all on public.employee_profiles from public, anon, authenticated;
revoke all on public.attendance_records from public, anon, authenticated;
revoke all on public.attendance_audit_logs from public, anon, authenticated;

-- Grant hak minimum tabel ke authenticated (seluruh akses baris data dikunci oleh RLS)
-- Keamanan Khusus admin_profiles:
-- Hanya berikan SELECT dan UPDATE pada kolom nama/waktu (full_name, updated_at).
-- Kolom 'id' (primary key pengenal admin) TIDAK DIIZINKAN di-update oleh role apa pun.
-- Tidak ada hak INSERT/DELETE pada admin_profiles untuk authenticated (mencegah self-promotion).
grant select on public.admin_profiles to authenticated;
grant update (full_name, updated_at) on public.admin_profiles to authenticated;

grant select, insert, update on public.attendance_settings to authenticated;
grant select, insert, update, delete on public.employee_profiles to authenticated;
grant select, update on public.attendance_records to authenticated;
grant select, insert on public.attendance_audit_logs to authenticated;

-- 6. Enable Row Level Security (RLS) pada semua tabel
alter table public.admin_profiles enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_audit_logs enable row level security;
alter table public.attendance_settings enable row level security;
alter table public.employee_profiles enable row level security;

-- 7. Bersihkan Policy Permisif Lama & Policy Duplikat secara Eksplisit
-- A. attendance_settings: Hapus policy lama yang mengizinkan publik membaca settings
drop policy if exists "Allow anyone to read attendance settings" on public.attendance_settings;
drop policy if exists "Allow verified admins to update settings" on public.attendance_settings;
drop policy if exists "Allow authenticated admins to update settings" on public.attendance_settings;
drop policy if exists "Allow verified admins to manage settings" on public.attendance_settings;

-- B. employee_profiles: Hapus policy lama yang mengizinkan publik membaca data master
drop policy if exists "Allow anyone to read active employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to read all employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to insert employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to update employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to delete employee profiles" on public.employee_profiles;

-- C. admin_profiles: Hapus policy lama dan policy yang berpotensi self-insert
drop policy if exists "Allow verified admins to read profiles" on public.admin_profiles;
drop policy if exists "Allow authenticated admins to read profiles" on public.admin_profiles;
drop policy if exists "Allow users to read own profile or admin to read profiles" on public.admin_profiles;
drop policy if exists "Allow admins to insert/update their profile" on public.admin_profiles;
drop policy if exists "Allow admins to update their own profile" on public.admin_profiles;

-- D. attendance_records: Hapus policy lama termasuk policy insert anon langsung
drop policy if exists "Allow verified admins to select records" on public.attendance_records;
drop policy if exists "Allow authenticated admins to select records" on public.attendance_records;
drop policy if exists "Allow anon to insert attendance records" on public.attendance_records;
drop policy if exists "Allow verified admins to update records" on public.attendance_records;
drop policy if exists "Allow authenticated admins to update records" on public.attendance_records;
drop policy if exists "Allow authenticated admins to delete records" on public.attendance_records;

-- E. attendance_audit_logs: Hapus policy lama
drop policy if exists "Allow verified admins to view audit logs" on public.attendance_audit_logs;
drop policy if exists "Allow authenticated admins to view audit logs" on public.attendance_audit_logs;
drop policy if exists "Allow verified admins to insert audit logs" on public.attendance_audit_logs;
drop policy if exists "Allow authenticated admins to create audit logs" on public.attendance_audit_logs;

-- F. storage.objects: Pastikan tidak ada policy upload selfie langsung dari publik
drop policy if exists "Allow public upload selfies" on storage.objects;

-- 8. Buat Ulang Policy RLS yang Bersih, Non-Rekursif, dan Berbasis Admin

-- A. admin_profiles
-- Pengguna authenticated hanya dapat membaca profil dirinya sendiri, admin terverifikasi dapat membaca semua
create policy "Allow users to read own profile or admin to read profiles"
  on public.admin_profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- Admin hanya dapat memperbarui data dirinya sendiri (tidak bisa memodifikasi atau mengambil alih UID admin lain)
-- Baris terkunci pada id = auth.uid(), kolom terkunci hanya full_name & updated_at via grant
create policy "Allow admins to update their own profile"
  on public.admin_profiles for update
  to authenticated
  using (id = auth.uid() and public.is_admin())
  with check (id = auth.uid());

-- B. attendance_settings
-- Hanya admin terverifikasi yang dapat membaca, menambah, atau memperbarui pengaturan sistem
create policy "Allow verified admins to manage settings"
  on public.attendance_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- C. employee_profiles (Tabel Master dengan Kolom Rahasia 'notes')
-- Akses langsung tabel master 100% dikhususkan untuk admin terverifikasi
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

-- D. attendance_records
-- Pembacaan dan koreksi/review absensi hanya dapat dilakukan oleh admin terverifikasi
-- Insert baru ditangani secara eksklusif oleh Edge Function submit-attendance via service_role key
create policy "Allow verified admins to select records"
  on public.attendance_records for select
  to authenticated
  using (public.is_admin());

create policy "Allow verified admins to update records"
  on public.attendance_records for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- E. attendance_audit_logs
-- Audit log tidak dapat diubah (immutable), hanya dapat dibaca dan dibuat oleh admin terverifikasi
create policy "Allow verified admins to view audit logs"
  on public.attendance_audit_logs for select
  to authenticated
  using (public.is_admin());

create policy "Allow verified admins to create audit logs"
  on public.attendance_audit_logs for insert
  to authenticated
  with check (auth.uid() = admin_id and public.is_admin());
