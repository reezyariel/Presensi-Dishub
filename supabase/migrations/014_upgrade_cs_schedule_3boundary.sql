-- ============================================================
-- Migration 014: Upgrade cs_schedule to 3-boundary masuk system
-- 
-- Schema baru untuk masuk CS:
--   open            = waktu tombol mulai aktif
--   ontime_deadline = batas tepat_waktu (inklusif)
--   close           = waktu tutup jendela
-- ============================================================

-- 1. Lihat nilai saat ini
SELECT setting_key, setting_value, updated_at
FROM attendance_settings
WHERE setting_key = 'cs_schedule';

-- 2. Update ke schema baru
UPDATE attendance_settings
SET
  setting_value = jsonb_set(
    jsonb_set(
      jsonb_set(
        setting_value,
        '{masuk}',
        jsonb_build_object(
          'open',             '07:30',
          'ontime_deadline',  '08:00',
          'close',            '11:59'
        )
      ),
      '{istirahat}',
      jsonb_build_object('start', '12:00', 'end', '14:00')
    ),
    '{pulang}',
    jsonb_build_object('start', '16:00', 'end', '18:00')
  ),
  description = 'Jadwal CS: masuk pakai sistem 3-batas (open/ontime_deadline/close). Istirahat dan pulang tetap start/end.',
  updated_at  = now()
WHERE setting_key = 'cs_schedule';

-- 3. Verifikasi
SELECT setting_key, setting_value, updated_at
FROM attendance_settings
WHERE setting_key = 'cs_schedule';
