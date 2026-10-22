// ============================================================
// SIPATEN — Menu Layanan Grid (GoPay-inspired Modern Quick Actions)
// Minimalist Monochrome Design tailored to SIPATEN identity
// Responsive: 4 cols on mobile, 5 cols on tablet & desktop (10 items)
// ============================================================

import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Camera,
  CalendarDays,
  History,
  FileBarChart,
  FileText,
  HeartPulse,
  CalendarX,
  ClockAlert,
  Megaphone,
  HelpCircle,
  LayoutGrid,
  X,
  AlertCircle,
} from 'lucide-react'

export interface ServiceMenuGridProps {
  category: 'CS' | 'Security'
  onPresensiClick?: () => void
}

interface MenuItemDef {
  id: string
  label: string
  fullTitle: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  isAvailable: boolean
  path?: string
  unavailableDescription?: string
}

export default function ServiceMenuGrid({ category, onPresensiClick }: ServiceMenuGridProps) {
  const basePath = category === 'Security' ? '/security' : '/cs'
  const [unavailableModal, setUnavailableModal] = useState<MenuItemDef | null>(null)

  const menuItems: MenuItemDef[] = [
    {
      id: 'presensi',
      label: 'Presensi',
      fullTitle: 'Presensi Selfie & Geofence',
      icon: Camera,
      isAvailable: true,
    },
    {
      id: 'jadwal',
      label: 'Jadwal',
      fullTitle: 'Jadwal Kerja & Shift',
      icon: CalendarDays,
      isAvailable: true,
      path: `${basePath}/schedule`,
    },
    {
      id: 'riwayat',
      label: 'Riwayat',
      fullTitle: 'Riwayat Presensi',
      icon: History,
      isAvailable: true,
      path: `${basePath}/history`,
    },
    {
      id: 'rekap',
      label: 'Rekap Kehadiran',
      fullTitle: 'Rekap Kehadiran & Laporan',
      icon: FileBarChart,
      isAvailable: true,
      path: `${basePath}/reports`,
    },
    {
      id: 'izin',
      label: 'Pengajuan Izin',
      fullTitle: 'Pengajuan Izin Kerja',
      icon: FileText,
      isAvailable: false,
      unavailableDescription:
        'Layanan formulir pengajuan izin belum tersedia di sistem. Untuk permohonan izin kerja, silakan koordinasikan langsung dengan atasan langsung atau Administrator operasional secara manual.',
    },
    {
      id: 'sakit',
      label: 'Pengajuan Sakit',
      fullTitle: 'Pengajuan Surat Sakit',
      icon: HeartPulse,
      isAvailable: false,
      unavailableDescription:
        'Layanan unggah surat keterangan sakit dokter belum tersedia di sistem. Mohon serahkan bukti surat dokter langsung kepada bagian HRD/Admin operasional.',
    },
    {
      id: 'cuti',
      label: 'Pengajuan Cuti',
      fullTitle: 'Pengajuan Cuti Tahunan',
      icon: CalendarX,
      isAvailable: false,
      unavailableDescription:
        'Modul pengajuan cuti tahunan dan cuti khusus belum diaktifkan oleh Administrator. Silakan hubungi bagian personalia untuk prosedur cuti konvensional.',
    },
    {
      id: 'lembur',
      label: 'Lembur',
      fullTitle: 'Pencatatan Lembur (Overtime)',
      icon: ClockAlert,
      isAvailable: false,
      unavailableDescription:
        'Fitur permohonan dan persetujuan Surat Perintah Kerja Lembur (SPKL) belum tersedia. Jam kerja saat ini mengacu ketat pada jadwal shift yang berlaku.',
    },
    {
      id: 'pengumuman',
      label: 'Pengumuman',
      fullTitle: 'Pengumuman Internal',
      icon: Megaphone,
      isAvailable: false,
      unavailableDescription:
        'Papan pengumuman digital instansi belum memiliki surat edaran baru. Informasi operasional terbaru akan diumumkan melalui memo resmi atau koordinator tim.',
    },
    {
      id: 'bantuan',
      label: 'Bantuan',
      fullTitle: 'Pusat Bantuan & Kendala',
      icon: HelpCircle,
      isAvailable: false,
      unavailableDescription:
        'Layanan pusat bantuan digital sedang dalam pengembangan. Jika Anda mengalami kendala absensi (GPS, kamera, atau akun), silakan hubungi tim Admin SIPATEN.',
    },
  ]

  const handleItemClick = (item: MenuItemDef) => {
    if (!item.isAvailable) {
      setUnavailableModal(item)
      return
    }

    if (item.id === 'presensi') {
      if (onPresensiClick) {
        onPresensiClick()
      } else {
        const card = document.getElementById('presensi-hari-ini-card')
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid size={15} className="text-neutral-900" />
            <h3 className="text-sm font-bold text-neutral-900">Menu Layanan</h3>
          </div>
          <span className="text-[11px] font-medium text-neutral-400">Akses Cepat</span>
        </div>

        {/* 10-Item Grid: 4 cols on mobile (<640px), 5 cols on sm+ (tablet/desktop) */}
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-5 lg:grid-cols-5 gap-y-4 gap-x-2 sm:gap-x-4">
            {menuItems.map(item => {
              const Icon = item.icon

              const content = (
                <div className="w-full flex flex-col items-center">
                  <div
                    className={`
                      w-12 h-12 sm:w-13 sm:h-13 rounded-2xl
                      flex items-center justify-center
                      border transition-all duration-200 shadow-sm
                      relative
                      ${item.isAvailable
                        ? 'bg-neutral-50 border-neutral-200 text-neutral-800 group-hover:bg-neutral-900 group-hover:text-white group-hover:border-neutral-900 group-hover:shadow'
                        : 'bg-neutral-50/70 border-neutral-200/60 text-neutral-500 group-hover:border-neutral-300 group-hover:bg-neutral-100'
                      }
                    `}
                  >
                    <Icon size={20} />
                  </div>
                  <span
                    className={`
                      text-[11px] font-medium text-center leading-snug mt-1.5 px-0.5 line-clamp-2
                      transition-colors
                      ${item.isAvailable
                        ? 'text-neutral-800 font-semibold group-hover:text-neutral-900'
                        : 'text-neutral-500 group-hover:text-neutral-700'
                      }
                    `}
                  >
                    {item.label}
                  </span>
                </div>
              )

              if (item.isAvailable && item.path) {
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    className="flex flex-col items-center justify-start text-center group cursor-pointer p-1.5 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    title={item.fullTitle}
                  >
                    {content}
                  </Link>
                )
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className="flex flex-col items-center justify-start text-center group cursor-pointer p-1.5 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                  title={item.fullTitle}
                >
                  {content}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── Modal Fitur Belum Tersedia ─── */}
      {unavailableModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-neutral-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setUnavailableModal(null)}
        >
          <div
            className="bg-white rounded-2xl border border-neutral-200 max-w-sm w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setUnavailableModal(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              aria-label="Tutup modal"
            >
              <X size={18} />
            </button>

            {/* Icon */}
            <div className="w-12 h-12 rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-700 mx-auto mb-3">
              {React.createElement(unavailableModal.icon, { size: 22 })}
            </div>

            {/* Badge */}
            <div className="text-center mb-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                <AlertCircle size={10} />
                Belum Tersedia
              </span>
            </div>

            {/* Title */}
            <h4 className="text-base font-bold text-neutral-900 text-center mb-2">
              {unavailableModal.fullTitle}
            </h4>

            {/* Description */}
            <p className="text-xs text-neutral-500 text-center leading-relaxed">
              {unavailableModal.unavailableDescription}
            </p>

            {/* Action button */}
            <button
              type="button"
              onClick={() => setUnavailableModal(null)}
              className="w-full mt-5 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  )
}
