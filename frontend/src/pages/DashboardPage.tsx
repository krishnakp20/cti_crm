import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../services/api'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'
import { Ticket, Phone, Clock, CheckCircle, AlertTriangle, TrendingUp, Users, Activity } from 'lucide-react'

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#6b7280', '#8b5cf6', '#ef4444']

function StatCard({ icon: Icon, label, value, sub, color = 'primary' }: any) {
  const colorMap: any = {
    primary: 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  }
  return (
    <div className="stat-card">
      <div className={`p-2 rounded-lg ${colorMap[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-2xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{value ?? '—'}</p>
        {sub && <p className="text-2xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const user = useSelector((s: RootState) => s.auth.user)
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => reportsApi.dashboard().then(r => r.data) })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const stats = data?.tickets || {}
  const calls = data?.calls || {}
  const statusDist = data?.status_distribution || []
  const weeklyTrend = data?.weekly_trend || []
  const priorityDist = data?.priority_distribution || []

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            Good morning, {user?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Here's what's happening today</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Ticket} label="Total Tickets" value={stats.total} color="primary" />
        <StatCard icon={AlertTriangle} label="Open Tickets" value={stats.open} color="yellow" />
        <StatCard icon={Clock} label="Pending" value={stats.pending} color="red" />
        <StatCard icon={CheckCircle} label="Resolved Today" value={stats.resolved_today} color="green" />
        <StatCard icon={TrendingUp} label="Created Today" value={stats.created_today} color="primary" />
        <StatCard icon={Phone} label="Total Calls" value={calls.total} color="primary" />
        <StatCard icon={Activity} label="Calls Today" value={calls.today} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Weekly Ticket Trend</h3>
          {weeklyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={weeklyTrend}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#colorCount)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-44 text-gray-400 text-sm">No data yet</div>
          )}
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Status Distribution</h3>
          {statusDist.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={statusDist} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                    {statusDist.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {statusDist.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-2xs text-gray-600 dark:text-gray-400 capitalize">{item.status}</span>
                    </div>
                    <span className="text-2xs font-medium text-gray-700 dark:text-gray-300">{item.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-44 text-gray-400 text-sm">No data</div>
          )}
        </div>

        <div className="card p-4 lg:col-span-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Priority Breakdown</h3>
          {priorityDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={priorityDist} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="priority" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-28 text-gray-400 text-sm">No data</div>
          )}
        </div>
      </div>
    </div>
  )
}
