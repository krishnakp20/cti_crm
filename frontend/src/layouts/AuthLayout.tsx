import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary-600 shadow-lg shadow-primary-600/30 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CTI CRM</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enterprise Call Center Platform</p>
        </div>
        <div className="card p-6 shadow-xl shadow-gray-200/50 dark:shadow-none">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
