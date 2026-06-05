import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../services/api'
import toast from 'react-hot-toast'
import { Shield, Plus, X, Check, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../utils/cn'

const MODULE_LABELS: Record<string, string> = {
  tickets: '🎫 Tickets',
  reports: '📊 Reports',
  calling: '📞 Calling',
  users: '👤 Users',
  forms: '📋 Forms',
  clients: '🏢 Clients',
  campaigns: '📣 Campaigns',
  alerts: '🔔 Alerts',
  audit: '🛡️ Audit',
}

export default function PermissionsPage() {
  const [selectedRole, setSelectedRole] = useState<any>(null)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [showNewRole, setShowNewRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleSlug, setNewRoleSlug] = useState('')
  const [rolePermissions, setRolePermissions] = useState<number[]>([])
  const [expandedModules, setExpandedModules] = useState<string[]>(Object.keys(MODULE_LABELS))
  const [tab, setTab] = useState<'roles' | 'users'>('roles')
  const qc = useQueryClient()

  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => usersApi.listRoles().then(r => r.data) })
  const { data: permissions } = useQuery({ queryKey: ['permissions'], queryFn: () => usersApi.listPermissions().then(r => r.data) })
  const { data: users } = useQuery({ queryKey: ['users-list'], queryFn: () => usersApi.list({ limit: 100 }).then(r => r.data) })

  // Group permissions by module
  const grouped = (permissions || []).reduce((acc: any, p: any) => {
    if (!acc[p.module]) acc[p.module] = []
    acc[p.module].push(p)
    return acc
  }, {})

  const createRoleMutation = useMutation({
    mutationFn: () => usersApi.createRole({ name: newRoleName, slug: newRoleSlug }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      toast.success('Role created')
      setShowNewRole(false)
      setNewRoleName('')
      setNewRoleSlug('')
    },
  })

  const saveRolePermsMutation = useMutation({
    mutationFn: () => usersApi.assignRolePermissions(selectedRole.id, rolePermissions),
    onSuccess: () => toast.success('Permissions saved'),
  })

  const assignRoleToUserMutation = useMutation({
    mutationFn: ({ userId, roleId }: any) => usersApi.update(userId, { role_id: roleId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-list'] })
      toast.success('Role assigned to user')
    },
  })

  const selectRole = async (role: any) => {
    setSelectedRole(role)
    // Load existing permissions for this role from API response if available
    setRolePermissions([])
  }

  const togglePerm = (permId: number) => {
    setRolePermissions(prev =>
      prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
    )
  }

  const toggleModule = (module: string) => {
    const modulePerm = (grouped[module] || []).map((p: any) => p.id)
    const allSelected = modulePerm.every((id: number) => rolePermissions.includes(id))
    if (allSelected) {
      setRolePermissions(prev => prev.filter(id => !modulePerm.includes(id)))
    } else {
      setRolePermissions(prev => [...new Set([...prev, ...modulePerm])])
    }
  }

  const toggleExpand = (module: string) => {
    setExpandedModules(prev =>
      prev.includes(module) ? prev.filter(m => m !== module) : [...prev, module]
    )
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Permissions Manager</h1>
          <p className="text-xs text-gray-500">Create roles and assign permissions to users</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
        {(['roles', 'users'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('px-4 py-1.5 rounded-md text-xs font-medium transition-all capitalize',
              tab === t ? 'bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t === 'roles' ? '🔑 Roles & Permissions' : '👤 Assign Role to User'}
          </button>
        ))}
      </div>

      {/* ── ROLES TAB ── */}
      {tab === 'roles' && (
        <div className="grid grid-cols-4 gap-4">
          {/* Role List */}
          <div className="col-span-1 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Roles</p>
              <button className="btn-icon" onClick={() => setShowNewRole(true)} title="New Role">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {showNewRole && (
              <div className="card p-3 space-y-2">
                <input
                  className="input text-xs"
                  placeholder="Role name"
                  value={newRoleName}
                  onChange={e => {
                    setNewRoleName(e.target.value)
                    setNewRoleSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))
                  }}
                />
                <input
                  className="input text-xs font-mono"
                  placeholder="slug"
                  value={newRoleSlug}
                  onChange={e => setNewRoleSlug(e.target.value)}
                />
                <div className="flex gap-1">
                  <button className="btn-primary btn-sm flex-1" onClick={() => createRoleMutation.mutate()} disabled={!newRoleName || createRoleMutation.isPending}>
                    {createRoleMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create'}
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => setShowNewRole(false)}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              {(roles || []).map((role: any) => (
                <button
                  key={role.id}
                  onClick={() => selectRole(role)}
                  className={cn('w-full text-left px-3 py-2 rounded-lg text-xs transition-colors',
                    selectedRole?.id === role.id
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-medium'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{role.name}</span>
                  </div>
                  {role.is_system && <span className="text-2xs text-gray-400 ml-5">system</span>}
                </button>
              ))}
              {(roles || []).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No roles yet. Create one.</p>
              )}
            </div>
          </div>

          {/* Permission Matrix */}
          <div className="col-span-3">
            {selectedRole ? (
              <div className="card">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedRole.name}</p>
                    <p className="text-2xs text-gray-400">Select permissions for this role</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="badge bg-primary-100 text-primary-700">{rolePermissions.length} selected</span>
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => saveRolePermsMutation.mutate()}
                      disabled={saveRolePermsMutation.isPending}
                    >
                      {saveRolePermsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Save</>}
                    </button>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  {Object.entries(grouped).map(([module, perms]: any) => {
                    const isExpanded = expandedModules.includes(module)
                    const modulePerms = perms.map((p: any) => p.id)
                    const allChecked = modulePerms.every((id: number) => rolePermissions.includes(id))
                    const someChecked = modulePerms.some((id: number) => rolePermissions.includes(id))

                    return (
                      <div key={module} className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
                        <div
                          className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => toggleExpand(module)}
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-1">
                            {MODULE_LABELS[module] || module}
                          </span>
                          <label className="flex items-center gap-1.5 cursor-pointer" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={allChecked}
                              ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                              onChange={() => toggleModule(module)}
                              className="rounded"
                            />
                            <span className="text-2xs text-gray-500">All</span>
                          </label>
                        </div>

                        {isExpanded && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3">
                            {perms.map((perm: any) => (
                              <label
                                key={perm.id}
                                className={cn(
                                  'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border transition-all text-xs',
                                  rolePermissions.includes(perm.id)
                                    ? 'border-primary-300 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-700 text-primary-700 dark:text-primary-300'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-600 dark:text-gray-400'
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={rolePermissions.includes(perm.id)}
                                  onChange={() => togglePerm(perm.id)}
                                  className="rounded"
                                />
                                <span>{perm.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="card flex items-center justify-center h-64">
                <div className="text-center">
                  <Shield className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Select a role to manage permissions</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Assign Roles to Users</p>
            <p className="text-xs text-gray-500 mt-0.5">Select a role for each user to grant them permissions</p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {(users?.items || []).map((user: any) => (
              <div key={user.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 text-xs font-bold flex-shrink-0">
                  {user.full_name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-white">{user.full_name}</p>
                  <p className="text-2xs text-gray-400">{user.email} · <span className="capitalize">{user.role?.replace('_', ' ')}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="input w-44 text-xs h-8"
                    defaultValue={user.role_id || ''}
                    onChange={e => {
                      if (e.target.value) {
                        assignRoleToUserMutation.mutate({ userId: user.id, roleId: Number(e.target.value) })
                      }
                    }}
                  >
                    <option value="">— No custom role —</option>
                    {(roles || []).map((role: any) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                  {user.role_id && (
                    <span className="badge bg-green-100 text-green-700">
                      <Check className="w-3 h-3" /> Assigned
                    </span>
                  )}
                </div>
              </div>
            ))}
            {(users?.items || []).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No users found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
