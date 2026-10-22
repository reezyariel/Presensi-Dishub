-- ============================================================
-- SIPATEN Migration 003: Employee Profiles & Secure Directory View
-- Tabel untuk menyimpan data karyawan CS dan Security
-- Non-destructive: tidak mengubah tabel yang sudah ada
-- ============================================================

-- 1. Employee Profiles Table
create table if not exists public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  normalized_name text not null,
  employee_role text not null check (employee_role in ('CS', 'Security')),
  default_shift text check (default_shift in ('Shift I', 'Shift II', 'Shift III')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate names per role
create unique index if not exists idx_unique_employee_role
  on public.employee_profiles(normalized_name, employee_role);

create index if not exists idx_employee_role on public.employee_profiles(employee_role);
create index if not exists idx_employee_active on public.employee_profiles(is_active);

-- 2. Trigger updated_at otomatis
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

drop trigger if exists trg_employee_profiles_updated_at on public.employee_profiles;
create trigger trg_employee_profiles_updated_at
  before update on public.employee_profiles
  for each row
  execute function public.set_updated_at();

-- 3. Enable RLS pada tabel master
alter table public.employee_profiles enable row level security;

-- Drop previous policies if re-running
drop policy if exists "Allow anyone to read active employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to read all employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to insert employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to update employee profiles" on public.employee_profiles;
drop policy if exists "Allow admins to delete employee profiles" on public.employee_profiles;

-- RLS Policies pada tabel master employee_profiles:
-- Hanya Admin terverifikasi yang dapat mengakses tabel master ini secara langsung (termasuk kolom notes sensitif)
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

-- 4. View Direktori Publik Aman (Tanpa Kolom notes / Informasi Rahasia)
-- Digunakan oleh portal publik CS & Security untuk dropdown nama tanpa membocorkan kontak/notes
-- Catatan Keamanan: View ini sengaja TIDAK menggunakan security_invoker = true agar role anon
-- dapat membaca daftar nama aktif tanpa harus membuka akses RLS tabel master employee_profiles.
create or replace view public.active_employees_directory with (security_barrier = true) as
  select
    id,
    full_name,
    normalized_name,
    employee_role,
    default_shift
  from public.employee_profiles
  where is_active = true;

-- Cabut seluruh hak akses default dari pseudo-role PUBLIC pada view
revoke all on public.active_employees_directory from public;

-- Berikan hanya hak SELECT kepada role yang memang diperlukan (anon dan authenticated)
grant select on public.active_employees_directory to anon, authenticated;

-- Pastikan tabel master tetap tertutup dari akses langsung role anon
revoke all on public.employee_profiles from anon;
