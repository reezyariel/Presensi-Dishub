import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  History, Search, Shield, ChevronLeft, ChevronRight,
  ExternalLink, Eye, RotateCcw, X, FileCode
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatJakartaDateTime } from '../../lib/scheduleEngine'

const PAGE_SIZE = 25

interface AuditLogItem {
  id: string
  attendance_record_id: string | null
  admin_id: string
  action: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  reason: string
  created_at: string
  admin_profiles?: {
    full_name: string
  } | null
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [activeJsonModal, setActiveJsonModal] = useState<AuditLogItem | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      let q = supabase
        .from('attendance_audit_logs')
        .select('*, admin_profiles(full_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (actionFilter) {
        q = q.eq('action', actionFilter)
      }
      if (searchTerm.trim()) {
        q = q.ilike('reason', `%${searchTerm.trim()}%`)
      }

      const { data, count } = await q
      setLogs((data ?? []) as unknown as AuditLogItem[])
      setTotal(count ?? 0)
    } finally {
      setIsLoading(false)
    }
  }, [page, actionFilter, searchTerm])

  useEffect(() => {
    loadData()
  }, [loadData])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const formatActionBadge = (action: string) => {
    switch (action) {
      case 'correction':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-neutral-900 text-white">
            Koreksi Data
          </span>
        )
      case 'review_status_change':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-neutral-100 text-neutral-900 border border-neutral-300">
            Ubah Status Periksa
          </span>
        )
      case 'setting_update':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-neutral-200 text-neutral-800">
            Ubah Konfigurasi
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 text-neutral-700">
            {action}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <span>Sistem & Konfigurasi</span>
            <span>/</span>
            <span className="text-neutral-900">Audit Log</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight mt-1">
            Riwayat Log Audit & Integritas Data
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pencatatan setiap intervensi administratif, persetujuan absensi, revisi data, dan perubahan konfigurasi sistem.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="p-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 rounded-lg text-xs font-medium transition-colors"
            title="Segarkan Log"
          >
            <RotateCcw size={15} />
          </button>
          <div className="px-3.5 py-2 rounded-lg bg-neutral-100 border border-neutral-200 text-xs font-bold text-neutral-900 font-mono">
            Total Log: {total}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-neutral-400" />
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value)
                setPage(0)
              }}
              className="px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            >
              <option value="">Semua Jenis Tindakan</option>
              <option value="correction">Koreksi Presensi</option>
              <option value="review_status_change">Perubahan Status Periksa</option>
              <option value="setting_update">Ubah Pengaturan Sistem</option>
            </select>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Cari alasan / justifikasi..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(0)
              }}
              className="pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900 w-64"
            />
          </div>
        </div>

        <div className="text-xs text-neutral-500 font-medium">
          Menampilkan baris {logs.length > 0 ? page * PAGE_SIZE + 1 : 0} – {Math.min((page + 1) * PAGE_SIZE, total)} dari {total} log
        </div>
      </div>

      {/* Main Desktop Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={16} className="text-neutral-900" />
            <h2 className="text-sm font-bold text-neutral-900">
              Daftar Catatan Aktivitas Sistem
            </h2>
          </div>
          <span className="text-xs text-neutral-500">
            Waktu terdaftar dalam WIB (UTC+7)
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-xs text-neutral-400">
            <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Memuat catatan log audit...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
              <History size={22} />
            </div>
            <div className="text-sm font-semibold text-neutral-800">
              Tidak Ada Riwayat Aktivitas
            </div>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Belum ada tindakan administratif atau perubahan nilai yang cocok dengan filter saat ini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-neutral-600 font-semibold tracking-wider uppercase text-[11px]">
                  <th className="py-3 px-4">Waktu Kejadian</th>
                  <th className="py-3 px-4">Administrator</th>
                  <th className="py-3 px-4">Tindakan</th>
                  <th className="py-3 px-4">Alasan / Keterangan</th>
                  <th className="py-3 px-4 text-center">Perubahan Nilai</th>
                  <th className="py-3 px-4 text-center">Presensi Terkait</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-neutral-50/80 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono text-neutral-700 whitespace-nowrap">
                      {formatJakartaDateTime(log.created_at)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-[11px] flex-shrink-0">
                          {(log.admin_profiles?.full_name || 'Admin').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-neutral-900">
                            {log.admin_profiles?.full_name || 'Admin ShiftTrack'}
                          </div>
                          <div className="text-[10px] font-mono text-neutral-400">
                            ID: {log.admin_id.substring(0, 8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {formatActionBadge(log.action)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-neutral-800 max-w-md break-words font-medium">
                        {log.reason || <span className="text-neutral-400 italic">Tanpa catatan keterangan khusus</span>}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => setActiveJsonModal(log)}
                        className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded text-xs font-semibold inline-flex items-center gap-1.5 transition-colors border border-neutral-200"
                      >
                        <Eye size={13} />
                        <span>Periksa Diff</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {log.attendance_record_id ? (
                        <Link
                          to={`/admin/attendance/${log.attendance_record_id}`}
                          className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-neutral-900 hover:underline bg-neutral-50 hover:bg-neutral-100 px-2.5 py-1 rounded border border-neutral-200 transition-colors"
                        >
                          <span>{log.attendance_record_id.substring(0, 8)}</span>
                          <ExternalLink size={12} />
                        </Link>
                      ) : (
                        <span className="text-neutral-400 font-mono text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Desktop Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-600 bg-neutral-50/50">
            <div>
              Halaman <strong className="text-neutral-900">{page + 1}</strong> dari <strong className="text-neutral-900">{totalPages}</strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-100 disabled:opacity-40 transition-colors flex items-center gap-1 text-xs font-semibold"
              >
                <ChevronLeft size={14} />
                <span>Sebelumnya</span>
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-100 disabled:opacity-40 transition-colors flex items-center gap-1 text-xs font-semibold"
              >
                <span>Berikutnya</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Side-by-Side Diff Modal */}
      {activeJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-neutral-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2.5">
                <FileCode size={18} className="text-neutral-900" />
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Inspeksi Perubahan Nilai Data (Audit JSON Diff)
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Tindakan: {activeJsonModal.action} • Admin: {activeJsonModal.admin_profiles?.full_name || 'Admin'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveJsonModal(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200/60 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Side-by-Side JSON Diff Columns */}
            <div className="p-5 space-y-4">
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs">
                <span className="font-semibold text-neutral-800">Alasan / Keterangan: </span>
                <span className="text-neutral-600">{activeJsonModal.reason || '-'}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Old Values */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-neutral-700">
                    <span>Nilai Sebelumnya (Old Values)</span>
                    <span className="text-[10px] font-mono text-neutral-400">Sebelum Disunting</span>
                  </div>
                  <pre className="p-3 bg-neutral-100 text-neutral-800 rounded-xl border border-neutral-200 overflow-x-auto font-mono text-[11px] max-h-64">
                    {JSON.stringify(activeJsonModal.old_values, null, 2) || '(Kosong / Nilai awal)'}
                  </pre>
                </div>

                {/* New Values */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-neutral-900">
                    <span>Nilai Baru (New Values)</span>
                    <span className="text-[10px] font-mono text-neutral-900 font-bold">Hasil Perubahan</span>
                  </div>
                  <pre className="p-3 bg-neutral-900 text-neutral-100 rounded-xl border border-neutral-800 overflow-x-auto font-mono text-[11px] max-h-64">
                    {JSON.stringify(activeJsonModal.new_values, null, 2) || '(Kosong)'}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <div className="text-[11px] font-mono text-neutral-500">
                Log ID: {activeJsonModal.id}
              </div>
              <button
                onClick={() => setActiveJsonModal(null)}
                className="px-4 py-2 bg-neutral-900 hover:bg-black text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Tutup Jendela
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
