-- ============================================================
-- Migration 013: Add atomic admin_delete_attendance_record RPC
-- 
-- Tujuan: Menggantikan alur delete 2-langkah di frontend dengan
-- satu RPC function yang atomik (audit log + delete dalam 1 tx).
--
-- Keamanan:
--   - Hanya bisa dipanggil oleh authenticated admin (is_admin())
--   - admin_id diambil dari auth.uid() langsung (tidak dari frontend)
--   - Jika audit log gagal, delete dibatalkan (transactional)
--   - SECURITY DEFINER untuk bypass RLS pada operasi internal,
--     tapi tetap memvalidasi is_admin() di awal
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_attendance_record(
  p_record_id   uuid,
  p_reason      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_uid    uuid;
  v_record       attendance_records%ROWTYPE;
  v_audit_id     uuid;
BEGIN
  -- 1. Verifikasi caller adalah admin terautentikasi
  v_admin_uid := auth.uid();
  
  IF v_admin_uid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error', 'Anda harus login terlebih dahulu.'
    );
  END IF;

  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_ADMIN',
      'error', 'Hanya Administrator yang dapat menghapus rekaman presensi.'
    );
  END IF;

  -- 2. Validasi input
  IF p_record_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_RECORD_ID',
      'error', 'ID rekaman tidak valid.'
    );
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'REASON_REQUIRED',
      'error', 'Alasan penghapusan wajib diisi.'
    );
  END IF;

  -- 3. Ambil rekaman yang akan dihapus (pastikan ada)
  SELECT * INTO v_record
  FROM public.attendance_records
  WHERE id = p_record_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'RECORD_NOT_FOUND',
      'error', 'Rekaman presensi tidak ditemukan atau sudah dihapus.'
    );
  END IF;

  -- 4. Insert audit log DULU (jika gagal, seluruh transaksi dibatalkan)
  INSERT INTO public.attendance_audit_logs (
    attendance_record_id,
    admin_id,
    action,
    old_values,
    new_values,
    reason
  ) VALUES (
    p_record_id,
    v_admin_uid,
    'record_deleted',
    jsonb_build_object(
      'employee_name',    v_record.employee_name,
      'category',         v_record.category,
      'shift',            v_record.shift,
      'attendance_type',  v_record.attendance_type,
      'work_date',        v_record.work_date,
      'recorded_at',      v_record.recorded_at,
      'review_status',    v_record.review_status,
      'attendance_status', v_record.attendance_status,
      'late_minutes',     v_record.late_minutes
    ),
    NULL,
    trim(p_reason)
  )
  RETURNING id INTO v_audit_id;

  -- 5. Hapus rekaman (FK attendance_audit_logs.attendance_record_id → SET NULL otomatis)
  DELETE FROM public.attendance_records
  WHERE id = p_record_id;

  -- 6. Konfirmasi sukses
  RETURN jsonb_build_object(
    'success', true,
    'deleted_record_id', p_record_id,
    'audit_log_id', v_audit_id,
    'employee_name', v_record.employee_name,
    'message', format(
      'Rekaman presensi %s (%s) berhasil dihapus dan dicatat di audit log.',
      v_record.employee_name,
      v_record.attendance_type
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Kembalikan error detail untuk developer (bukan ke end user)
    RETURN jsonb_build_object(
      'success', false,
      'error_code', SQLSTATE,
      'error', SQLERRM
    );
END;
$$;

-- Grant EXECUTE ke authenticated users (RLS check ada di dalam function)
GRANT EXECUTE ON FUNCTION public.admin_delete_attendance_record(uuid, text) TO authenticated;

-- Revoke dari anon
REVOKE EXECUTE ON FUNCTION public.admin_delete_attendance_record(uuid, text) FROM anon;

COMMENT ON FUNCTION public.admin_delete_attendance_record IS 
'Atomically logs and deletes an attendance record. 
Only callable by verified admins (is_admin()). 
admin_id is taken from auth.uid() — not from frontend input.
Returns jsonb with success/error details.';
