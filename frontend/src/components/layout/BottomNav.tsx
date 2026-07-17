import { NavLink } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { RootState } from '../../redux/store'
import { LayoutDashboard, Ticket, Headphones, Phone, BarChart3 } from 'lucide-react'
import { cn } from '../../utils/cn'

export default function BottomNav() {
  const user = useSelector((s: RootState) => s.auth.user)
  const isAgent = user?.role === 'agent'

  const items = isAgent
    ? [
        { to: '/', icon: LayoutDashboard, label: 'Home', exact: true },
        { to: '/tickets', icon: Ticket, label: 'Tickets' },
        { to: '/agent', icon: Headphones, label: 'Agent' },
        { to: '/call-logs', icon: Phone, label: 'Calls' },
      ]
    : [
        { to: '/', icon: LayoutDashboard, label: 'Home', exact: true },
        { to: '/tickets', icon: Ticket, label: 'Tickets' },
        { to: '/call-logs', icon: Phone, label: 'Calls' },
        { to: '/reports', icon: BarChart3, label: 'Reports' },
      ]

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex items-center safe-area-bottom">
      {items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={(item as any).exact}
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-2xs font-medium transition-colors',
              isActive
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-500 dark:text-gray-400'
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
