import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '../../services/api'
import { Building2, CheckCircle, XCircle, Search } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

const STATUS_COLORS: any = {
  pending: 'badge bg-yellow-100 text-yellow-700',
  active: 'badge bg-green-100 text-green-700',
  inactive: 'badge bg-gray-100 text-gray-600',
  suspended: 'badge bg-red-100 text-red-700',
}

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, status, search],
    queryFn: () => clientsApi.list({ page, limit: 20, status: status || undefined, search: search || undefined }).then(r => r.data),
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => clientsApi.activate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); toast.success('Client activated') },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => clientsApi.deactivate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); toast.success('Client deactivated') },
  })

  const clients = data?.items || []

  return (
    <div className="space-y-3 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Clients</h1>
          <p className="text-xs text-gray-500">{data?.total || 0} registered companies</p>
        </div>
      </div>

      <div className="card">
        <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input className="input pl-8 h-8 text-xs" placeholder="Search clients..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="input w-36 h-8 text-xs" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="th">Company</th>
                <th className="th">Email</th>
                <th className="th">Plan</th>
                <th className="th">Status</th>
                <th className="th">Registered</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={6} className="td text-center py-8 text-gray-400">Loading...</td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={6} className="td text-center py-12 text-gray-400">No clients found</td></tr>
              ) : (
                clients.map((client: any) => (
                  <tr key={client.id} className="table-row-hover">
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                          <Building2 className="w-3.5 h-3.5 text-primary-600" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-900 dark:text-white">{client.company_name}</p>
                          <p className="text-2xs text-gray-400">{client.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td text-xs">{client.email}</td>
                    <td className="td"><span className="badge bg-indigo-100 text-indigo-700 capitalize">{client.plan}</span></td>
                    <td className="td"><span className={STATUS_COLORS[client.status] || 'badge'}>{client.status}</span></td>
                    <td className="td text-xs text-gray-400">{client.created_at ? format(new Date(client.created_at), 'MMM d, yyyy') : '—'}</td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        {client.status !== 'active' && (
                          <button
                            className="btn-sm btn text-green-600 bg-green-50 hover:bg-green-100 border-0"
                            onClick={() => activateMutation.mutate(client.id)}
                            title="Activate"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Activate
                          </button>
                        )}
                        {client.status === 'active' && (
                          <button
                            className="btn-sm btn text-red-600 bg-red-50 hover:bg-red-100 border-0"
                            onClick={() => deactivateMutation.mutate(client.id)}
                            title="Deactivate"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Deactivate
                          </button>
                        )}
                      </div>
                    </td>
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
