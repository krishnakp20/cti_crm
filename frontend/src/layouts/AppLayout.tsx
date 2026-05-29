import { Outlet } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import TopBar from '../components/layout/TopBar'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { cn } from '../utils/cn'

export default function AppLayout() {
  const collapsed = useSelector((s: RootState) => s.ui.sidebarCollapsed)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div className={cn('flex-1 flex flex-col overflow-hidden transition-all duration-200')}>
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
