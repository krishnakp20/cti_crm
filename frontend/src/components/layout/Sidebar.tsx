import { NavLink, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../../redux/store'
import { toggleSidebar } from '../../redux/slices/uiSlice'
import { logout } from '../../redux/slices/authSlice'
import { cn } from '../../utils/cn'
import {
  LayoutDashboard, Ticket, FileText, Users, Building2, Phone,
  Bell, BarChart3, Shield, Settings, LogOut, ChevronLeft, ChevronRight,
  Headphones, Megaphone, KeyRound, X, Radio, PhoneCall, GitBranch, Voicemail,
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
      { to: '/live', icon: Radio, label: 'Live Dashboard' },
      { to: '/call-logs', icon: Phone, label: 'Call Logs' },
      { to: '/ivr-report', icon: PhoneCall, label: 'IVR Report' },
      { to: '/ivr-routing', icon: GitBranch, label: 'IVR Routing', roles: ['admin', 'client'] },
      { to: '/agent', icon: Headphones, label: 'Agent Panel', roles: ['agent'] },
      { to: '/voicemail', icon: Voicemail, label: 'Voicemail' },
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
      { to: '/teams', icon: Users, label: 'Teams' },
      { to: '/permissions', icon: KeyRound, label: 'Permissions' },
      { to: '/clients', icon: Building2, label: 'Clients', roles: ['admin'] },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/reports', icon: BarChart3, label: 'Reports' },
      { to: '/tickets/report', icon: FileText, label: 'Ticket Export' },
      { to: '/audit', icon: Shield, label: 'Audit Logs', roles: ['admin', 'client'] },
    ],
  },
]

interface SidebarProps {
  onClose?: () => void
}

export default function Sidebar({ onClose }: SidebarProps) {
  const collapsed = useSelector((s: RootState) => s.ui.sidebarCollapsed)
  const user = useSelector((s: RootState) => s.auth.user)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const userPerms: string[] = (user as any)?.permissions || []
  const hasCustomRole = !!(user as any)?.role_id

  // Module → keyword that appears in permission slugs for that module
  const MODULE_PERM: Record<string, string | null> = {
    Dashboard:              null,          // always visible
    Tickets:                'ticket',
    Campaigns:              'campaign',
    'Call Logs':            'calling',
    'IVR Report':           'calling',
    'IVR Routing':          'calling',
    'Agent Panel':          'calling',
    'Form Builder':         'form',
    'Alerts & Escalations': 'alert',
    Users:                  'user',
    Permissions:            'user',
    Clients:                'client',
    Reports:                'report',
    'Ticket Export':        'export_ticket',
    'Audit Logs':           'audit',
  }

  const canSee = (roles?: string[], label?: string) => {
    // Role-based gate first
    if (roles && !roles.includes(user?.role || '')) return false
    // If user has a custom role with permissions assigned, enforce them
    if (hasCustomRole && userPerms.length > 0 && label) {
      const keyword = MODULE_PERM[label]
      if (keyword === null) return true       // null = always show
      if (keyword) return userPerms.some(p => p.includes(keyword))
    }
    return true
  }

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  const initial = user?.full_name?.charAt(0).toUpperCase() || '?'

  return (
    <aside
      className="flex flex-col h-screen transition-all duration-200 flex-shrink-0"
      style={{
        width: collapsed ? '3.5rem' : '14rem',
        background: 'linear-gradient(180deg, #004f6a 0%, #003347 40%, #002233 100%)',
      }}
    >
      {/* Logo header */}
      <div
        className="flex items-center flex-shrink-0 px-3 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', minHeight: '3.5rem' }}
      >
        {collapsed ? (
          <div className="mx-auto flex items-center justify-center">
            {/* Colored mark: red circle (logo icon) */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-lg"
              style={{ background: '#e30023' }}>
              D
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            {/* Logo on white pill */}
            <div className="bg-white rounded-xl px-3 py-1.5 flex items-center" style={{ height: '2.5rem' }}>
              <img src="/dialdesk-logo.svg" alt="DialDesk" className="h-7 w-auto object-contain" />
            </div>
            <div className="flex items-center gap-1 ml-2">
              {onClose && (
                <button
                  onClick={onClose}
                  className="lg:hidden p-1 rounded-lg hover:bg-white/10 transition-colors"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => dispatch(toggleSidebar())}
                className="hidden lg:flex p-1 rounded-lg hover:bg-white/10 transition-colors"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {collapsed && (
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="hidden lg:flex absolute p-1 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: 'rgba(255,255,255,0.5)', right: '-1px', top: '0.75rem' }}
          />
        )}
      </div>

      {/* Collapsed expand button */}
      {collapsed && (
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="hidden lg:flex mx-auto mt-2 p-1 rounded-lg hover:bg-white/10 transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* User pill — mobile only */}
      {!collapsed && (
        <div
          className="flex items-center gap-2.5 px-3 py-2.5 lg:hidden"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: '#e30023' }}>
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user?.full_name}</p>
            <p className="text-2xs capitalize" style={{ color: 'rgba(255,255,255,0.5)' }}>{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navGroups.map(group => {
          if (!canSee(group.roles as string[])) return null
          const visibleItems = group.items.filter(item => canSee((item as any).roles, item.label))
          if (!visibleItems.length) return null

          return (
            <div key={group.label} className="mb-3">
              {!collapsed && (
                <p className="px-2 mb-1.5 text-xs font-semibold"
                  style={{ color: 'rgba(255,255,255,0.38)', letterSpacing: '0.04em' }}>
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
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-gold-400' : '')} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && isActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-gold-400 flex-shrink-0" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="flex-shrink-0 px-2 pb-3 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
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
          className={cn('sidebar-item w-full hover:!bg-brand-500/15 hover:!text-brand-300', collapsed && 'justify-center px-2')}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0 text-brand-400" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
