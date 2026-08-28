import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { cdrApi } from '../services/api'
import { useAdminClient } from '../hooks/useAdminClient'
import { Phone, PhoneCall, PhoneOff, Clock, TrendingUp, Users, Download } from 'lucide-react'
import { cn } from '../utils/cn'

async function authDownload(url: string, filename: string, token: string | null) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

const DEPT_COLORS: Record<string, string> = {
  'General Enquiries':  '#3b82f6',
  'Sales & Marketing':  '#22c55e',
  'Customer Service':   '#a855f7',
  'Accounts & Finance': '#f97316',
  'HR':                 '#ec4899',
  'Operator':           '#64748b',
}

function fmt(s: number | null) {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = String(s % 60).padStart(2, '0')
  return `${m}:${sec}`
}

function pct(n: number, total: number) {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

export default function IVRReportPage() {
  const { clientFilter } = useAdminClient()
  const token = useSelector((s: RootState) => s.auth.accessToken)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filterParams = {
    ...clientFilter,
    ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }),
  }

  const { data: stats, isLoading } = useQuery({
    queryKey: ['ivr-stats', filterParams],
    queryFn: () => cdrApi.stats(filterParams).then(r => r.data),
  })

  const { data: agentData } = useQuery({
    queryKey: ['ivr-agents', filterParams],
    queryFn: () => cdrApi.list({ ...filterParams, limit: 1000 }).then(r => r.data),
  })

  // Aggregate by agent
  const agentMap: Record<string, { name: string; total: number; answered: number; duration: number }> = {}
  ;(agentData?.items || []).forEach((r: any) => {
    if (!r.agent_name) return
    if (!agentMap[r.agent_name]) agentMap[r.agent_name] = { name: r.agent_name, total: 0, answered: 0, duration: 0 }
    agentMap[r.agent_name].total++
    if (r.call_status === 'completed') {
      agentMap[r.agent_name].answered++
      agentMap[r.agent_name].duration += r.call_duration || 0
    }
  })
  const agentRows = Object.values(agentMap).sort((a, b) => b.total - a.total)

  // Aggregate by hour
  const hourMap: Record<number, number> = {}
  ;(agentData?.items || []).forEach((r: any) => {
    if (!r.call_start_time && !r.created_at) return
    const h = new Date(r.call_start_time || r.created_at).getHours()
    hourMap[h] = (hourMap[h] || 0) + 1
  })
  const maxHourCount = Math.max(1, ...Object.values(hourMap))
  const hours = Array.from({ length: 24 }, (_, i) => ({ h: i, count: hourMap[i] || 0 }))

  const depts = stats?.by_department || {}
  const deptTotal = Object.values(depts).reduce((a: number, b: any) => a + b, 0) as number
  const deptEntries = Object.entries(depts).sort((a: any, b: any) => b[1] - a[1])

  const exportUrl = cdrApi.exportUrl(filterParams)

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">IVR Report</h1>
          <p className="text-xs text-gray-500">Call centre analytics — department, agent, and hourly breakdown</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" className="input text-sm w-auto" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} placeholder="From" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" className="input text-sm w-auto" value={dateTo}
            onChange={e => setDateTo(e.target.value)} placeholder="To" />
          <button
            className="btn btn-secondary flex items-center gap-1.5 text-sm"
            onClick={() => authDownload(exportUrl, `ivr_report_${new Date().toISOString().slice(0,10)}.csv`, token)}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Calls" value={stats.total} icon={<Phone className="w-4 h-4 text-blue-600" />} bg="bg-blue-50" />
          <StatCard label="Answered" value={stats.answered} icon={<PhoneCall className="w-4 h-4 text-green-600" />} bg="bg-green-50"
            sub={`${pct(stats.answered, stats.total)}% answer rate`} />
          <StatCard label="Abandoned" value={stats.abandoned} icon={<PhoneOff className="w-4 h-4 text-red-500" />} bg="bg-red-50"
            sub={`${pct(stats.abandoned, stats.total)}% abandon rate`} />
          <StatCard label="Avg Wait" value={fmt(stats.avg_queue_seconds)} icon={<Clock className="w-4 h-4 text-amber-500" />} bg="bg-amber-50" />
          <StatCard label="Avg Talk" value={fmt(stats.avg_talk_seconds)} icon={<PhoneCall className="w-4 h-4 text-purple-600" />} bg="bg-purple-50" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Department breakdown */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary-500" /> Calls by Department
          </h2>
          {deptEntries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data</p>
          ) : (
            <div className="space-y-3">
              {deptEntries.map(([dept, count]: any) => (
                <div key={dept}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">{dept}</span>
                    <span className="text-gray-500">{count} calls ({pct(count, deptTotal)}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct(count, deptTotal)}%`,
                        backgroundColor: DEPT_COLORS[dept] || '#94a3b8',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hourly distribution */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary-500" /> Calls by Hour
          </h2>
          <div className="flex items-end gap-0.5 h-32">
            {hours.map(({ h, count }) => (
              <div key={h} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                <div
                  className="w-full rounded-t transition-all bg-primary-400 hover:bg-primary-500"
                  style={{ height: `${(count / maxHourCount) * 100}%`, minHeight: count ? '4px' : '0' }}
                />
                {/* tooltip */}
                <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10">
                  <div className="bg-gray-800 text-white text-2xs rounded px-1.5 py-0.5 whitespace-nowrap">
                    {h}:00 — {count} calls
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-2xs text-gray-400 mt-1">
            <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
        </div>
      </div>

      {/* Agent performance table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Agent Performance</h2>
        </div>
        {agentRows.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No agent data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-2xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2 text-left">Agent</th>
                  <th className="px-4 py-2 text-right">Total Calls</th>
                  <th className="px-4 py-2 text-right">Answered</th>
                  <th className="px-4 py-2 text-right">Answer Rate</th>
                  <th className="px-4 py-2 text-right">Total Talk Time</th>
                  <th className="px-4 py-2 text-right">Avg Talk Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {agentRows.map(a => (
                  <tr key={a.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{a.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{a.total}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-medium">{a.answered}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn('px-2 py-0.5 rounded-full text-2xs font-semibold',
                        pct(a.answered, a.total) >= 80 ? 'bg-green-100 text-green-700'
                          : pct(a.answered, a.total) >= 50 ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700')}>
                        {pct(a.answered, a.total)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600 dark:text-gray-300">{fmt(a.duration)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-500">{fmt(a.answered ? Math.round(a.duration / a.answered) : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, bg, sub }: { label: string; value: any; icon: React.ReactNode; bg: string; sub?: string }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className={cn('p-2 rounded-lg flex-shrink-0', bg)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-2xs text-gray-500">{label}</p>
        {sub && <p className="text-2xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}
