import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import AdminHeader from './AdminHeader'

export default function AdminLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-surface-muted relative">
      <Sidebar
        isMobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />
      <div className="admin-main">
        <AdminHeader onToggleSidebar={() => setMobileSidebarOpen(prev => !prev)} />
        <main className="admin-content page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
