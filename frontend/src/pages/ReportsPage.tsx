import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { BarChart3, Download, Filter } from 'lucide-react'
import { cn } from '../utils/cn'

export default function ReportsPage() {
  const [tab, setTab] = useState<'tickets' | 'calls' | 'agents'>('tickets')

  const { data: ticketData } = useQuery({ queryKey: ['report-tickets'], queryFn: () => reportsApi.tickets().then(r => r.data) })
  const { data: callData } = useQuery({ queryKey: ['report-calls'], queryFn: () => reportsApi.calls().then(r => r.data) })
  const { data: agentData } = useQuery({ queryKey: ['report-agents'], queryFn: () => reportsApi.agentProductivity().then(r => r.data) })

  const tabs = [
    { id: 'tickets', label: 'Ticket Reports' },
    { id: 'calls', label: 'Call Reports' },
    { id: 'agents', label: 'Agent Productivity' },
  ]

  const statusCounts: any = {}
  ;(ticketData || []).forEach((t: any) => {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1
  })
  const statusChartData = Object.entries(statusCounts).map(([status, count]) => ({ status, count }))

  const callStatusCounts: any = {}
  ;(callData || []).forEach((c: any) => {
    callStatusCounts[c.status] = (callStatusCounts[c.status] || 0) + 1
  })
  const callChartData = Object.entries(callStatusCounts).map(([status, count]) => ({ status, count }))

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Reports</h1>
          <p className="text-xs text-gray-500">Analytics and performance metrics</p>
        </div>
      </div>

      <div className="card">
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={cn('px-4 py-2.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors',
                tab === t.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'tickets' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tickets by Status</p>
                <p className="text-xs text-gray-500">{(ticketData || []).length} total</p>
              </div>
              {statusChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={statusChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="status" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No ticket data</div>
              )}
              <div className="overflow-x-auto mt-4">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="th">Ticket #</th>
                      <th className="th">Subject</th>
                      <th className="th">Status</th>
                      <th className="th">Priority</th>
                      <th className="th">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {(ticketData || []).slice(0, 10).map((t: any) => (
                      <tr key={t.id}>
                        <td className="td font-mono text-xs text-primary-600">{t.ticket_number}</td>
                        <td className="td text-xs line-clamp-1">{t.subject}</td>
                        <td className="td"><span className={`badge-${t.status}`}>{t.status}</span></td>
                        <td className="td"><span className={`badge-${t.priority}`}>{t.priority}</span></td>
                        <td className="td text-xs text-gray-400">{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'calls' && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Calls by Status</p>
              {callChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={callChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="status" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No call data</div>
              )}
            </div>
          )}

          {tab === 'agents' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Agent Performance</p>
              {(agentData || []).length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No agent data</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                      <tr>
                        <th className="th">Agent ID</th>
                        <th className="th">Total Tickets</th>
                        <th className="th">Resolved</th>
                        <th className="th">Closed</th>
                        <th className="th">Resolution Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {(agentData || []).map((a: any) => (
                        <tr key={a.agent_id}>
                          <td className="td text-xs font-mono">{a.agent_id || 'Unassigned'}</td>
                          <td className="td text-xs">{a.total}</td>
                          <td className="td text-xs text-green-600">{a.resolved}</td>
                          <td className="td text-xs text-gray-500">{a.closed}</td>
                          <td className="td">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 max-w-20">
                                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${a.total ? Math.round(((a.resolved + a.closed) / a.total) * 100) : 0}%` }} />
                              </div>
                              <span className="text-2xs text-gray-500">{a.total ? Math.round(((a.resolved + a.closed) / a.total) * 100) : 0}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
