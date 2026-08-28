import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi, clientsApi } from '../services/api'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { useForm, useWatch } from 'react-hook-form'
import { Plus, Search, X, Loader2, UserCheck, UserX, Settings2, Building2 } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { cn } from '../utils/cn'
import api from '../services/api'
import { useAdminClient } from '../hooks/useAdminClient'

const ROLE_COLORS: any = {
  admin: 'badge bg-red-100 text-red-700',
  client: 'badge bg-blue-100 text-blue-700',
  team_user: 'badge bg-purple-100 text-purple-700',
  agent: 'badge bg-green-100 text-green-700',
}

export default function UsersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [dialerUser, setDialerUser] = useState<any>(null)  // user being edited in dialer modal
  const [dialerSaving, setDialerSaving] = useState(false)
  const qc = useQueryClient()
  const { register, handleSubmit, reset, control } = useForm()
  const watchConnectionType = useWatch({ control, name: 'connection_type', defaultValue: 'remote' })
  const currentUser = useSelector((s: RootState) => s.auth.user)
  const { clientFilter, adminClientId, adminClientName } = useAdminClient()

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clientsApi.list({ limit: 100 }).then(r => r.data),
    enabled: currentUser?.role === 'admin',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search, adminClientId],
    queryFn: () => usersApi.list({ page, limit: 20, search: search || undefined, ...clientFilter }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created')
      setShowModal(false)
      reset()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: any) => usersApi.update(id, { is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Updated') },
  })

  const saveDialerSettings = async (u: any, settings: any) => {
    setDialerSaving(true)
    try {
      await api.patch(`/users/${u.id}`, settings)
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('Dialer settings saved')
      setDialerUser(null)
    } catch {
      toast.error('Failed to save')
    }
    setDialerSaving(false)
  }

  const users = data?.items || []

  return (
    <div className="space-y-3 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Users</h1>
          <p className="text-xs text-gray-500">{data?.total || 0} users{adminClientName ? ` — ${adminClientName}` : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus className="w-3.5 h-3.5" /> Add User
        </button>
      </div>
      {adminClientId && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg text-xs text-primary-700 dark:text-primary-300">
          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
          Filtered to: <span className="font-semibold">{adminClientName}</span>
        </div>
      )}

      <div className="card">
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input className="input pl-8 h-8 text-xs" placeholder="Search users..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="th">User</th>
                <th className="th">Role</th>
                <th className="th">Mobile</th>
                <th className="th">Status</th>
                <th className="th">Last Login</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={6} className="td text-center py-8 text-gray-400">Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="td text-center py-12 text-gray-400">No users found</td></tr>
              ) : (
                users.map((user: any) => (
                  <tr key={user.id} className="table-row-hover">
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 text-xs font-bold">
                          {user.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-900 dark:text-white">{user.full_name}</p>
                          <p className="text-2xs text-gray-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td"><span className={ROLE_COLORS[user.role] || 'badge bg-gray-100'}>{user.role?.replace('_', ' ')}</span></td>
                    <td className="td text-xs text-gray-500">{user.mobile || '—'}</td>
                    <td className="td">
                      {user.is_active
                        ? <span className="badge bg-green-100 text-green-700">Active</span>
                        : <span className="badge bg-gray-100 text-gray-600">Inactive</span>
                      }
                    </td>
                    <td className="td text-xs text-gray-400">{user.last_login ? format(new Date(user.last_login), 'MMM d, HH:mm') : 'Never'}</td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        {user.role === 'agent' && (
                          <button
                            className="btn-icon text-blue-400 hover:text-blue-600"
                            onClick={() => setDialerUser(user)}
                            title="Dialer Settings"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          className={cn('btn-icon', user.is_active ? 'text-red-400 hover:text-red-600' : 'text-green-500 hover:text-green-700')}
                          onClick={() => toggleActiveMutation.mutate({ id: user.id, is_active: !user.is_active })}
                          title={user.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Add New User</h3>
              <button className="btn-icon" onClick={() => { setShowModal(false); reset() }}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-3">
              <div>
                <label className="label">Full Name</label>
                <input {...register('full_name', { required: true })} className="input" placeholder="John Doe" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" {...register('email', { required: true })} className="input" placeholder="john@example.com" />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" {...register('password', { required: true })} className="input" placeholder="Min. 8 characters" />
              </div>
              <div>
                <label className="label">Mobile</label>
                <input {...register('mobile')} className="input" placeholder="+91 9999999999" />
              </div>
              <div>
                <label className="label">Role</label>
                <select {...register('role', { required: true })} className="input">
                  <option value="agent">Agent</option>
                  <option value="team_user">Team User</option>
                  <option value="client">Client Admin</option>
                </select>
              </div>
              {currentUser?.role === 'admin' && (
                <div>
                  <label className="label">Assign to Client</label>
                  <select {...register('client_id')} className="input">
                    <option value="">— Select Client —</option>
                    {(clientsData?.items || []).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Agent User ID</label>
                <input {...register('dialer_user')} className="input" placeholder="e.g. 7231 (optional)" />
              </div>
              <div>
                <label className="label">Connection Type</label>
                <select {...register('connection_type')} className="input">
                  <option value="remote">Remote (call forwarding to mobile)</option>
                  <option value="webrtc">WebRTC (browser softphone)</option>
                </select>
              </div>
              {watchConnectionType === 'remote' && (
                <div>
                  <label className="label">Agent Mobile (for call forwarding)</label>
                  <input {...register('agent_mobile')} className="input" placeholder="+91 9999999999" />
                </div>
              )}
              {watchConnectionType === 'webrtc' && (
                <>
                  <div>
                    <label className="label">SIP Server URL</label>
                    <input {...register('sip_server_url')} className="input" placeholder="wss://192.168.10.30:8089/ws" />
                  </div>
                  <div>
                    <label className="label">SIP Password</label>
                    <input type="password" {...register('sip_password')} className="input" placeholder="Asterisk SIP password" />
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowModal(false); reset() }}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Dialer Settings Modal (per agent) ─────────────────────────────────── */}
      {dialerUser && (
        <DialerSettingsModal
          user={dialerUser}
          onClose={() => setDialerUser(null)}
          onSave={saveDialerSettings}
          saving={dialerSaving}
        />
      )}
    </div>
  )
}

function DialerSettingsModal({ user, onClose, onSave, saving }: {
  user: any; onClose: () => void
  onSave: (u: any, settings: any) => void; saving: boolean
}) {
  const [connType, setConnType] = useState<'remote' | 'webrtc'>(user.connection_type || 'remote')
  const [agentMobile, setAgentMobile] = useState(user.agent_mobile || '')
  const [sipServerUrl, setSipServerUrl] = useState(user.sip_server_url || '')
  const [sipPassword, setSipPassword] = useState('')
  const [dialerUserId, setDialerUserId] = useState(user.dialer_user || '')
  const [extension, setExtension] = useState(user.extension || '')

  const handleSave = () => {
    const settings: any = {
      connection_type: connType,
      dialer_user: dialerUserId || null,
      extension: extension || null,
      agent_mobile: connType === 'remote' ? (agentMobile || null) : null,
      sip_server_url: connType === 'webrtc' ? (sipServerUrl || null) : null,
    }
    if (connType === 'webrtc' && sipPassword) settings.sip_password = sipPassword
    onSave(user, settings)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card p-5 w-full max-w-md animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Agent Call Settings</h3>
            <p className="text-xs text-gray-500">{user.full_name} — {user.email}</p>
          </div>
          <button className="btn-icon" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">Agent User ID</label>
            <input className="input" placeholder="e.g. 7231" value={dialerUserId} onChange={e => setDialerUserId(e.target.value)} />
          </div>
          <div>
            <label className="label">SIP Extension</label>
            <input className="input" placeholder="e.g. 2001" value={extension} onChange={e => setExtension(e.target.value)} />
          </div>
          <div>
            <label className="label">Connection Type</label>
            <select className="input" value={connType} onChange={e => setConnType(e.target.value as any)}>
              <option value="remote">Remote — call forwarding to mobile phone</option>
              <option value="webrtc">WebRTC — browser-based softphone (no mobile needed)</option>
            </select>
          </div>

          {connType === 'remote' && (
            <div>
              <label className="label">Agent Mobile Number</label>
              <input className="input" placeholder="+91 9999999999" value={agentMobile} onChange={e => setAgentMobile(e.target.value)} />
            </div>
          )}

          {connType === 'webrtc' && (
            <>
              <div>
                <label className="label">SIP Server URL</label>
                <input className="input" placeholder="wss://192.168.10.30:8089/ws" value={sipServerUrl} onChange={e => setSipServerUrl(e.target.value)} />
              </div>
              <div>
                <label className="label">SIP Password {sipPassword === '' && <span className="text-gray-400 font-normal">(leave blank to keep existing)</span>}</label>
                <input type="password" className="input" placeholder="SIP extension password" value={sipPassword} onChange={e => setSipPassword(e.target.value)} />
              </div>
              <div className="text-xs text-blue-700 bg-blue-50 rounded-lg p-3 dark:bg-blue-900/20 dark:text-blue-300">
                Agent will use this browser as a softphone. Calls will ring in the browser — no mobile number needed.
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button className="btn-primary flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
