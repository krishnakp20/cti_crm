import { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../../redux/store'
import { toggleTheme } from '../../redux/slices/uiSlice'
import { markAllRead } from '../../redux/slices/notificationSlice'
import { Bell, Sun, Moon, Search, ChevronDown, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { notificationsApi } from '../../services/api'
import { cn } from '../../utils/cn'

export default function TopBar() {
  const user = useSelector((s: RootState) => s.auth.user)
  const theme = useSelector((s: RootState) => s.ui.theme)
  const unread = useSelector((s: RootState) => s.notifications.unreadCount)
  const notifications = useSelector((s: RootState) => s.notifications.items)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [showNotifs, setShowNotifs] = useState(false)
  const [search, setSearch] = useState('')
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead()
    dispatch(markAllRead())
  }

  return (
    <header className="h-12 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center px-4 gap-3 flex-shrink-0">
      <div className="flex-1 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search tickets, customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-8 py-1 text-xs h-8"
            onKeyDown={e => e.key === 'Enter' && navigate(`/tickets?search=${search}`)}
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button onClick={() => dispatch(toggleTheme())} className="btn-icon">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

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
            <div className="absolute right-0 top-10 w-80 card shadow-xl z-50 animate-fade-in">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</span>
                {unread > 0 && (
                  <button onClick={handleMarkAllRead} className="text-2xs text-primary-600 hover:underline flex items-center gap-1">
                    <Check className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">No notifications</p>
                ) : (
                  notifications.slice(0, 10).map(n => (
                    <div
                      key={n.id}
                      className={cn('px-3 py-2 border-b border-gray-50 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800', !n.is_read && 'bg-primary-50/50 dark:bg-primary-900/10')}
                      onClick={() => n.action_url && navigate(n.action_url)}
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

        <div className="flex items-center gap-2 ml-1 pl-3 border-l border-gray-100 dark:border-gray-800">
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
  )
}
