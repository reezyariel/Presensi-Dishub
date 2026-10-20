import type {
  AttendanceRecord,
  AdminProfile,
  AttendanceSetting,
} from './attendance'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      attendance_records: {
        Row: AttendanceRecord
        Insert: {
          id?: string
          employee_name: string
          normalized_name?: string | null
          category: 'CS' | 'Security'
          attendance_type: 'masuk' | 'istirahat' | 'pulang'
          shift?: 'Shift I' | 'Shift II' | 'Shift III' | null
          work_date: string
          recorded_at: string
          scheduled_start?: string | null
          scheduled_end?: string | null
          attendance_status: 'tepat_waktu' | 'terlambat'
          late_minutes?: number
          selfie_storage_path: string
          review_status?: 'belum_diperiksa' | 'sudah_diperiksa' | 'perlu_tindak_lanjut'
          admin_notes?: string | null
          idempotency_key: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          employee_name?: string
          normalized_name?: string | null
          category?: 'CS' | 'Security'
          attendance_type?: 'masuk' | 'istirahat' | 'pulang'
          shift?: 'Shift I' | 'Shift II' | 'Shift III' | null
          work_date?: string
          recorded_at?: string
          scheduled_start?: string | null
          scheduled_end?: string | null
          attendance_status?: 'tepat_waktu' | 'terlambat'
          late_minutes?: number
          selfie_storage_path?: string
          review_status?: 'belum_diperiksa' | 'sudah_diperiksa' | 'perlu_tindak_lanjut'
          admin_notes?: string | null
          idempotency_key?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_audit_logs: {
        Row: {
          id: string
          attendance_record_id: string | null
          admin_id: string
          action: string
          old_values: Record<string, unknown> | null
          new_values: Record<string, unknown> | null
          reason: string
          created_at: string
        }
        Insert: {
          id?: string
          attendance_record_id?: string | null
          admin_id: string
          action: string
          old_values?: Record<string, unknown> | null
          new_values?: Record<string, unknown> | null
          reason: string
          created_at?: string
        }
        Update: {
          id?: string
          attendance_record_id?: string | null
          admin_id?: string
          action?: string
          old_values?: Record<string, unknown> | null
          new_values?: Record<string, unknown> | null
          reason?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attendance_audit_logs_attendance_record_id_fkey'
            columns: ['attendance_record_id']
            isOneToOne: false
            referencedRelation: 'attendance_records'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attendance_audit_logs_admin_id_fkey'
            columns: ['admin_id']
            isOneToOne: false
            referencedRelation: 'admin_profiles'
            referencedColumns: ['id']
          }
        ]
      }
      admin_profiles: {
        Row: AdminProfile
        Insert: {
          id: string
          full_name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_settings: {
        Row: AttendanceSetting
        Insert: {
          id?: string
          setting_key: string
          setting_value: unknown
          description?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: unknown
          description?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
