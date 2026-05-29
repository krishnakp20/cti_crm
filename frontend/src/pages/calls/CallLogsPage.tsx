import { useQuery } from '@tanstack/react-query'
import { callsApi } from '../../services/api'
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'

const STATUS_ICONS: any = {
  completed: { icon: PhoneOutgoing, cls: 'text-green-600' },
  answered: { icon: Phone, cls: 'text-blue-600' },
  no_answer: { icon: PhoneMissed, cls: 'text-red-500' },
  busy: { icon: PhoneMissed, cls: 'text-orange-500' },
  failed: { icon: PhoneMissed, cls: 'text-red-600' },
}

function formatDuration(secs: number) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function CallLogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['call-logs'],
    queryFn: () => callsApi.listLogs({ limit: 50 }).then(r => r.data),
  })

  const logs = data?.items || []

  return (
    <div className="space-y-3 max-w-6xl">
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Call Logs</h1>
        <p className="text-xs text-gray-500">{data?.total || 0} total calls</p>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="th">Status</th>
                <th className="th">Phone</th>
                <th className="th">Direction</th>
                <th className="th">Duration</th>
                <th className="th">Disposition</th>
                <th className="th">Agent</th>
                <th className="th">Date</th>
                <th className="th">Recording</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={8} className="td text-center py-8 text-gray-400">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} className="td text-center py-12 text-gray-400">No call logs</td></tr>
              ) : (
                logs.map((log: any) => {
                  const StatusIcon = STATUS_ICONS[log.status]?.icon || Phone
                  const statusCls = STATUS_ICONS[log.status]?.cls || 'text-gray-400'
                  return (
                    <tr key={log.id} className="table-row-hover">
                      <td className="td">
                        <StatusIcon className={cn('w-4 h-4', statusCls)} />
                      </td>
                      <td className="td font-mono text-xs">{log.phone_number}</td>
                      <td className="td">
                        <span className={cn('badge capitalize', log.direction === 'inbound' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                          {log.direction}
                        </span>
                      </td>
                      <td className="td text-xs text-gray-500">{formatDuration(log.duration)}</td>
                      <td className="td text-xs text-gray-500">{log.disposition || '—'}</td>
                      <td className="td text-xs text-gray-500">{log.agent_id || '—'}</td>
                      <td className="td text-xs text-gray-400">{log.created_at ? format(new Date(log.created_at), 'MMM d, HH:mm') : '—'}</td>
                      <td className="td">
                        {log.recording_url ? (
                          <a href={log.recording_url} target="_blank" rel="noopener noreferrer" className="text-2xs text-primary-600 hover:underline">Play</a>
                        ) : <span className="text-2xs text-gray-400">—</span>}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
