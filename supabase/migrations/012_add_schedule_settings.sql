-- ============================================================
-- Migration 012: Add editable cs_schedule and security_schedule
-- to attendance_settings as authoritative source of truth.
-- Inserts defaults if not already present.
-- ============================================================

-- Insert default CS schedule (window-based: any check-in within window = tepat_waktu)
INSERT INTO public.attendance_settings (setting_key, setting_value, description, updated_at)
VALUES (
  'cs_schedule',
  '{
    "masuk":     { "start": "07:00", "end": "08:00" },
    "istirahat": { "start": "12:00", "end": "14:00" },
    "pulang":    { "start": "16:00", "end": "18:00" }
  }'::jsonb,
  'Jadwal CS: jendela waktu masuk/istirahat/pulang. CS tidak terlambat selama dalam jendela [start, end].',
  now()
)
ON CONFLICT (setting_key) DO NOTHING;

-- Insert default Security schedule (3-shift rotation)
INSERT INTO public.attendance_settings (setting_key, setting_value, description, updated_at)
VALUES (
  'security_schedule',
  '{
    "thursday_friday_shift_minutes": 30,
    "shifts": {
      "Shift I": {
        "start": "07:30", "window_end": "08:00",
        "end": "16:00", "end_window_end": "16:30",
        "end_next_day": false, "end_window_end_next_day": false
      },
      "Shift II": {
        "start": "16:00", "window_end": "16:30",
        "end": "20:00", "end_window_end": "20:30",
        "end_next_day": false, "end_window_end_next_day": false
      },
      "Shift III": {
        "start": "20:00", "window_end": "20:30",
        "end": "07:30", "end_window_end": "08:00",
        "end_next_day": true, "end_window_end_next_day": true
      }
    }
  }'::jsonb,
  'Jadwal Security 3 shift 24 jam. Kamis/Jumat bergeser +30 menit dari jam dasar.',
  now()
)
ON CONFLICT (setting_key) DO NOTHING;
