import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ivrApi, usersApi, clientsApi } from '../services/api'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { Phone, Plus, Edit2, Trash2, AlertTriangle, Check, X, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '../utils/cn'

const BACKUP_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'agent', label: 'Agent' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'forwarding', label: 'Forwarding' },
]

const PRESS_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

function emptyRoute(configId: number) {
  return {
    press_key: '1',
    department_name: '',
    primary_agent_id: null as number | null,
    backup_type: 'none',
    backup_agent_id: null as number | null,
    backup_number: '',
    dept_audio: '',
    notes: '',
    sort_order: 0,
    is_active: true,
  }
}

export default function IVRRoutingPage() {
  const user = useSelector((s: RootState) => s.auth.user)
  const isAdmin = user?.role === 'admin'
  const isClient = user?.role === 'client'
  const qc = useQueryClient()

  const [selectedConfig, setSelectedConfig] = useState<number | null>(null)
  const [editRoute, setEditRoute] = useState<any | null>(null)
  const [showRouteModal, setShowRouteModal] = useState(false)
  const [overrideRoute, setOverrideRoute] = useState<any | null>(null)
  const [overrideAgentId, setOverrideAgentId] = useState<number | ''>('')
  const [overrideReason, setOverrideReason] = useState('')
  const [showNewConfig, setShowNewConfig] = useState(false)
  const [newConfigClientId, setNewConfigClientId] = useState<number | ''>('')
  const [newConfigName, setNewConfigName] = useState('Main IVR')

  // Fetch configs
  const { data: configs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ['ivr-configs'],
    queryFn: () => ivrApi.listConfigs().then(r => r.data),
  })

  // Auto-select first config
  const activeConfigId = selectedConfig ?? (configs[0]?.id ?? null)

  // Fetch routes for selected config
  const { data: routes = [], isLoading: loadingRoutes } = useQuery({
    queryKey: ['ivr-routes', activeConfigId],
    queryFn: () => ivrApi.listRoutes(activeConfigId!).then(r => r.data),
    enabled: !!activeConfigId,
  })

  // Fetch agents for dropdowns
  const { data: agentsData } = useQuery({
    queryKey: ['users-agents'],
    queryFn: () => usersApi.list({ role: 'agent', limit: 100 }).then(r => r.data),
  })
  const agents: any[] = agentsData?.items ?? agentsData ?? []

  // Fetch clients (admin only)
  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clientsApi.list({ limit: 100 }).then(r => r.data),
    enabled: isAdmin,
  })
  const clients: any[] = clientsData?.items ?? []

  // Mutations
  const addRouteMutation = useMutation({
    mutationFn: (data: any) => ivrApi.addRoute(activeConfigId!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ivr-routes'] }); setShowRouteModal(false); toast.success('Route added') },
    onError: () => toast.error('Failed to add route'),
  })

  const updateRouteMutation = useMutation({
    mutationFn: ({ id, data }: any) => ivrApi.updateRoute(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ivr-routes'] }); setShowRouteModal(false); toast.success('Route updated') },
    onError: () => toast.error('Failed to update route'),
  })

  const deleteRouteMutation = useMutation({
    mutationFn: (id: number) => ivrApi.deleteRoute(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ivr-routes'] }); toast.success('Route deleted') },
    onError: () => toast.error('Failed to delete route'),
  })

  const setOverrideMutation = useMutation({
    mutationFn: ({ routeId, data }: any) => ivrApi.setOverride(routeId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ivr-routes'] }); setOverrideRoute(null); toast.success('Override activated') },
    onError: () => toast.error('Failed to set override'),
  })

  const clearOverrideMutation = useMutation({
    mutationFn: (routeId: number) => ivrApi.clearOverride(routeId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ivr-routes'] }); toast.success('Override removed') },
    onError: () => toast.error('Failed to clear override'),
  })

  const createConfigMutation = useMutation({
    mutationFn: (data: any) => ivrApi.createConfig(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['ivr-configs'] })
      setSelectedConfig(res.data.id)
      setShowNewConfig(false)
      toast.success('IVR Config created')
    },
    onError: () => toast.error('Failed to create config'),
  })

  // Submit route form
  const handleRouteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const fd = new FormData(e.target as HTMLFormElement)
    const data = {
      press_key: fd.get('press_key') as string,
      department_name: fd.get('department_name') as string,
      primary_agent_id: fd.get('primary_agent_id') ? Number(fd.get('primary_agent_id')) : null,
      backup_type: fd.get('backup_type') as string,
      backup_agent_id: fd.get('backup_agent_id') ? Number(fd.get('backup_agent_id')) : null,
      backup_number: fd.get('backup_number') as string || null,
      dept_audio: fd.get('dept_audio') as string || null,
      notes: fd.get('notes') as string || null,
      sort_order: Number(fd.get('sort_order') || 0),
      is_active: true,
    }
    if (editRoute?.id) {
      updateRouteMutation.mutate({ id: editRoute.id, data })
    } else {
      addRouteMutation.mutate(data)
    }
  }

  const openAddRoute = () => {
    setEditRoute(emptyRoute(activeConfigId!))
    setShowRouteModal(true)
  }

  const openEditRoute = (r: any) => {
    setEditRoute(r)
    setShowRouteModal(true)
  }

  const handleOverrideSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!overrideRoute || !overrideAgentId) return
    setOverrideMutation.mutate({
      routeId: overrideRoute.id,
      data: { override_agent_id: Number(overrideAgentId), reason: overrideReason },
    })
  }

  if (!isAdmin && !isClient) {
    return <div className="p-8 text-center text-gray-500">Access restricted to Admin and Client roles.</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary-600" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">IVR Routing</h1>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button className="btn btn-outline text-xs" onClick={() => setShowNewConfig(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> New Config
            </button>
          )}
          {activeConfigId && (
            <button className="btn btn-primary text-xs" onClick={openAddRoute} disabled={!activeConfigId}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Route
            </button>
          )}
        </div>
      </div>

      {/* Config tabs */}
      {configs.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {configs.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setSelectedConfig(c.id)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                activeConfigId === c.id
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400'
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Override active</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> Normal routing</span>
      </div>

      {/* Routes table */}
      {loadingConfigs || loadingRoutes ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
      ) : !activeConfigId ? (
        <div className="card p-8 text-center">
          <Phone className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No IVR configuration yet.</p>
          {isAdmin && (
            <button className="btn btn-primary mt-3 text-sm" onClick={() => setShowNewConfig(true)}>
              Create IVR Config
            </button>
          )}
        </div>
      ) : routes.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500 mb-3">No routes configured yet.</p>
          <button className="btn btn-primary text-sm" onClick={openAddRoute}>Add First Route</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="th text-center w-16">Press</th>
                  <th className="th">Department</th>
                  <th className="th">Primary Agent</th>
                  <th className="th">Backup</th>
                  <th className="th">Override</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {routes.map((r: any) => (
                  <tr key={r.id} className={cn('hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors', r.override && 'bg-amber-50/40 dark:bg-amber-900/10')}>
                    {/* Press key */}
                    <td className="td text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-bold text-base">
                        {r.press_key}
                      </span>
                    </td>

                    {/* Department */}
                    <td className="td font-medium">{r.department_name}</td>

                    {/* Primary agent */}
                    <td className="td">
                      {r.primary_agent_name ? (
                        <div>
                          <div className="font-medium text-gray-800 dark:text-gray-200">{r.primary_agent_name}</div>
                          {r.primary_agent_extension && (
                            <div className="text-xs text-gray-400">ext {r.primary_agent_extension}</div>
                          )}
                        </div>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>

                    {/* Backup */}
                    <td className="td">
                      {r.backup_type === 'none' ? (
                        <span className="text-gray-400 text-xs">—</span>
                      ) : r.backup_type === 'voicemail' ? (
                        <span className="badge bg-blue-100 text-blue-700">Voicemail</span>
                      ) : r.backup_type === 'forwarding' ? (
                        <span className="badge bg-purple-100 text-purple-700">→ {r.backup_number}</span>
                      ) : (
                        <div>
                          <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">Agent</span>
                          {r.backup_agent_name && <div className="text-xs text-gray-500 mt-0.5">{r.backup_agent_name}</div>}
                        </div>
                      )}
                    </td>

                    {/* Override */}
                    <td className="td">
                      {r.override ? (
                        <div className="flex items-center gap-1.5">
                          <span className="badge bg-amber-100 text-amber-700">
                            {r.override.override_agent_name}
                          </span>
                          <button
                            className="p-0.5 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors"
                            title="Remove override"
                            onClick={() => clearOverrideMutation.mutate(r.id)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary-600 transition-colors"
                          onClick={() => { setOverrideRoute(r); setOverrideAgentId(''); setOverrideReason('') }}
                        >
                          <ToggleLeft className="w-4 h-4" /> Set
                        </button>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 rounded hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-400 hover:text-primary-600 transition-colors" onClick={() => openEditRoute(r)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                          onClick={() => { if (confirm(`Delete route for press ${r.press_key}?`)) deleteRouteMutation.mutate(r.id) }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add/Edit Route Modal ── */}
      {showRouteModal && editRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">{editRoute.id ? 'Edit Route' : 'Add Route'}</h3>
              <button onClick={() => setShowRouteModal(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRouteSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Press Key *</label>
                  <select name="press_key" className="input" defaultValue={editRoute.press_key} required>
                    {PRESS_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Sort Order</label>
                  <input name="sort_order" type="number" className="input" defaultValue={editRoute.sort_order ?? 0} />
                </div>
              </div>

              <div>
                <label className="label">Department Name *</label>
                <input name="department_name" className="input" defaultValue={editRoute.department_name} required placeholder="e.g. General Enquiries" />
              </div>

              <div>
                <label className="label">Primary Agent *</label>
                <select name="primary_agent_id" className="input" defaultValue={editRoute.primary_agent_id ?? ''} required>
                  <option value="">Select agent…</option>
                  {agents.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.full_name} {a.extension ? `(ext ${a.extension})` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Backup Type</label>
                <select name="backup_type" className="input" defaultValue={editRoute.backup_type ?? 'none'}
                  onChange={e => setEditRoute((prev: any) => ({ ...prev, backup_type: e.target.value }))}>
                  {BACKUP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {editRoute.backup_type === 'agent' && (
                <div>
                  <label className="label">Backup Agent</label>
                  <select name="backup_agent_id" className="input" defaultValue={editRoute.backup_agent_id ?? ''}>
                    <option value="">Select agent…</option>
                    {agents.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.full_name} {a.extension ? `(ext ${a.extension})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {editRoute.backup_type === 'forwarding' && (
                <div>
                  <label className="label">Forwarding Number / Extension</label>
                  <input name="backup_number" className="input" defaultValue={editRoute.backup_number ?? ''} placeholder="e.g. 2005 or +911234567890" />
                </div>
              )}

              <div>
                <label className="label">Department Audio File</label>
                <input name="dept_audio" className="input" defaultValue={editRoute.dept_audio ?? ''} placeholder="custom/press1-general (without extension)" />
                <p className="text-xs text-gray-400 mt-1">Path relative to Asterisk sounds directory</p>
              </div>

              <div>
                <label className="label">Notes</label>
                <input name="notes" className="input" defaultValue={editRoute.notes ?? ''} placeholder="Optional notes" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRouteModal(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={addRouteMutation.isPending || updateRouteMutation.isPending}>
                  {(addRouteMutation.isPending || updateRouteMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editRoute.id ? 'Update' : 'Add Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Override Modal ── */}
      {overrideRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Set Override</h3>
                <p className="text-xs text-gray-500 mt-0.5">Press {overrideRoute.press_key} — {overrideRoute.department_name}</p>
              </div>
              <button onClick={() => setOverrideRoute(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleOverrideSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex gap-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                When override is active, all calls to this department will route to the selected agent instead of the primary agent.
              </div>
              <div>
                <label className="label">Replacement Agent *</label>
                <select className="input" value={overrideAgentId} onChange={e => setOverrideAgentId(Number(e.target.value))} required>
                  <option value="">Select agent…</option>
                  {agents.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.full_name} {a.extension ? `(ext ${a.extension})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Reason (optional)</label>
                <input className="input" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="e.g. Agent on leave" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOverrideRoute(null)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!overrideAgentId || setOverrideMutation.isPending}>
                  {setOverrideMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><ToggleRight className="w-4 h-4 mr-1" /> Activate Override</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Config Modal (admin only) ── */}
      {showNewConfig && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">New IVR Config</h3>
              <button onClick={() => setShowNewConfig(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Client *</label>
                <select className="input" value={newConfigClientId} onChange={e => setNewConfigClientId(Number(e.target.value))} required>
                  <option value="">Select client…</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Config Name</label>
                <input className="input" value={newConfigName} onChange={e => setNewConfigName(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowNewConfig(false)} className="btn btn-outline">Cancel</button>
                <button
                  onClick={() => createConfigMutation.mutate({ client_id: newConfigClientId, name: newConfigName })}
                  disabled={!newConfigClientId || createConfigMutation.isPending}
                  className="btn btn-primary"
                >
                  {createConfigMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
