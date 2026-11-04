-- ============================================================
-- SIPATEN Migration 022: Cleaning Service (CS) Daily Attendance Summary View
-- Dokumentasi & Representasi Agregasi Harian CS (1 Baris Per Pegawai Per Tanggal Kerja)
-- Non-destructive: tidak mengubah tabel atau data historis yang sudah ada.
-- ============================================================

CREATE OR REPLACE VIEW public.cs_daily_attendance_summary AS
SELECT
  -- Composite primary key identifier
  COALESCE(ar.employee_profile_id::text, ar.normalized_name, lower(trim(ar.employee_name))) || '_' || ar.work_date::text AS id,
  COALESCE(ar.employee_profile_id::text, ar.normalized_name, lower(trim(ar.employee_name))) AS employee_id,
  ar.employee_name,
  ar.normalized_name,
  ar.employee_profile_id,
  'CS'::text AS category,
  ar.work_date,

  -- Transaksi Masuk
  MAX(CASE WHEN ar.attendance_type = 'masuk' THEN ar.id END) AS masuk_record_id,
  MAX(CASE WHEN ar.attendance_type = 'masuk' THEN ar.recorded_at END) AS masuk_time,
  MAX(CASE WHEN ar.attendance_type = 'masuk' THEN ar.attendance_status END) AS masuk_status,
  MAX(CASE WHEN ar.attendance_type = 'masuk' THEN ar.late_minutes END) AS masuk_late_minutes,
  MAX(CASE WHEN ar.attendance_type = 'masuk' THEN ar.selfie_storage_path END) AS masuk_selfie_path,

  -- Transaksi Istirahat
  MAX(CASE WHEN ar.attendance_type = 'istirahat' THEN ar.id END) AS istirahat_record_id,
  MAX(CASE WHEN ar.attendance_type = 'istirahat' THEN ar.recorded_at END) AS istirahat_time,
  MAX(CASE WHEN ar.attendance_type = 'istirahat' THEN ar.attendance_status END) AS istirahat_status,
  MAX(CASE WHEN ar.attendance_type = 'istirahat' THEN ar.selfie_storage_path END) AS istirahat_selfie_path,

  -- Transaksi Pulang
  MAX(CASE WHEN ar.attendance_type = 'pulang' THEN ar.id END) AS pulang_record_id,
  MAX(CASE WHEN ar.attendance_type = 'pulang' THEN ar.recorded_at END) AS pulang_time,
  MAX(CASE WHEN ar.attendance_type = 'pulang' THEN ar.attendance_status END) AS pulang_status,
  MAX(CASE WHEN ar.attendance_type = 'pulang' THEN ar.selfie_storage_path END) AS pulang_selfie_path,

  -- Agregasi Ketepatan Waktu: Jika salah satu terlambat, maka keseluruhan terlambat
  CASE
    WHEN BOOL_OR(ar.attendance_status = 'terlambat') THEN 'terlambat'
    ELSE 'tepat_waktu'
  END AS overall_attendance_status,

  -- Agregasi Status Review
  CASE
    WHEN BOOL_OR(ar.review_status = 'perlu_tindak_lanjut') THEN 'perlu_tindak_lanjut'
    WHEN BOOL_OR(ar.review_status = 'belum_diperiksa') THEN 'belum_diperiksa'
    ELSE 'sudah_diperiksa'
  END AS overall_review_status,

  COALESCE(SUM(ar.late_minutes), 0)::integer AS total_late_minutes,
  COUNT(ar.id)::integer AS total_transactions

FROM public.attendance_records ar
WHERE ar.category = 'CS'
GROUP BY
  COALESCE(ar.employee_profile_id::text, ar.normalized_name, lower(trim(ar.employee_name))),
  ar.employee_name,
  ar.normalized_name,
  ar.employee_profile_id,
  ar.work_date;

-- Komentar view
COMMENT ON VIEW public.cs_daily_attendance_summary IS 'Ringkasan presensi harian Cleaning Service (CS) menggabungkan transaksi Masuk, Istirahat, dan Pulang dalam 1 baris per pegawai per tanggal.';
