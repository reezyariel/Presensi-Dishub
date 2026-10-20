// ============================================================
// ShiftTrack — EmployeeLayout (Responsive)
// Desktop (≥ md): Sidebar kiri permanen + Topbar + Area Konten Lebar
// Mobile (< md): Bottom navigation + full-screen scrollable content
// ============================================================

import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import EmployeeSidebar from './EmployeeSidebar'
import EmployeeTopbar from './EmployeeTopbar'
import EmployeeBottomNav from './EmployeeBottomNav'

interface EmployeeLayoutProps {
  category: 'CS' | 'Security'
}

export default function EmployeeLayout({ category }: EmployeeLayoutProps) {
  const location = useLocation()
  const basePath = category === 'Security' ? '/security' : '/cs'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Hide bottom nav when on a modal-style deep route
  const isTakingAttendance = location.pathname.includes('/take')

  return (
    <div className="min-h-screen bg-neutral-100 flex">
      {/* ─── Desktop Sidebar (permanent, ≥ md) ─── */}
      <EmployeeSidebar
        category={category}
        isMobileOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* ─── Main Area: shifts right on desktop to accommodate sidebar ─── */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-[240px]">
        {/* Topbar (shown on desktop always, mobile when sidebar not open) */}
        <EmployeeTopbar
          category={category}
          onMenuToggle={() => setIsSidebarOpen(true)}
        />

        {/* ─── Page Content ─── */}
        <main className={`
          flex-1 overflow-y-auto
          ${isTakingAttendance ? '' : 'pb-20 md:pb-0'}
        `}>
          {/* Content wrapper: on mobile, plain scroll; on desktop, extra padding */}
          <div className="
            w-full max-w-7xl mx-auto
            px-4 py-4 sm:px-5 sm:py-5
            md:px-7 md:py-6
          ">
            <Outlet />
          </div>
        </main>

        {/* ─── Mobile Bottom Nav (hidden on ≥ md) ─── */}
        {!isTakingAttendance && (
          <div className="md:hidden">
            <EmployeeBottomNav basePath={basePath} />
          </div>
        )}
      </div>
    </div>
  )
}
