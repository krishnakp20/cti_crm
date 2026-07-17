import { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../../redux/store'
import { toggleTheme } from '../../redux/slices/uiSlice'
import { markAllRead } from '../../redux/slices/notificationSlice'
import { Bell, Sun, Moon, Search, Menu, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { notificationsApi } from '../../services/api'
import { cn } from '../../utils/cn'

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
  const [showNotifs, setShowNotifs] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const notifRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false)
      }
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
    }
  }

  return (
    <>
      <header className="h-12 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center px-3 gap-2 flex-shrink-0 z-20">
        {/* Hamburger — mobile only */}
        <button onClick={onMenuClick} className="btn-icon lg:hidden flex-shrink-0">
          <Menu className="w-5 h-5" />
        </button>

        {/* Search bar — hidden on mobile (shown via search button) */}
        <div className="flex-1 max-w-sm hidden sm:block">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tickets, customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-8 py-1 text-xs h-8"
              onKeyDown={e => e.key === 'Enter' && submitSearch()}
            />
          </div>
        </div>

        {/* Mobile: page title placeholder */}
        <div className="flex-1 sm:hidden" />

        <div className="ml-auto flex items-center gap-1">
          {/* Mobile search icon */}
          <button
            className="btn-icon sm:hidden"
            onClick={() => setShowSearch(v => !v)}
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Theme toggle */}
          <button onClick={() => dispatch(toggleTheme())} className="btn-icon">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button className="btn-icon relative" onClick={() => setShowNotifs(v => !v)}>
              <Bell className="w-4 h-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-2xs rounded-full flex items-center justify-center font-bold">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-10 w-72 sm:w-80 card shadow-xl z-50">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</span>
                  {unread > 0 && (
                    <button onClick={handleMarkAllRead} className="text-2xs text-primary-600 hover:underline flex items-center gap-1">
                      <Check className="w-3 h-3" /> Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">No notifications</p>
                  ) : (
                    notifications.slice(0, 10).map(n => (
                      <div
                        key={n.id}
                        className={cn(
                          'px-3 py-2 border-b border-gray-50 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800',
                          !n.is_read && 'bg-primary-50/50 dark:bg-primary-900/10'
                        )}
                        onClick={() => { n.action_url && navigate(n.action_url); setShowNotifs(false) }}
                      >
                        <p className="text-xs font-medium text-gray-900 dark:text-white">{n.title}</p>
                        <p className="text-2xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          <div className="flex items-center gap-2 ml-1 pl-2 sm:pl-3 border-l border-gray-100 dark:border-gray-800">
            <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.full_name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-medium text-gray-900 dark:text-white leading-tight">{user?.full_name}</p>
              <p className="text-2xs text-gray-400 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile fullscreen search bar */}
      {showSearch && (
        <div className="sm:hidden bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-3 py-2 flex items-center gap-2 z-20">
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
          <button
            className="text-xs text-gray-500"
            onClick={() => setShowSearch(false)}
          >
            Cancel
          </button>
        </div>
      )}
    </>
  )
}
