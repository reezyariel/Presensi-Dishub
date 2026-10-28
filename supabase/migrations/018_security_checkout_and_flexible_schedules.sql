-- ============================================================
-- Migration 018: Security Check-Out Support, Check-In Linking & Flexible Schedules
-- SIPATEN Attendance System
-- ============================================================

-- 1. Add check_in_record_id column to attendance_records to link pulang to masuk
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS check_in_record_id uuid REFERENCES public.attendance_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_check_in_record_id
  ON public.attendance_records(check_in_record_id);

-- 2. Add partial unique index to prevent duplicate checkout for the same check-in record
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_security_checkout
  ON public.attendance_records(check_in_record_id)
  WHERE check_in_record_id IS NOT NULL;

-- 3. Widen shift check constraint on attendance_records to support 'Shift 1', 'Shift 2', 'Shift 3' alongside Roman numerals
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_shift_check;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_shift_check
  CHECK (
    shift IN (
      'Shift 1', 'Shift 2', 'Shift 3',
      'Shift I', 'Shift II', 'Shift III',
      'Sesi Pagi', 'Sesi Malam'
    ) OR shift IS NULL
  );

-- 4. Widen default_shift check constraint on employee_profiles if present
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
          'Sesi Pagi', 'Sesi Malam'
        ) OR default_shift IS NULL
      );
  END IF;
END $$;

-- 5. Seed updated default security_schedule in attendance_settings
-- Schedules:
-- Senin–Kamis:
--   Shift 1: masuk 07.00–07.30, pulang 16.00–16.30 (same day)
--   Shift 2: masuk 15.00–15.30, pulang 19.30–20.00 (same day)
--   Shift 3: masuk 19.30–20.00, pulang 07.00–07.30 (next day)
-- Jumat:
--   Shift 1: masuk 07.30–08.00, pulang 19.00–19.30 (same day)
--   Shift 2: masuk 19.30–20.00, pulang 07.00–07.30 (next day)
-- Sabtu–Minggu:
--   Shift 1: masuk 07.30–08.00, pulang 19.00–19.30 (same day)
--   Shift 2: masuk 19.30–20.00, pulang 07.00–07.30 (next day)
INSERT INTO public.attendance_settings (setting_key, setting_value, description, updated_at)
VALUES (
  'security_schedule',
  '{
    "day_groups": {
      "mon_thu": {
        "name": "Senin – Kamis",
        "days": [1, 2, 3, 4],
        "shifts": [
          {
            "id": "shift_1",
            "shift_name": "Shift 1",
            "shift_number": 1,
            "in_start": "07:00",
            "in_end": "07:30",
            "out_start": "16:00",
            "out_end": "16:30",
            "out_next_day": false
          },
          {
            "id": "shift_2",
            "shift_name": "Shift 2",
            "shift_number": 2,
            "in_start": "15:00",
            "in_end": "15:30",
            "out_start": "19:30",
            "out_end": "20:00",
            "out_next_day": false
          },
          {
            "id": "shift_3",
            "shift_name": "Shift 3",
            "shift_number": 3,
            "in_start": "19:30",
            "in_end": "20:00",
            "out_start": "07:00",
            "out_end": "07:30",
            "out_next_day": true
          }
        ]
      },
      "friday": {
        "name": "Jumat",
        "days": [5],
        "shifts": [
          {
            "id": "shift_1",
            "shift_name": "Shift 1",
            "shift_number": 1,
            "in_start": "07:30",
            "in_end": "08:00",
            "out_start": "19:00",
            "out_end": "19:30",
            "out_next_day": false
          },
          {
            "id": "shift_2",
            "shift_name": "Shift 2",
            "shift_number": 2,
            "in_start": "19:30",
            "in_end": "20:00",
            "out_start": "07:00",
            "out_end": "07:30",
            "out_next_day": true
          }
        ]
      },
      "weekend": {
        "name": "Sabtu – Minggu",
        "days": [6, 0],
        "shifts": [
          {
            "id": "shift_1",
            "shift_name": "Shift 1",
            "shift_number": 1,
            "in_start": "07:30",
            "in_end": "08:00",
            "out_start": "19:00",
            "out_end": "19:30",
            "out_next_day": false
          },
          {
            "id": "shift_2",
            "shift_name": "Shift 2",
            "shift_number": 2,
            "in_start": "19:30",
            "in_end": "20:00",
            "out_start": "07:00",
            "out_end": "07:30",
            "out_next_day": true
          }
        ]
      }
    },
    "thursday_friday_shift_minutes": 0,
    "shifts": {
      "Shift I": {
        "start": "07:00",
        "window_end": "07:30",
        "end": "16:00",
        "end_window_end": "16:30",
        "end_next_day": false,
        "end_window_end_next_day": false
      },
      "Shift II": {
        "start": "15:00",
        "window_end": "15:30",
        "end": "19:30",
        "end_window_end": "20:00",
        "end_next_day": false,
        "end_window_end_next_day": false
      },
      "Shift III": {
        "start": "19:30",
        "window_end": "20:00",
        "end": "07:00",
        "end_window_end": "07:30",
        "end_next_day": true,
        "end_window_end_next_day": true
      }
    }
  }'::jsonb,
  'Jadwal Security: Senin-Kamis (3 shift), Jumat (2 shift), dan Sabtu-Minggu (2 shift). Jam merupakan rentang waktu absensi resmi.',
  now()
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = now();
