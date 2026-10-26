-- ============================================================
-- Migration 015: Allow Security Weekend Sessions ('Sesi Pagi', 'Sesi Malam')
-- SIPATEN Attendance System
-- ============================================================

-- 1. Update attendance_records shift check constraint to include weekend sessions
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_shift_check;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_shift_check
  CHECK (shift IN ('Shift I', 'Shift II', 'Shift III', 'Sesi Pagi', 'Sesi Malam') OR shift IS NULL);

-- 2. Safely widen employee_profiles default_shift check constraint if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'employee_profiles_default_shift_check'
      AND table_name = 'employee_profiles'
  ) THEN
    ALTER TABLE public.employee_profiles DROP CONSTRAINT employee_profiles_default_shift_check;
    ALTER TABLE public.employee_profiles ADD CONSTRAINT employee_profiles_default_shift_check
      CHECK (default_shift IN ('Shift I', 'Shift II', 'Shift III', 'Sesi Pagi', 'Sesi Malam') OR default_shift IS NULL);
  END IF;
END $$;

COMMENT ON CONSTRAINT attendance_records_shift_check ON public.attendance_records IS 
  'Valid Security shifts: Shift I, Shift II, Shift III (weekday) or Sesi Pagi, Sesi Malam (weekend)';
