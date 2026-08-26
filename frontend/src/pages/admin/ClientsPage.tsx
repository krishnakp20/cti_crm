import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '../../services/api'
import { useForm } from 'react-hook-form'
import { Building2, CheckCircle, XCircle, Search, Plus, X, Loader2 } from 'lucide-react'
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
  const [showModal, setShowModal] = useState(false)
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, status, search],
    queryFn: () => clientsApi.list({ page, limit: 20, status: status || undefined, search: search || undefined }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (d: any) => clientsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Client created successfully')
      setShowModal(false)
      reset()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create client'),
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
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Client
        </button>
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
                          <button className="btn-sm btn text-green-600 bg-green-50 hover:bg-green-100 border-0" onClick={() => activateMutation.mutate(client.id)}>
                            <CheckCircle className="w-3.5 h-3.5" /> Activate
                          </button>
                        )}
                        {client.status === 'active' && (
                          <button className="btn-sm btn text-red-600 bg-red-50 hover:bg-red-100 border-0" onClick={() => deactivateMutation.mutate(client.id)}>
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

      {/* Add Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Add New Client</h3>
                <p className="text-xs text-gray-400 mt-0.5">Creates the company and a client admin account</p>
              </div>
              <button className="btn-icon" onClick={() => { setShowModal(false); reset() }}><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Company Details</p>
              <div>
                <label className="label">Company Name <span className="text-red-500">*</span></label>
                <input {...register('company_name', { required: true })} className={cn('input', errors.company_name && 'border-red-400')} placeholder="Sheesha Green" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Company Email <span className="text-red-500">*</span></label>
                  <input type="email" {...register('email', { required: true })} className="input" placeholder="info@company.com" />
                </div>
                <div>
                  <label className="label">Max Agents</label>
                  <input type="number" {...register('max_agents')} className="input" placeholder="10" defaultValue={10} />
                </div>
              </div>

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Client Admin Login</p>
              <div>
                <label className="label">Admin Full Name <span className="text-red-500">*</span></label>
                <input {...register('admin_name', { required: true })} className="input" placeholder="Admin name" />
              </div>
              <div>
                <label className="label">Admin Email <span className="text-red-500">*</span></label>
                <input type="email" {...register('admin_email', { required: true })} className="input" placeholder="admin@company.com" />
              </div>
              <div>
                <label className="label">Admin Password <span className="text-red-500">*</span></label>
                <input type="password" {...register('admin_password', { required: true, minLength: 6 })} className="input" placeholder="Min. 6 characters" />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowModal(false); reset() }}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
