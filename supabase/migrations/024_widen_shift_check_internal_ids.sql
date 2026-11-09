-- ============================================================
-- Migration 024: Widen shift check constraint for internal IDs
-- Supports internal shift IDs ('shift_1', 'shift_2', 'shift_3')
-- alongside existing Roman numerals, textual names, and Friday variants.
-- ============================================================

-- 1. Widen shift check constraint on attendance_records
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_shift_check;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_shift_check
  CHECK (
    shift IN (
      'Shift 1', 'Shift 2', 'Shift 3',
      'Shift I', 'Shift II', 'Shift III',
      'Sesi Pagi', 'Sesi Malam',
      'shift_1_reguler', 'shift_1_panjang', 'shift_2_malam',
      'shift_1', 'shift_2', 'shift_3'
    ) OR shift IS NULL
  );

-- 2. Safely widen default_shift check constraint on employee_profiles if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'employee_profiles_default_shift_check'
      AND table_name = 'employee_profiles'
  ) THEN
    ALTER TABLE public.employee_profiles DROP CONSTRAINT employee_profiles_default_shift_check;
    ALTER TABLE public.employee_profiles ADD CONSTRAINT employee_profiles_default_shift_check
      CHECK (
        default_shift IN (
          'Shift 1', 'Shift 2', 'Shift 3',
          'Shift I', 'Shift II', 'Shift III',
          'Sesi Pagi', 'Sesi Malam',
          'shift_1_reguler', 'shift_1_panjang', 'shift_2_malam',
          'shift_1', 'shift_2', 'shift_3'
        ) OR default_shift IS NULL
      );
  END IF;
END $$;

COMMENT ON CONSTRAINT attendance_records_shift_check ON public.attendance_records IS 
  'Validates shift column supports legacy labels, Friday variants, and internal IDs (shift_1, shift_2, shift_3)';
