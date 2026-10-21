-- ============================================================
-- Migration: Audit & Fix CS attendance_status di database
-- 
-- Latar belakang:
--   Edge function versi lama (sebelum commit fix) selalu menyimpan
--   attendance_status='tepat_waktu' untuk semua CS tanpa memeriksa
--   waktu check-in. Versi baru (setelah commit ini) menggunakan:
--     - masuk pada atau sebelum 08:00 WIB -> tepat_waktu
--     - masuk setelah 08:00 WIB          -> terlambat
--
-- Langkah 1: AUDIT (lihat dulu record mana yang akan diubah)
-- ============================================================

-- A. Record CS yang tercatat 'terlambat' tapi check-in sebenarnya <= 08:00 WIB
--    (ini yang salah dari versi edge function lama - seharusnya TIDAK ADA,
--     karena versi lama selalu tepat_waktu; tapi jika ada, tampilkan di sini)
SELECT
  id,
  employee_name,
  work_date,
  attendance_type,
  attendance_status,
  late_minutes,
  (recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::time AS jam_jakarta
FROM attendance_records
WHERE
  category = 'CS'
  AND attendance_type = 'masuk'
  AND attendance_status = 'terlambat'
  AND (recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::time <= '08:00:00'
ORDER BY work_date DESC;

-- B. Record CS yang tercatat 'tepat_waktu' tapi check-in sebenarnya > 08:00 WIB
--    (ini yang salah - harusnya terlambat tapi disimpan tepat_waktu oleh edge lama)
SELECT
  id,
  employee_name,
  work_date,
  attendance_type,
  attendance_status,
  late_minutes,
  (recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::time AS jam_jakarta,
  EXTRACT(EPOCH FROM ((recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::time - '08:00:00'::time)) / 60 AS menit_terlambat_seharusnya
FROM attendance_records
WHERE
  category = 'CS'
  AND attendance_type = 'masuk'
  AND attendance_status = 'tepat_waktu'
  AND (recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::time > '08:00:00'
ORDER BY work_date DESC;

-- ============================================================
-- Langkah 2: PERBAIKAN (jalankan hanya setelah mengaudit hasil di atas)
-- ============================================================

-- Fix A: Ubah record CS yang 'terlambat' padahal check-in <= 08:00 WIB
--        menjadi 'tepat_waktu' dengan late_minutes=0
-- (Uncomment baris di bawah ini setelah memverifikasi hasil SELECT di atas)
/*
UPDATE attendance_records
SET
  attendance_status = 'tepat_waktu',
  late_minutes      = 0
WHERE
  category = 'CS'
  AND attendance_type = 'masuk'
  AND attendance_status = 'terlambat'
  AND (recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::time <= '08:00:00';
*/

-- Fix B: Ubah record CS yang 'tepat_waktu' padahal check-in > 08:00 WIB
--        menjadi 'terlambat' dengan late_minutes yang benar
-- (Uncomment baris di bawah ini setelah memverifikasi hasil SELECT di atas)
/*
UPDATE attendance_records
SET
  attendance_status = 'terlambat',
  late_minutes = EXTRACT(EPOCH FROM (
    (recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::time - '08:00:00'::time
  )) / 60
WHERE
  category = 'CS'
  AND attendance_type = 'masuk'
  AND attendance_status = 'tepat_waktu'
  AND (recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::time > '08:00:00';
*/
