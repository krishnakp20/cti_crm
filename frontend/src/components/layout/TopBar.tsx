import { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../../redux/store'
import { toggleTheme, setAdminClient } from '../../redux/slices/uiSlice'
import { markAllRead } from '../../redux/slices/notificationSlice'
import { Bell, Sun, Moon, Search, Menu, Check, Building2, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { notificationsApi, clientsApi } from '../../services/api'
import { cn } from '../../utils/cn'
import { useQuery } from '@tanstack/react-query'

interface TopBarProps {
  onMenuClick?: () => void
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const user = useSelector((s: RootState) => s.auth.user)
  const theme = useSelector((s: RootState) => s.ui.theme)
  const unread = useSelector((s: RootState) => s.notifications.unreadCount)
  const notifications = useSelector((s: RootState) => s.notifications.items)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const adminClientId = useSelector((s: RootState) => s.ui.adminClientId)
  const adminClientName = useSelector((s: RootState) => s.ui.adminClientName)
  const [showNotifs, setShowNotifs] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showClientPicker, setShowClientPicker] = useState(false)
  const [search, setSearch] = useState('')
  const notifRef = useRef<HTMLDivElement>(null)
  const clientPickerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list-topbar'],
    queryFn: () => clientsApi.list({ limit: 100 }).then(r => r.data),
    enabled: user?.role === 'admin',
    staleTime: 60000,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false)
      if (clientPickerRef.current && !clientPickerRef.current.contains(e.target as Node)) setShowClientPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (showSearch) searchRef.current?.focus()
  }, [showSearch])

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead()
    dispatch(markAllRead())
  }

  const submitSearch = () => {
    if (search.trim()) {
      navigate(`/tickets?search=${encodeURIComponent(search)}`)
      setShowSearch(false)
      setSearch('')
    }
  }

  const initial = user?.full_name?.charAt(0).toUpperCase() || '?'

  return (
    <>
      <header className="h-14 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 flex items-center px-4 gap-3 flex-shrink-0 z-20">
        {/* Hamburger — mobile only */}
        <button onClick={onMenuClick} className="btn-icon lg:hidden flex-shrink-0">
          <Menu className="w-5 h-5" />
        </button>

        {/* Search bar — desktop */}
        <div className="flex-1 max-w-sm hidden sm:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tickets, customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-700/20 focus:border-primary-600 dark:focus:border-primary-500 transition-all h-9"
              onKeyDown={e => e.key === 'Enter' && submitSearch()}
            />
          </div>
        </div>

        {/* Spacer on mobile */}
        <div className="flex-1 sm:hidden" />

        {/* Admin client switcher */}
        {user?.role === 'admin' && (
          <div className="relative hidden sm:block" ref={clientPickerRef}>
            <button
              onClick={() => setShowClientPicker(v => !v)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all h-9',
                adminClientId
                  ? 'bg-primary-50 border-primary-200 text-primary-700 dark:bg-primary-900/20 dark:border-primary-700/50 dark:text-primary-300'
                  : 'bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              )}
            >
              <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="max-w-[120px] truncate">{adminClientName || 'All Clients'}</span>
              <ChevronDown className={cn('w-3 h-3 flex-shrink-0 opacity-60 transition-transform', showClientPicker && 'rotate-180')} />
            </button>

            {showClientPicker && (
              <div className="absolute left-0 top-11 w-60 card-md shadow-card-lg z-50 py-1.5 animate-scale-in">
                <p className="text-2xs text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 py-2 font-bold">View as Client</p>
                <button
                  onClick={() => { dispatch(setAdminClient({ id: null, name: null })); setShowClientPicker(false) }}
                  className={cn('w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2.5 transition-colors',
                    !adminClientId && 'font-semibold text-primary-700 dark:text-primary-300')}
                >
                  <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
                  All Clients (Admin view)
                  {!adminClientId && <Check className="w-3 h-3 ml-auto text-primary-600" />}
                </button>
                {(clientsData?.items || []).map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => { dispatch(setAdminClient({ id: c.id, name: c.company_name })); setShowClientPicker(false) }}
                    className={cn('w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2.5 transition-colors',
                      adminClientId === c.id && 'font-semibold text-primary-700 dark:text-primary-300')}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#e30023' }} />
                    <span className="truncate">{c.company_name}</span>
                    {adminClientId === c.id && <Check className="w-3 h-3 ml-auto text-primary-600 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Mobile search */}
          <button className="btn-icon sm:hidden" onClick={() => setShowSearch(v => !v)}>
            <Search className="w-4 h-4" />
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => dispatch(toggleTheme())}
            className="btn-icon"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button className="btn-icon relative" onClick={() => setShowNotifs(v => !v)}>
              <Bell className="w-4 h-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-white text-2xs rounded-full flex items-center justify-center font-bold"
                  style={{ background: '#e30023', fontSize: '0.6rem' }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-11 w-80 card-md shadow-card-lg z-50 animate-scale-in">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">Notifications</span>
                  {unread > 0 && (
                    <button onClick={handleMarkAllRead}
                      className="text-2xs font-semibold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                      <Check className="w-3 h-3" /> Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center py-8">
                      <Bell className="w-8 h-8 text-gray-200 dark:text-gray-700 mb-2" />
                      <p className="text-sm text-gray-400">No notifications</p>
                    </div>
                  ) : (
                    notifications.slice(0, 10).map(n => (
                      <div
                        key={n.id}
                        className={cn(
                          'px-4 py-3 border-b border-gray-50 dark:border-gray-800/80 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
                          !n.is_read && 'border-l-2 border-l-primary-600'
                        )}
                        onClick={() => { n.action_url && navigate(n.action_url); setShowNotifs(false) }}
                      >
                        <p className="text-xs font-semibold text-gray-900 dark:text-white">{n.title}</p>
                        <p className="text-2xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          <div className="flex items-center gap-2.5 ml-1 pl-3 border-l border-gray-100 dark:border-gray-800">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #004058 0%, #005872 100%)' }}
            >
              {initial}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">{user?.full_name}</p>
              <p className="text-2xs text-gray-400 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile fullscreen search */}
      {showSearch && (
        <div className="sm:hidden bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-2.5 flex items-center gap-2 z-20 animate-slide-up">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search tickets, customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitSearch()
              if (e.key === 'Escape') setShowSearch(false)
            }}
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
          />
          <button className="text-xs font-medium text-gray-500" onClick={() => setShowSearch(false)}>Cancel</button>
        </div>
      )}
    </>
  )
}
