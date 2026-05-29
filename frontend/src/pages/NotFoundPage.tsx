import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <p className="text-7xl font-bold text-primary-600">404</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-4">Page not found</h1>
        <p className="text-gray-500 mt-2 text-sm">The page you're looking for doesn't exist.</p>
        <Link to="/" className="btn-primary mt-6 inline-flex">Go to Dashboard</Link>
      </div>
    </div>
  )
}
