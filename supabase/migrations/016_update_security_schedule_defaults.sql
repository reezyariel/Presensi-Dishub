-- ============================================================
-- Migration 016: Update Security schedule defaults and add security_weekend_schedule
-- SIPATEN Attendance System
-- ============================================================

-- 1. Insert or update default security_weekend_schedule in public.attendance_settings
INSERT INTO public.attendance_settings (setting_key, setting_value, description, updated_at)
VALUES (
  'security_weekend_schedule',
  '{
    "sesi_pagi":  { "open": "08:00", "close": "08:30" },
    "sesi_malam": { "open": "20:00", "close": "20:30" }
  }'::jsonb,
  'Jadwal Security akhir pekan (Sabtu & Minggu). Sesi Pagi: 08.00–08.30, Sesi Malam: 20.00–20.30 WIB.',
  now()
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = now();

-- 2. Update default security_schedule (Senin–Jumat) in public.attendance_settings
-- Shift I masuk: 07:00–07:30
-- Shift II masuk: 16:00–16:30
-- Shift III masuk: 20:00–20:30
UPDATE public.attendance_settings
SET setting_value = '{
  "thursday_friday_shift_minutes": 30,
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
      "start": "16:00",
      "window_end": "16:30",
      "end": "20:00",
      "end_window_end": "20:30",
      "end_next_day": false,
      "end_window_end_next_day": false
    },
    "Shift III": {
      "start": "20:00",
      "window_end": "20:30",
      "end": "07:30",
      "end_window_end": "08:00",
      "end_next_day": true,
      "end_window_end_next_day": true
    }
  }
}'::jsonb,
updated_at = now()
WHERE setting_key = 'security_schedule';
