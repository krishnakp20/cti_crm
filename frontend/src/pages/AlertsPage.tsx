import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { alertsApi } from '../services/api'
import { useForm } from 'react-hook-form'
import { Plus, Bell, GitBranch, Trash2, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '../utils/cn'

const TRIGGERS = ['ticket_created', 'ticket_updated', 'ticket_closed', 'ticket_assigned', 'sla_breach', 'escalation', 'callback_reminder']

export default function AlertsPage() {
  const [tab, setTab] = useState<'alerts' | 'escalations'>('alerts')
  const [showAlert, setShowAlert] = useState(false)
  const [showEscalation, setShowEscalation] = useState(false)
  const [levels, setLevels] = useState([{ after_hours: 2, assign_to_role: '', notify_email: '' }])
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm()
  const { register: regEsc, handleSubmit: submitEsc, reset: resetEsc } = useForm()

  const { data: alerts } = useQuery({ queryKey: ['alerts'], queryFn: () => alertsApi.list().then(r => r.data) })
  const { data: escalations } = useQuery({ queryKey: ['escalations'], queryFn: () => alertsApi.listEscalations().then(r => r.data) })

  const alertMutation = useMutation({
    mutationFn: (d: any) => alertsApi.create({ ...d, channels: d.channels ? [d.channels] : ['email'], recipients: { email: d.recipient_email } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); toast.success('Alert created'); setShowAlert(false); reset() },
  })

  const escalationMutation = useMutation({
    mutationFn: (d: any) => alertsApi.createEscalation({ ...d, levels }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalations'] }); toast.success('Escalation rule created'); setShowEscalation(false); resetEsc(); setLevels([{ after_hours: 2, assign_to_role: '', notify_email: '' }]) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => alertsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); toast.success('Deleted') },
  })

  return (
    <div className="space-y-3 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Alerts & Escalations</h1>
          <p className="text-xs text-gray-500">Configure notification rules and escalation paths</p>
        </div>
        <button className="btn-primary" onClick={() => tab === 'alerts' ? setShowAlert(true) : setShowEscalation(true)}>
          <Plus className="w-3.5 h-3.5" /> Add {tab === 'alerts' ? 'Alert' : 'Escalation Rule'}
        </button>
      </div>

      <div className="card">
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {(['alerts', 'escalations'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={cn(
              'px-4 py-2.5 text-xs font-medium border-b-2 capitalize flex items-center gap-1.5 transition-colors',
              tab === t ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}>
              {t === 'alerts' ? <Bell className="w-3.5 h-3.5" /> : <GitBranch className="w-3.5 h-3.5" />}
              {t}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-2">
          {tab === 'alerts' && (
            (alerts || []).length === 0
              ? <p className="text-sm text-gray-400 text-center py-8">No alert rules configured</p>
              : (alerts || []).map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div>
                    <p className="text-xs font-medium text-gray-900 dark:text-white">{a.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="badge bg-blue-100 text-blue-700 capitalize">{a.trigger?.replace(/_/g, ' ')}</span>
                      {(a.channels || []).map((ch: string) => (
                        <span key={ch} className="badge bg-gray-100 text-gray-600 capitalize">{ch}</span>
                      ))}
                    </div>
                  </div>
                  <button className="btn-icon text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(a.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
          )}

          {tab === 'escalations' && (
            (escalations || []).length === 0
              ? <p className="text-sm text-gray-400 text-center py-8">No escalation rules configured</p>
              : (escalations || []).map((r: any) => (
                <div key={r.id} className="p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-medium text-gray-900 dark:text-white mb-2">{r.name}</p>
                  <div className="space-y-1">
                    {(r.levels || []).map((level: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-2xs text-gray-500">
                        <span className="w-4 h-4 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 flex items-center justify-center font-bold">{i + 1}</span>
                        After {level.after_hours}h → {level.assign_to_role || 'Notify: ' + level.notify_email}
                      </div>
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {showAlert && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">Create Alert Rule</h3>
              <button className="btn-icon" onClick={() => { setShowAlert(false); reset() }}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit(d => alertMutation.mutate(d))} className="space-y-3">
              <div>
                <label className="label">Alert Name</label>
                <input {...register('name', { required: true })} className="input" placeholder="e.g. SLA Breach Alert" />
              </div>
              <div>
                <label className="label">Trigger</label>
                <select {...register('trigger', { required: true })} className="input">
                  {TRIGGERS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Channel</label>
                <select {...register('channels')} className="input">
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="in_app">In-App</option>
                </select>
              </div>
              <div>
                <label className="label">Recipient Email</label>
                <input type="email" {...register('recipient_email')} className="input" placeholder="team@company.com" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowAlert(false); reset() }}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={alertMutation.isPending}>
                  {alertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEscalation && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">Create Escalation Rule</h3>
              <button className="btn-icon" onClick={() => { setShowEscalation(false); resetEsc() }}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submitEsc(d => escalationMutation.mutate(d))} className="space-y-3">
              <div>
                <label className="label">Rule Name</label>
                <input {...regEsc('name', { required: true })} className="input" placeholder="High Priority Escalation" />
              </div>
              <div>
                <label className="label">Escalation Levels</label>
                <div className="space-y-2">
                  {levels.map((level, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <span className="text-2xs font-bold text-primary-600 w-4">L{i + 1}</span>
                      <input type="number" className="input w-16 text-xs" value={level.after_hours} onChange={e => setLevels(prev => prev.map((l, j) => j === i ? { ...l, after_hours: Number(e.target.value) } : l))} placeholder="hrs" min={1} />
                      <span className="text-2xs text-gray-400">h</span>
                      <input className="input flex-1 text-xs" value={level.notify_email} onChange={e => setLevels(prev => prev.map((l, j) => j === i ? { ...l, notify_email: e.target.value } : l))} placeholder="notify@email.com" />
                    </div>
                  ))}
                  <button type="button" className="btn-ghost text-xs w-full" onClick={() => setLevels(prev => [...prev, { after_hours: 4, assign_to_role: '', notify_email: '' }])}>
                    + Add Level
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowEscalation(false)}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={escalationMutation.isPending}>
                  {escalationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
