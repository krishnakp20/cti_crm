import { useQuery } from '@tanstack/react-query'
import { auditApi } from '../services/api'
import { format } from 'date-fns'
import { Shield } from 'lucide-react'

export default function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => auditApi.list({ limit: 100 }).then(r => r.data),
  })

  const logs = data?.items || []

  return (
    <div className="space-y-3 max-w-6xl">
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Audit Logs</h1>
        <p className="text-xs text-gray-500">{data?.total || 0} audit entries</p>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="th">Action</th>
                <th className="th">Resource</th>
                <th className="th">User</th>
                <th className="th">IP Address</th>
                <th className="th">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={5} className="td text-center py-8 text-gray-400">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="td text-center py-12 text-gray-400">No audit logs</td></tr>
              ) : (
                logs.map((log: any) => (
                  <tr key={log.id} className="table-row-hover">
                    <td className="td">
                      <span className="badge bg-blue-100 text-blue-700 capitalize">{log.action?.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="td text-xs">
                      <span className="font-medium capitalize">{log.resource_type}</span>
                      {log.resource_id && <span className="text-gray-400"> #{log.resource_id}</span>}
                    </td>
                    <td className="td text-xs text-gray-500">{log.user_email || '—'}</td>
                    <td className="td font-mono text-xs text-gray-400">{log.ip_address || '—'}</td>
                    <td className="td text-xs text-gray-400">{log.created_at ? format(new Date(log.created_at), 'MMM d, HH:mm:ss') : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
