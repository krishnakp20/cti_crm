import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../services/api'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { useAdminClient } from '../hooks/useAdminClient'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'
import { Ticket, Phone, Clock, CheckCircle, AlertTriangle, TrendingUp, Users, Activity, Building2 } from 'lucide-react'

const COLORS = ['#004058', '#e30023', '#779520', '#ffcd00', '#005872', '#a6b957']

function StatCard({ icon: Icon, label, value, sub, accent = '#004058' }: any) {
  return (
    <div className="stat-card group">
      <div className="p-2.5 rounded-xl flex-shrink-0"
        style={{ background: `${accent}18` }}>
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight mt-1">{value ?? '—'}</p>
        {sub && <p className="text-2xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {/* Left accent bar */}
      <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: accent }} />
    </div>
  )
}

export default function DashboardPage() {
  const user = useSelector((s: RootState) => s.auth.user)
  const { clientFilter, adminClientId, adminClientName } = useAdminClient()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', adminClientId],
    queryFn: () => reportsApi.dashboard(clientFilter).then(r => r.data),
  })

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
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {adminClientName ? `Viewing: ${adminClientName}` : 'All Clients — Admin view'}
          </p>
        </div>
      </div>
      {adminClientId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: '#e8f2f7', border: '1px solid #a1cce0', color: '#004058' }}>
          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
          Filtered to: <span className="font-semibold">{adminClientName}</span> — use the client switcher in the top bar to change.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Ticket} label="Total Tickets" value={stats.total} accent="#004058" />
        <StatCard icon={AlertTriangle} label="Open Tickets" value={stats.open} accent="#ffcd00" />
        <StatCard icon={Clock} label="Pending" value={stats.pending} accent="#e30023" />
        <StatCard icon={CheckCircle} label="Resolved Today" value={stats.resolved_today} accent="#779520" />
        <StatCard icon={TrendingUp} label="Created Today" value={stats.created_today} accent="#005872" />
        <StatCard icon={Phone} label="Total Calls" value={calls.total} accent="#004058" />
        <StatCard icon={Activity} label="Calls Today" value={calls.today} accent="#779520" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Weekly Ticket Trend</h3>
          {weeklyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={weeklyTrend}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#004058" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#004058" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Area type="monotone" dataKey="count" stroke="#004058" fill="url(#colorCount)" strokeWidth={2} dot={false} />
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
                <Bar dataKey="count" fill="#004058" radius={[4, 4, 0, 0]} />
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
