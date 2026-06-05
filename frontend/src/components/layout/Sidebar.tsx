import { NavLink, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../../redux/store'
import { toggleSidebar } from '../../redux/slices/uiSlice'
import { logout } from '../../redux/slices/authSlice'
import { cn } from '../../utils/cn'
import {
  LayoutDashboard, Ticket, FileText, Users, Building2, Phone, PhoneCall,
  Bell, BarChart3, Shield, Settings, LogOut, ChevronLeft, ChevronRight,
  Headphones, Megaphone, KeyRound
} from 'lucide-react'

const navGroups = [
  {
    label: 'Main',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
      { to: '/tickets', icon: Ticket, label: 'Tickets' },
    ],
  },
  {
    label: 'Calling',
    roles: ['admin', 'client', 'team_user', 'agent'],
    items: [
      { to: '/campaigns', icon: Megaphone, label: 'Campaigns' },
      { to: '/call-logs', icon: Phone, label: 'Call Logs' },
      { to: '/agent', icon: Headphones, label: 'Agent Panel', roles: ['agent'] },
    ],
  },
  {
    label: 'Configuration',
    roles: ['admin', 'client', 'team_user'],
    items: [
      { to: '/forms', icon: FileText, label: 'Form Builder' },
      { to: '/alerts', icon: Bell, label: 'Alerts & Escalations' },
    ],
  },
  {
    label: 'Management',
    roles: ['admin', 'client'],
    items: [
      { to: '/users', icon: Users, label: 'Users' },
      { to: '/permissions', icon: KeyRound, label: 'Permissions' },
      { to: '/clients', icon: Building2, label: 'Clients', roles: ['admin'] },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/reports', icon: BarChart3, label: 'Reports' },
      { to: '/audit', icon: Shield, label: 'Audit Logs', roles: ['admin', 'client'] },
    ],
  },
]

export default function Sidebar() {
  const collapsed = useSelector((s: RootState) => s.ui.sidebarCollapsed)
  const user = useSelector((s: RootState) => s.auth.user)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const canSee = (roles?: string[]) => !roles || roles.includes(user?.role || '')

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  return (
    <aside className={cn(
      'flex flex-col bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 transition-all duration-200 h-screen',
      collapsed ? 'w-14' : 'w-56'
    )}>
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100 dark:border-gray-800">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-sm text-gray-900 dark:text-white">CTI CRM</span>
          </div>
        )}
        {collapsed && (
          <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center mx-auto">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        )}
        {!collapsed && (
          <button onClick={() => dispatch(toggleSidebar())} className="btn-icon ml-auto">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <button onClick={() => dispatch(toggleSidebar())} className="btn-icon mx-auto mt-2">
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navGroups.map(group => {
          if (!canSee(group.roles as string[])) return null
          const visibleItems = group.items.filter(item => canSee((item as any).roles))
          if (!visibleItems.length) return null

          return (
            <div key={group.label} className="mb-3">
              {!collapsed && (
                <p className="text-2xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider px-2 mb-1">
                  {group.label}
                </p>
              )}
              {visibleItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={(item as any).exact}
                  className={({ isActive }) =>
                    cn('sidebar-item', isActive && 'sidebar-item-active', collapsed && 'justify-center px-2')
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-gray-100 dark:border-gray-800 p-2 space-y-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) => cn('sidebar-item', isActive && 'sidebar-item-active', collapsed && 'justify-center px-2')}
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <button
          onClick={handleLogout}
          className={cn('sidebar-item w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 hover:text-red-600', collapsed && 'justify-center px-2')}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
