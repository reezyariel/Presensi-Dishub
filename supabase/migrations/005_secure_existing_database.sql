-- ============================================================
-- ShiftTrack Migration 005: Secure Existing Database
-- Target: Live Supabase Database with Existing Production Data
-- Description:
--   Non-destructive security patch based on live database audit.
--   - Revokes broad anon/public table access.
--   - Hardens is_admin() and creates set_updated_at() trigger function safely.
--   - Creates public secure view active_employees_directory (owner: postgres).
--   - Drops permissive policies (e.g., Allow anyone to read active employee profiles).
--   - Enforces least privilege for authenticated admin roles.
--   - Preserves service_role access for submit-attendance Edge Function.
-- ============================================================

-- ============================================================
-- BAGIAN 0: QUERY PEMERIKSAAN PRASYARAT (JALANKAN SEBELUM MIGRATION)
-- Jalankan query berikut secara terpisah di Supabase SQL Editor
-- untuk memastikan database siap dan tidak ada data duplikat.
-- ============================================================
/*
  -- 1. Cek duplikasi nama pada tabel employee_profiles:
  SELECT normalized_name, employee_role, count(*)
  FROM public.employee_profiles
  GROUP BY normalized_name, employee_role
  HAVING count(*) > 1;
  -- Expected: 0 rows. Jika > 0, selesaikan data duplikat sebelum migrasi.

  -- 2. Cek duplikasi absensi pada tabel attendance_records:
  SELECT normalized_name, work_date, attendance_type, category, coalesce(shift, 'NONE'), count(*)
  FROM public.attendance_records
  GROUP BY normalized_name, work_date, attendance_type, category, coalesce(shift, 'NONE')
  HAVING count(*) > 1;
  -- Expected: 0 rows.

  -- 3. Cek keberadaan akun admin resmi:
  SELECT id, full_name, created_at FROM public.admin_profiles;
  -- Pastikan UID admin Anda sudah ada di sini.
*/

-- ============================================================
-- 1. HARDENING HELPER FUNCTION: public.is_admin()
-- Mencegah RLS recursion dan serangan Search Path Injection.
-- Menggunakan SECURITY DEFINER dengan search_path kosong terisolasi.
-- ============================================================
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

-- Cabut eksekusi dari PUBLIC dan anon (pengguna anonim tidak pernah menjadi admin)
revoke all on function public.is_admin() from public, anon;
-- Berikan hak eksekusi kepada authenticated agar RLS admin dapat mengevaluasinya
grant execute on function public.is_admin() to authenticated;

-- ============================================================
-- 2. TRIGGER FUNCTION: public.set_updated_at() & TRIGGER PADA employee_profiles
-- Database audit: public.set_updated_at() dan trigger belum ada di database live.
-- Catatan Keamanan:
-- - Sengaja TIDAK menggunakan SECURITY DEFINER karena fungsi ini hanya mengubah
--   record dalam memori (NEW.updated_at = pg_catalog.now()) dan tidak butuh hak elevated.
-- - Menggunakan set search_path = '' untuk mencegah search path spoofing.
-- ============================================================
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
-- Pada PostgreSQL, ketika admin melakukan UPDATE pada employee_profiles,
-- engine database memeriksa apakah caller memiliki hak EXECUTE pada trigger function.
grant execute on function public.set_updated_at() to authenticated;

-- Pasang trigger pada tabel employee_profiles (idempotent drop & create)
drop trigger if exists trg_employee_profiles_updated_at on public.employee_profiles;
create trigger trg_employee_profiles_updated_at
  before update on public.employee_profiles
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- 3. UNIQUE INDEXES (PROTEKSI DUPLIKASI TINGKAT DATABASE)
-- Idempotent: IF NOT EXISTS menjamin tidak gagal jika index sudah ada.
-- ============================================================
create unique index if not exists idx_unique_employee_role
  on public.employee_profiles(normalized_name, employee_role);

create unique index if not exists idx_unique_employee_attendance 
  on public.attendance_records(normalized_name, work_date, attendance_type, category, coalesce(shift, 'NONE'));

create index if not exists idx_employee_role on public.employee_profiles(employee_role);
create index if not exists idx_employee_active on public.employee_profiles(is_active);

-- ============================================================
-- 4. VIEW DIREKTORI PUBLIK AMAN: public.active_employees_directory
-- Dibuat langsung tanpa DROP CASCADE untuk menghindari penghapusan dependensi yang tidak disengaja.
-- Fitur Keamanan:
-- - Hanya mengekspos 5 kolom non-sensitif: id, full_name, normalized_name, employee_role, default_shift.
-- - Kolom privat 'notes', 'created_at', dan 'updated_at' 100% terlindung dan tidak diekspos.
-- - Filter bawaan: WHERE is_active = true.
-- - security_barrier = true mencegah leak via kueri fungsi optimasi optimizer.
-- - OWNER: postgres (Memungkinkan anon membaca view tanpa membuka tabel master employee_profiles).
-- ============================================================
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

-- Tetapkan kepemilikan view ke postgres
alter view public.active_employees_directory owner to postgres;

-- Cabut hak bawaan dari pseudo-role PUBLIC pada view
revoke all on public.active_employees_directory from public;

-- Berikan hak SELECT hanya kepada role anon dan authenticated
grant select on public.active_employees_directory to anon, authenticated;

-- ============================================================
-- 5. CABUT HAK AKSES BERLEBIH DARI anon & PUBLIC (LEAST PRIVILEGE)
-- Menutup total akses langsung role publik/anonim ke tabel master database.
-- Hak service_role SENGAJA TIDAK DICABUT agar Edge Function tetap berfungsi.
-- ============================================================
revoke all on public.admin_profiles from public, anon, authenticated;
revoke all on public.attendance_settings from public, anon, authenticated;
revoke all on public.employee_profiles from public, anon, authenticated;
revoke all on public.attendance_records from public, anon, authenticated;
revoke all on public.attendance_audit_logs from public, anon, authenticated;

-- Berikan kembali HANYA hak minimum yang dibutuhkan dashboard admin ke role authenticated:

-- A. admin_profiles:
-- Hanya SELECT dan UPDATE pada kolom nama/waktu (full_name, updated_at).
-- Kolom 'id' (primary key pengenal admin) TIDAK DIIZINKAN di-update.
-- Tidak ada hak INSERT/DELETE bagi authenticated (anti-self-promotion).
grant select on public.admin_profiles to authenticated;
grant update (full_name, updated_at) on public.admin_profiles to authenticated;

-- B. attendance_settings:
-- Diperlukan oleh SettingsSchedulePage.tsx untuk membaca dan memperbarui parameter.
grant select, insert, update on public.attendance_settings to authenticated;

-- C. employee_profiles:
-- Diperlukan oleh EmployeesPage.tsx untuk manajemen data pegawai.
grant select, insert, update, delete on public.employee_profiles to authenticated;

-- D. attendance_records:
-- Diperlukan oleh halaman review, recap, dan attendance list/detail.
-- Tidak ada hak INSERT atau DELETE (insert baru hanya via Edge Function submit-attendance).
grant select, update on public.attendance_records to authenticated;

-- E. attendance_audit_logs:
-- Diperlukan untuk membaca dan mencatat audit log (append-only, tidak ada UPDATE/DELETE).
grant select, insert on public.attendance_audit_logs to authenticated;

-- ============================================================
-- 6. PASTIKAN ROW LEVEL SECURITY (RLS) AKTIF PADA SEMUA TABEL
-- ============================================================
alter table public.admin_profiles enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_audit_logs enable row level security;
alter table public.attendance_settings enable row level security;
alter table public.employee_profiles enable row level security;

-- ============================================================
-- 7. PEMBERSIHAN POLICY LAMA & PERMISIF SECARA EKSPLISIT
-- Menghapus semua varian nama policy lama dari database hasil audit.
-- ============================================================

-- A. employee_profiles
-- Hapus policy publik yang membuka tabel master secara langsung:
drop policy if exists "Allow anyone to read active employee profiles" on public.employee_profiles;
-- Hapus policy admin lama untuk dibuat ulang secara terstandarisasi:
drop policy if exists "Allow admins to read all employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to insert employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to update employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to delete employee profiles" on public.employee_profiles;

-- B. attendance_settings
-- Hapus policy publik lama yang mengizinkan siapa pun membaca settings:
drop policy if exists "Allow anyone to read attendance settings" on public.attendance_settings;
drop policy if exists "Allow verified admins to update settings" on public.attendance_settings;
drop policy if exists "Allow authenticated admins to update settings" on public.attendance_settings;
drop policy if exists "Allow verified admins to manage settings" on public.attendance_settings;

-- C. admin_profiles
-- Hapus policy lama termasuk yang berpotensi self-insert:
drop policy if exists "Allow verified admins to read profiles" on public.admin_profiles;
drop policy if exists "Allow authenticated admins to read profiles" on public.admin_profiles;
drop policy if exists "Allow users to read own profile or admin to read profiles" on public.admin_profiles;
drop policy if exists "Allow admins to insert/update their profile" on public.admin_profiles;
drop policy if exists "Allow admins to update their own profile" on public.admin_profiles;

-- D. attendance_records
-- Hapus policy lama termasuk policy insert langsung dari anon:
drop policy if exists "Allow anon to insert attendance records" on public.attendance_records;
drop policy if exists "Allow verified admins to select records" on public.attendance_records;
drop policy if exists "Allow authenticated admins to select records" on public.attendance_records;
drop policy if exists "Allow verified admins to update records" on public.attendance_records;
drop policy if exists "Allow authenticated admins to update records" on public.attendance_records;
drop policy if exists "Allow authenticated admins to delete records" on public.attendance_records;

-- E. attendance_audit_logs
drop policy if exists "Allow verified admins to view audit logs" on public.attendance_audit_logs;
drop policy if exists "Allow authenticated admins to view audit logs" on public.attendance_audit_logs;
drop policy if exists "Allow verified admins to insert audit logs" on public.attendance_audit_logs;
drop policy if exists "Allow authenticated admins to create audit logs" on public.attendance_audit_logs;

-- F. storage.objects (Bucket selfies)
-- Audit live: Policy Storage yang aktif saat ini HANYA "Allow verified admins to read selfies" (SELECT).
-- Policy tersebut dipertahankan apa adanya (tanpa perubahan).
-- Pastikan tidak ada policy upload publik langsung ke storage:
drop policy if exists "Allow public upload selfies" on storage.objects;

-- ============================================================
-- 8. PEMBUATAN ULANG POLICY RLS YANG BERSIH, AMAN & BERBASIS ADMIN
-- ============================================================

-- A. employee_profiles
-- Akses tabel master 100% dikhususkan untuk admin terverifikasi:
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

-- B. admin_profiles
-- User membaca profil sendiri atau admin membaca seluruh profil:
create policy "Allow users to read own profile or admin to read profiles"
  on public.admin_profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- Admin hanya dapat mengupdate profilnya sendiri (UID terkunci):
create policy "Allow admins to update their own profile"
  on public.admin_profiles for update
  to authenticated
  using (id = auth.uid() and public.is_admin())
  with check (id = auth.uid());

-- C. attendance_settings
-- Pengaturan jadwal hanya dapat dibaca dan dikelola oleh admin:
create policy "Allow verified admins to manage settings"
  on public.attendance_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- D. attendance_records
-- Riwayat presensi hanya dapat dibaca dan dikoreksi oleh admin:
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
-- Log audit bersifat append-only:
create policy "Allow verified admins to view audit logs"
  on public.attendance_audit_logs for select
  to authenticated
  using (public.is_admin());

create policy "Allow verified admins to create audit logs"
  on public.attendance_audit_logs for insert
  to authenticated
  with check (auth.uid() = admin_id and public.is_admin());

-- ============================================================
-- BAGIAN 9: QUERY VERIFIKASI PASCA-MIGRATION
-- Jalankan query berikut sesudah migration untuk memastikan keamanan database.
-- ============================================================
/*
  -- 1. Verifikasi hak tabel role anon dan public:
  -- Harus hanya menampilkan hak SELECT pada public.active_employees_directory.
  -- TIDAK BOLEH ada hak tabel pada admin_profiles, attendance_records,
  -- attendance_settings, attendance_audit_logs, atau employee_profiles.
  SELECT grantee, table_name, privilege_type
  FROM information_schema.role_table_grants
  WHERE grantee IN ('anon', 'public')
    AND table_schema = 'public';

  -- 2. Verifikasi seluruh policy RLS yang aktif:
  SELECT tablename, policyname, roles, cmd
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, cmd;

  -- 3. Verifikasi view active_employees_directory dan owner-nya:
  SELECT table_name, view_definition
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name = 'active_employees_directory';

  -- 4. Verifikasi status trigger set_updated_at pada employee_profiles:
  SELECT event_object_table, trigger_name, action_statement
  FROM information_schema.triggers
  WHERE event_object_schema = 'public'
    AND event_object_table = 'employee_profiles';

  -- 5. Uji akses dropdown view sebagai role anon:
  SET ROLE anon;
  SELECT id, full_name, employee_role, default_shift FROM public.active_employees_directory LIMIT 5;
  -- Expected: Berhasil mengembalikan baris pegawai aktif.

  -- Uji akses terlarang ke tabel master sebagai role anon:
  SELECT * FROM public.employee_profiles LIMIT 1;
  -- Expected: Error permission denied for table employee_profiles.
  RESET ROLE;
*/
