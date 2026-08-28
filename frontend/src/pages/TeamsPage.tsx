import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teamsApi, usersApi, clientsApi } from '../services/api'
import { useAdminClient } from '../hooks/useAdminClient'
import { Users, Plus, Trash2, UserPlus, ChevronDown, ChevronUp, Shield, X, Loader2 } from 'lucide-react'
import { cn } from '../utils/cn'
import toast from 'react-hot-toast'

const DEPT_LABELS: Record<string, string> = {
  reception: 'Reception',
  support: 'Customer Support',
  sales: 'Sales',
  purchase: 'Purchase',
  it: 'IT',
  logistics: 'Logistics',
}

const DEPT_COLORS: Record<string, string> = {
  reception: 'bg-blue-100 text-blue-700',
  support: 'bg-purple-100 text-purple-700',
  sales: 'bg-green-100 text-green-700',
  purchase: 'bg-orange-100 text-orange-700',
  it: 'bg-gray-100 text-gray-700',
  logistics: 'bg-yellow-100 text-yellow-700',
}

export default function TeamsPage() {
  const qc = useQueryClient()
  const { adminClientId, clientFilter } = useAdminClient()
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showAddMember, setShowAddMember] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', department: 'reception', description: '', department_id: '' })
  const [selectedUser, setSelectedUser] = useState('')

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams', adminClientId],
    queryFn: () => teamsApi.list(clientFilter).then(r => r.data),
  })

  const { data: usersData } = useQuery({
    queryKey: ['users-list', adminClientId],
    queryFn: () => usersApi.list({ ...clientFilter, limit: 100 }).then(r => r.data),
  })
  const agents = (usersData?.items || []).filter((u: any) => ['agent', 'team_user'].includes(u.role))

  const { data: deptData } = useQuery({
    queryKey: ['departments', adminClientId],
    queryFn: () => clientsApi.getDepartments(adminClientId!).then(r => r.data),
    enabled: !!adminClientId,
  })
  const departments: any[] = deptData || []

  const createMutation = useMutation({
    mutationFn: (data: any) => teamsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); setShowCreate(false); setForm({ name: '', department: 'reception', description: '', department_id: '' }); toast.success('Team created') },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => teamsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); toast.success('Team deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  const addMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) => teamsApi.addMember(teamId, userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); setShowAddMember(null); setSelectedUser(''); toast.success('Member added') },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed'),
  })

  const removeMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) => teamsApi.removeMember(teamId, userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); toast.success('Member removed') },
  })

  const handleCreate = () => {
    if (!form.name.trim()) return toast.error('Team name required')
    createMutation.mutate({
      name: form.name,
      description: form.description || undefined,
      department_id: form.department_id ? Number(form.department_id) : undefined,
      department_name: form.department || undefined,
      ...(adminClientId ? { client_id: adminClientId } : {}),
    })
  }

  const resetForm = () => setForm({ name: '', department: 'reception', description: '', department_id: '' })

  const teamsByDept = (teams as any[]).reduce((acc: any, t: any) => {
    const key = t.department_name || 'General'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Teams</h1>
          <p className="text-xs text-gray-500">Manage department teams and agent assignments</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all">
          <Plus className="w-3.5 h-3.5" /> New Team
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-50"><Users className="w-4 h-4 text-primary-600" /></div>
          <div><p className="text-xl font-bold text-gray-900 dark:text-white">{(teams as any[]).length}</p><p className="text-2xs text-gray-500">Total Teams</p></div>
        </div>
        <div className="card p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-50"><Shield className="w-4 h-4 text-green-600" /></div>
          <div><p className="text-xl font-bold text-gray-900 dark:text-white">{(teams as any[]).filter((t: any) => t.is_active).length}</p><p className="text-2xs text-gray-500">Active Teams</p></div>
        </div>
        <div className="card p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50"><UserPlus className="w-4 h-4 text-blue-600" /></div>
          <div><p className="text-xl font-bold text-gray-900 dark:text-white">{(teams as any[]).reduce((s: number, t: any) => s + (t.member_count || 0), 0)}</p><p className="text-2xs text-gray-500">Total Agents</p></div>
        </div>
      </div>

      {/* Teams list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
      ) : (teams as any[]).length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <Users className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">No teams yet</p>
          <p className="text-xs mt-1">Create a team to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(teams as any[]).map((team: any) => (
            <div key={team.id} className="card overflow-hidden">
              {/* Team header */}
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpanded(expanded === team.id ? null : team.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                    <Users className="w-4 h-4 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{team.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {team.department_name && (
                        <span className={cn('px-2 py-0.5 rounded-full text-2xs font-medium', DEPT_COLORS[team.department_name?.toLowerCase()] || 'bg-gray-100 text-gray-600')}>
                          {team.department_name}
                        </span>
                      )}
                      <span className="text-2xs text-gray-400">{team.member_count} agent{team.member_count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); setShowAddMember(team.id) }}
                    className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-600 transition-colors">
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); if (confirm('Delete this team?')) deleteMutation.mutate(team.id) }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {expanded === team.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {/* Expanded members */}
              {expanded === team.id && (
                <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
                  {team.description && <p className="text-xs text-gray-500 mb-3">{team.description}</p>}
                  {team.members.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No agents assigned — click + to add</p>
                  ) : (
                    <div className="space-y-1.5">
                      {team.members.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-semibold text-primary-700">
                              {m.full_name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-900 dark:text-white">{m.full_name}</p>
                              <p className="text-2xs text-gray-400">{m.email}</p>
                            </div>
                          </div>
                          <button onClick={() => removeMemberMutation.mutate({ teamId: team.id, userId: m.user_id })}
                            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create team modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">New Team</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Team Name *</label>
                <input className="input w-full text-sm" placeholder="e.g. Sales Team A" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="label">Department</label>
                {departments.length > 0 ? (
                  <select className="input w-full text-sm" value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>
                    <option value="">— Select department —</option>
                    {departments.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                ) : (
                  <input className="input w-full text-sm" placeholder="e.g. Reception, Sales, IT" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                )}
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input w-full text-sm resize-none" rows={2} placeholder="Optional description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn-secondary btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn-primary btn-sm" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add member modal */}
      {showAddMember !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Add Agent to Team</h3>
            <select className="input w-full text-sm mb-4" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
              <option value="">— Select agent —</option>
              {agents.map((u: any) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary btn-sm" onClick={() => { setShowAddMember(null); setSelectedUser('') }}>Cancel</button>
              <button className="btn-primary btn-sm" disabled={!selectedUser || addMemberMutation.isPending}
                onClick={() => addMemberMutation.mutate({ teamId: showAddMember, userId: Number(selectedUser) })}>
                {addMemberMutation.isPending ? 'Adding…' : 'Add Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
