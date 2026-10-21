-- ============================================================
-- Migration: Fix CS late status in attendance_records
-- CS policy: check-in during 07:00-08:00 is always tepat_waktu.
-- Any existing CS records with attendance_status = 'terlambat'
-- were written by an older version of the edge function and must
-- be corrected to 'tepat_waktu' with late_minutes = 0.
-- ============================================================

UPDATE attendance_records
SET
  attendance_status = 'tepat_waktu',
  late_minutes      = 0
WHERE
  category = 'CS'
  AND attendance_status = 'terlambat';

-- Verify result
SELECT
  id,
  employee_name,
  work_date,
  attendance_type,
  attendance_status,
  late_minutes
FROM attendance_records
WHERE category = 'CS'
ORDER BY work_date DESC, recorded_at DESC
LIMIT 20;
