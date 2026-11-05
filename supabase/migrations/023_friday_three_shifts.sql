-- ============================================================
-- Migration 023: Friday 3-Shift Schedule for SIPATEN
-- Adds shift_1_reguler, shift_1_panjang, shift_2_malam variants
-- Maintains full backward compatibility with historical records.
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
      'shift_1_reguler', 'shift_1_panjang', 'shift_2_malam'
    ) OR shift IS NULL
  );

-- 2. Widen default_shift check constraint on employee_profiles if present
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
          'shift_1_reguler', 'shift_1_panjang', 'shift_2_malam'
        ) OR default_shift IS NULL
      );
  END IF;
END $$;

-- 3. Update security_schedule in attendance_settings with 3 Friday shifts
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
            "shift_name": "Shift I",
            "label": "Shift I",
            "shift_number": 1,
            "in_start": "07:00",
            "in_end": "07:30",
            "out_start": "16:00",
            "out_end": "16:30",
            "out_next_day": false
          },
          {
            "id": "shift_2",
            "shift_name": "Shift II",
            "label": "Shift II",
            "shift_number": 2,
            "in_start": "15:00",
            "in_end": "15:30",
            "out_start": "19:30",
            "out_end": "20:00",
            "out_next_day": false
          },
          {
            "id": "shift_3",
            "shift_name": "Shift III",
            "label": "Shift III",
            "shift_number": 3,
            "in_start": "19:30",
            "in_end": "20:00",
            "out_start": "07:30",
            "out_end": "08:00",
            "out_next_day": true
          }
        ]
      },
      "friday": {
        "name": "Jumat",
        "days": [5],
        "shifts": [
          {
            "id": "shift_1_reguler",
            "shift_name": "shift_1_reguler",
            "label": "Shift I — Reguler",
            "shift_number": 1,
            "in_start": "07:00",
            "in_end": "07:30",
            "out_start": "16:00",
            "out_end": "16:30",
            "out_next_day": false
          },
          {
            "id": "shift_1_panjang",
            "shift_name": "shift_1_panjang",
            "label": "Shift I — Panjang (12 Jam)",
            "shift_number": 2,
            "in_start": "07:00",
            "in_end": "07:30",
            "out_start": "19:00",
            "out_end": "19:30",
            "out_next_day": false
          },
          {
            "id": "shift_2_malam",
            "shift_name": "shift_2_malam",
            "label": "Shift II — Malam",
            "shift_number": 3,
            "in_start": "19:00",
            "in_end": "19:30",
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
            "shift_name": "Shift I",
            "label": "Shift I — Pagi",
            "shift_number": 1,
            "in_start": "07:30",
            "in_end": "08:00",
            "out_start": "20:00",
            "out_end": "20:30",
            "out_next_day": false
          },
          {
            "id": "shift_2",
            "shift_name": "Shift II",
            "label": "Shift II — Malam",
            "shift_number": 2,
            "in_start": "20:00",
            "in_end": "20:30",
            "out_start": "07:30",
            "out_end": "08:00",
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
        "end": "07:30",
        "end_window_end": "08:00",
        "end_next_day": true,
        "end_window_end_next_day": true
      }
    }
  }'::jsonb,
  'Jadwal Security: Jumat diperbarui ke 3 varian shift (Shift I Reguler: 07:00–16:00, Shift I Panjang: 07:00–19:00, Shift II Malam: 19:00–07:00 H+1). Senin–Kamis dan Akhir Pekan tetap.',
  now()
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = now();
