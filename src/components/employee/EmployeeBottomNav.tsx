// ============================================================
// SIPATEN — Employee Bottom Nav (Mobile Only, < md)
// Rendered inside EmployeeLayout only for mobile.
// On desktop, EmployeeSidebar handles navigation.
// ============================================================

import { NavLink } from 'react-router-dom'
import { Home, History, Calendar, User } from 'lucide-react'
import { cn } from '../../lib/utils'

interface BottomNavProps {
  basePath?: string // e.g. '/cs' or '/security'
}

export default function EmployeeBottomNav({ basePath = '/cs' }: BottomNavProps) {
  const isSecurity = basePath.startsWith('/security')
  const homePath = isSecurity ? '/security' : '/cs'

  const navItems = [
    {
      label: 'Beranda',
      path: homePath,
      icon: Home,
      exact: true,
    },
    {
      label: 'Riwayat',
      path: `${homePath}/history`,
      icon: History,
      exact: false,
    },
    {
      label: 'Jadwal',
      path: `${homePath}/schedule`,
      icon: Calendar,
      exact: false,
    },
    {
      label: 'Profil',
      path: `${homePath}/profile`,
      icon: User,
      exact: false,
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-neutral-200 md:hidden">
      <div className="px-2 h-16 flex items-center justify-around">
        {navItems.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.label}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 py-1 px-2 transition-colors relative',
                  isActive
                    ? 'text-neutral-900'
                    : 'text-neutral-400 hover:text-neutral-700',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className={cn('text-[10px] mt-1 tracking-tight leading-none', isActive ? 'font-bold' : 'font-medium')}>
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="w-1 h-1 rounded-full bg-neutral-900 absolute -bottom-0.5" />
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
