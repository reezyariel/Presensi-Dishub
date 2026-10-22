-- ============================================================
-- SIPATEN — Database Schema Migration
-- Version: 1.2 (Security-Definer Admin Architecture & Hardened RLS)
-- ============================================================

-- 1. Enable UUID Extension
create extension if not exists "uuid-ossp";

-- 2. Admin Profiles Table (linked with Supabase Auth users)
create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Attendance Records Table
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  normalized_name text not null,
  category text not null check (category in ('CS', 'Security')),
  attendance_type text not null check (attendance_type in ('masuk', 'istirahat', 'pulang')),
  shift text check (shift in ('Shift I', 'Shift II', 'Shift III')),
  work_date date not null,
  recorded_at timestamptz not null default now(),
  scheduled_start text,
  scheduled_end text,
  attendance_status text not null default 'tepat_waktu' check (attendance_status in ('tepat_waktu', 'terlambat')),
  late_minutes integer not null default 0,
  selfie_storage_path text not null,
  review_status text not null default 'belum_diperiksa' check (review_status in ('belum_diperiksa', 'sudah_diperiksa', 'perlu_tindak_lanjut')),
  admin_notes text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Attendance Audit Logs Table (Tamper-evident trail for admin interventions)
create table if not exists public.attendance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid references public.attendance_records(id) on delete set null,
  admin_id uuid not null references public.admin_profiles(id) on delete cascade,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);

-- 5. Attendance Settings Table (Configurable operational parameters)
create table if not exists public.attendance_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null,
  description text,
  updated_by uuid references public.admin_profiles(id),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Indexes for Performance & Duplicate Protection
-- ============================================================
create index if not exists idx_attendance_work_date on public.attendance_records(work_date);
create index if not exists idx_attendance_category on public.attendance_records(category);
create index if not exists idx_attendance_review_status on public.attendance_records(review_status);
create index if not exists idx_attendance_recorded_at on public.attendance_records(recorded_at desc);
create index if not exists idx_attendance_employee_name on public.attendance_records(employee_name);
create index if not exists idx_attendance_idempotency on public.attendance_records(idempotency_key);
create index if not exists idx_audit_logs_record on public.attendance_audit_logs(attendance_record_id);
create index if not exists idx_audit_logs_created_at on public.attendance_audit_logs(created_at desc);

-- Database-Level Constraint: Prevent Duplicate Submissions for the Same Employee, Date, Category, and Shift/Type
create unique index if not exists idx_unique_employee_attendance 
  on public.attendance_records(normalized_name, work_date, attendance_type, category, coalesce(shift, 'NONE'));

-- ============================================================
-- Seed Initial Settings
-- ============================================================
insert into public.attendance_settings (setting_key, setting_value, description)
values
  ('grace_period_minutes', '0'::jsonb, 'Toleransi keterlambatan dalam menit (0 = tanpa toleransi)'),
  ('selfie_signed_url_duration_seconds', '3600'::jsonb, 'Masa berlaku URL foto selfie privat dalam detik (default: 1 jam)'),
  ('auto_flag_out_of_window', 'true'::jsonb, 'Tandai otomatis sebagai perlu tindak lanjut bila di luar jendela waktu absensi')
on conflict (setting_key) do nothing;

-- ============================================================
-- Security Definer Role Checker (Prevents RLS Infinite Recursion)
-- ============================================================
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

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table public.admin_profiles enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_audit_logs enable row level security;
alter table public.attendance_settings enable row level security;

-- ------------------------------------------------------------
-- 1. Policies: admin_profiles
-- ------------------------------------------------------------
-- Non-recursive policy: users can read their own profile, or verified admins can read
create policy "Allow users to read own profile or admin to read profiles"
  on public.admin_profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "Allow admins to update their own profile"
  on public.admin_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ------------------------------------------------------------
-- 2. Policies: attendance_records
-- ------------------------------------------------------------
-- Public (anon) is NOT allowed direct INSERT via client.
-- Submissions are handled exclusively by submit-attendance Edge Function using service role key.
-- Verified admins can SELECT attendance records
create policy "Allow verified admins to select records"
  on public.attendance_records for select
  to authenticated
  using (public.is_admin());

-- Verified admins can UPDATE records for correction or review
create policy "Allow verified admins to update records"
  on public.attendance_records for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy is defined: attendance records cannot be deleted by anyone (tamper-proof)

-- ------------------------------------------------------------
-- 3. Policies: attendance_audit_logs
-- ------------------------------------------------------------
-- Verified admins can SELECT audit logs
create policy "Allow verified admins to view audit logs"
  on public.attendance_audit_logs for select
  to authenticated
  using (public.is_admin());

-- Verified admins can INSERT audit logs (enforcing admin_id = auth.uid())
create policy "Allow verified admins to insert audit logs"
  on public.attendance_audit_logs for insert
  to authenticated
  with check (
    auth.uid() = admin_id
    and public.is_admin()
  );

-- No UPDATE or DELETE policy is defined: audit logs are strictly append-only (immutable)

-- ------------------------------------------------------------
-- 4. Policies: attendance_settings
-- ------------------------------------------------------------
-- Anyone (anon and authenticated) can read operational settings (e.g. grace period)
create policy "Allow anyone to read attendance settings"
  on public.attendance_settings for select
  to anon, authenticated
  using (true);

-- Only verified admins can modify settings
create policy "Allow verified admins to update settings"
  on public.attendance_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Supabase Storage Bucket Setup for Selfies (Private)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('selfies', 'selfies', false)
on conflict (id) do nothing;

-- Storage Policy: Direct public upload is DISABLED.
-- Uploads are handled exclusively by the submit-attendance Edge Function with server-side validation.

-- Storage Policy: Only verified admins can view/download selfies via Signed URLs
create policy "Allow verified admins to read selfies"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'selfies'
    and public.is_admin()
  );
