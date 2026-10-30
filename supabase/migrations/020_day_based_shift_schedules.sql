-- ============================================================
-- Migration 020: Day-Based Shift Schedules for SIPATEN
-- Schedules by day in Asia/Jakarta:
--   Senin–Kamis (3 Shift):
--     Shift I:   07:00–16:00 (Check-In: 07:00–07:30, Check-Out: 16:00–16:30)
--     Shift II:  16:00–19:30 (Check-In: 16:00–16:30, Check-Out: 19:30–20:00)
--     Shift III: 19:30–07:00 (Check-In: 19:30–20:00, Check-Out: 07:00–07:30 H+1)
--   Jumat (2 Shift):
--     Shift I:   07:30–19:30 (Check-In: 07:30–08:00, Check-Out: 19:30–20:00)
--     Shift II:  19:30–07:30 (Check-In: 19:30–20:00, Check-Out: 07:30–08:00 H+1)
--   Sabtu–Minggu (2 Shift):
--     Shift I (Pagi):   08:00–20:00 (Check-In: 08:00–08:30, Check-Out: 20:00–20:30)
--     Shift II (Malam): 20:00–08:00 (Check-In: 20:00–20:30, Check-Out: 08:00–08:30 H+1)
-- ============================================================

-- 1. Insert / update security_schedule with authoritative day_groups
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
            "in_start": "16:00",
            "in_end": "16:30",
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
            "shift_name": "Shift I",
            "label": "Shift I",
            "shift_number": 1,
            "in_start": "07:30",
            "in_end": "08:00",
            "out_start": "19:30",
            "out_end": "20:00",
            "out_next_day": false
          },
          {
            "id": "shift_2",
            "shift_name": "Shift II",
            "label": "Shift II",
            "shift_number": 2,
            "in_start": "19:30",
            "in_end": "20:00",
            "out_start": "07:30",
            "out_end": "08:00",
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
            "in_start": "08:00",
            "in_end": "08:30",
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
            "out_start": "08:00",
            "out_end": "08:30",
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
        "start": "16:00",
        "window_end": "16:30",
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
  'Jadwal Security: Senin–Kamis (3 Shift, Shift II mulai 16:00), Jumat (2 Shift), dan Akhir Pekan (2 Shift Pagi & Malam).',
  now()
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = now();

-- 2. Update security_weekend_schedule
INSERT INTO public.attendance_settings (setting_key, setting_value, description, updated_at)
VALUES (
  'security_weekend_schedule',
  '{
    "sesi_pagi":  { "open": "08:00", "close": "08:30", "out_start": "20:00", "out_end": "20:30" },
    "sesi_malam": { "open": "20:00", "close": "20:30", "out_start": "08:00", "out_end": "08:30" }
  }'::jsonb,
  'Jadwal Security akhir pekan (Sabtu & Minggu). Sesi Pagi: 08.00–08.30 (Pulang 20.00–20.30), Sesi Malam: 20.00–20.30 (Pulang 08.00–08.30 H+1).',
  now()
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = now();
