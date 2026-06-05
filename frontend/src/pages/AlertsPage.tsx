import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { alertsApi } from '../services/api'
import { useForm } from 'react-hook-form'
import {
  Plus, Bell, GitBranch, Trash2, X,
  ToggleLeft, ToggleRight, Edit2, Clock, Mail,
  MessageSquare, Smartphone, AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '../utils/cn'

const TRIGGERS = [
  { value: 'ticket_created',    label: 'Ticket Created' },
  { value: 'ticket_updated',    label: 'Ticket Updated' },
  { value: 'ticket_closed',     label: 'Ticket Closed' },
  { value: 'ticket_assigned',   label: 'Ticket Assigned' },
  { value: 'sla_breach',        label: 'SLA Breach' },
  { value: 'escalation',        label: 'Escalation' },
  { value: 'callback_reminder', label: 'Callback Reminder' },
]

const CHANNELS = [
  { value: 'email',    label: 'Email',    icon: Mail },
  { value: 'sms',      label: 'SMS',      icon: Smartphone },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { value: 'in_app',   label: 'In-App',   icon: Bell },
]

const PRIORITIES = ['low', 'medium', 'high', 'critical']

const CHANNEL_COLORS: Record<string, string> = {
  email:    'bg-blue-100 text-blue-700',
  sms:      'bg-green-100 text-green-700',
  whatsapp: 'bg-emerald-100 text-emerald-700',
  in_app:   'bg-purple-100 text-purple-700',
}

const TRIGGER_COLORS: Record<string, string> = {
  ticket_created:    'bg-blue-100 text-blue-700',
  ticket_updated:    'bg-yellow-100 text-yellow-700',
  ticket_closed:     'bg-gray-100 text-gray-600',
  ticket_assigned:   'bg-indigo-100 text-indigo-700',
  sla_breach:        'bg-red-100 text-red-700',
  escalation:        'bg-orange-100 text-orange-700',
  callback_reminder: 'bg-teal-100 text-teal-700',
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Modal
// ─────────────────────────────────────────────────────────────────────────────
function AlertModal({ alert, onClose, onSave }: { alert?: any; onClose: () => void; onSave: (d: any) => void }) {
  const [channels, setChannels] = useState<string[]>(alert?.channels || ['in_app'])
  const [notifyAgent,   setNotifyAgent]   = useState(alert?.recipients?.agent   || false)
  const [notifyCreator, setNotifyCreator] = useState(alert?.recipients?.creator || false)
  const [email,         setEmail]         = useState(alert?.recipients?.email   || '')
  const [emailList,     setEmailList]     = useState((alert?.recipients?.email_list || []).join(', '))
  const [mobile,        setMobile]        = useState(alert?.recipients?.mobile  || '')
  const [mobileList,    setMobileList]    = useState((alert?.recipients?.mobile_list || []).join(', '))
  const [condPriority,  setCondPriority]  = useState(alert?.conditions?.priority || '')

  const { register, handleSubmit } = useForm({
    defaultValues: { name: alert?.name || '', trigger: alert?.trigger || 'ticket_created' },
  })

  const toggleChannel = (ch: string) =>
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch])

  const needsMobile = channels.includes('sms') || channels.includes('whatsapp')
  const needsEmail  = channels.includes('email')

  const onSubmit = (data: any) => {
    const rec: any = {}
    if (notifyAgent)   rec.agent   = true
    if (notifyCreator) rec.creator = true
    if (email)         rec.email   = email.trim()
    if (emailList)     rec.email_list  = emailList.split(',').map((e: string) => e.trim()).filter(Boolean)
    if (mobile)        rec.mobile      = mobile.trim()
    if (mobileList)    rec.mobile_list = mobileList.split(',').map((m: string) => m.trim()).filter(Boolean)

    onSave({
      ...data,
      channels,
      recipients: rec,
      conditions: condPriority ? { priority: condPriority } : undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card p-5 w-full max-w-lg animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {alert ? 'Edit Alert Rule' : 'Create Alert Rule'}
          </h3>
          <button className="btn-icon" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Name */}
          <div>
            <label className="label">Alert Name *</label>
            <input {...register('name', { required: true })} className="input" placeholder="e.g. SLA Breach — Notify Manager" />
          </div>

          {/* Trigger */}
          <div>
            <label className="label">Trigger Event *</label>
            <select {...register('trigger', { required: true })} className="input">
              {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Channels */}
          <div>
            <label className="label">Notification Channels *</label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNELS.map(ch => (
                <label key={ch.value} className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-all',
                  channels.includes(ch.value)
                    ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-600'
                )}>
                  <input type="checkbox" checked={channels.includes(ch.value)} onChange={() => toggleChannel(ch.value)} className="rounded" />
                  <ch.icon className="w-3.5 h-3.5" />
                  {ch.label}
                </label>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="label">Recipients</label>
            <div className="space-y-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">

              {/* Checkboxes */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={notifyAgent} onChange={e => setNotifyAgent(e.target.checked)} className="rounded" />
                  <span>Assigned Agent <span className="text-gray-400">(uses their mobile/email from profile)</span></span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={notifyCreator} onChange={e => setNotifyCreator(e.target.checked)} className="rounded" />
                  Ticket Creator
                </label>
              </div>

              {/* Email inputs — only when Email channel selected */}
              {needsEmail && (
                <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-2xs font-semibold text-blue-600 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Email Recipients
                  </p>
                  <div>
                    <p className="text-2xs text-gray-500 mb-1">Single email address</p>
                    <input
                      type="email"
                      className="input text-xs"
                      placeholder="manager@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500 mb-1">Multiple emails <span className="text-gray-400">(comma separated)</span></p>
                    <textarea
                      className="input text-xs resize-none"
                      rows={2}
                      placeholder="lead@company.com, admin@company.com, ceo@company.com"
                      value={emailList}
                      onChange={e => setEmailList(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Mobile inputs — only when SMS or WhatsApp selected */}
              {needsMobile && (
                <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className={cn(
                    'text-2xs font-semibold flex items-center gap-1',
                    channels.includes('whatsapp') ? 'text-emerald-600' : 'text-green-600'
                  )}>
                    <Smartphone className="w-3 h-3" />
                    {channels.includes('whatsapp') && channels.includes('sms')
                      ? 'SMS & WhatsApp Recipients'
                      : channels.includes('whatsapp') ? 'WhatsApp Recipients' : 'SMS Recipients'}
                  </p>
                  <div>
                    <p className="text-2xs text-gray-500 mb-1">Single mobile number <span className="text-gray-400">(with country code)</span></p>
                    <input
                      type="tel"
                      className="input text-xs"
                      placeholder="+91 9999999999"
                      value={mobile}
                      onChange={e => setMobile(e.target.value)}
                    />
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500 mb-1">Multiple numbers <span className="text-gray-400">(comma separated)</span></p>
                    <textarea
                      className="input text-xs resize-none"
                      rows={2}
                      placeholder="+91 9999999999, +91 8888888888, +91 7777777777"
                      value={mobileList}
                      onChange={e => setMobileList(e.target.value)}
                    />
                  </div>
                  <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-2">
                    <p className="text-2xs text-yellow-700 dark:text-yellow-400">
                      ⚠ SMS/WhatsApp requires gateway config in <code className="font-mono">.env</code> file.
                      See gateway setup below.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Conditions */}
          <div>
            <label className="label">Conditions <span className="text-gray-400 font-normal">(optional)</span></label>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <p className="text-2xs text-gray-500 mb-1">Only fire for tickets with this priority</p>
              <select className="input text-xs" value={condPriority} onChange={e => setCondPriority(e.target.value)}>
                <option value="">— Any priority —</option>
                {PRIORITIES.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary flex-1">
              {alert ? 'Save Changes' : 'Create Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Escalation Modal
// ─────────────────────────────────────────────────────────────────────────────
function EscalationModal({ rule, onClose, onSave }: { rule?: any; onClose: () => void; onSave: (d: any) => void }) {
  const [levels, setLevels] = useState<any[]>(
    rule?.levels?.length ? rule.levels : [{ after_hours: 2, notify_email: '', mobile: '' }]
  )
  const { register, handleSubmit } = useForm({
    defaultValues: { name: rule?.name || '', priority: rule?.priority || '' },
  })

  const addLevel = () => setLevels(prev => [...prev, { after_hours: (prev.at(-1)?.after_hours || 0) + 2, notify_email: '', mobile: '' }])
  const removeLevel = (i: number) => setLevels(prev => prev.filter((_, j) => j !== i))
  const updateLevel = (i: number, key: string, val: any) =>
    setLevels(prev => prev.map((l, j) => j === i ? { ...l, [key]: val } : l))

  const onSubmit = (data: any) =>
    onSave({ ...data, levels: levels.filter(l => l.after_hours > 0) })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card p-5 w-full max-w-lg animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {rule ? 'Edit Escalation Rule' : 'Create Escalation Rule'}
          </h3>
          <button className="btn-icon" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Rule Name *</label>
            <input {...register('name', { required: true })} className="input" placeholder="e.g. High Priority Escalation" />
          </div>

          <div>
            <label className="label">Apply to Priority <span className="text-gray-400 font-normal">(optional)</span></label>
            <select {...register('priority')} className="input">
              <option value="">— All priorities —</option>
              {PRIORITIES.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
            </select>
            <p className="text-2xs text-gray-400 mt-1">Leave blank to escalate all tickets regardless of priority</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Escalation Levels</label>
              <button type="button" className="btn-ghost text-xs" onClick={addLevel}>
                <Plus className="w-3 h-3" /> Add Level
              </button>
            </div>
            <div className="space-y-2">
              {levels.map((level, i) => (
                <div key={i} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-bold text-primary-600 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded-full">
                      Level {i + 1}
                    </span>
                    {levels.length > 1 && (
                      <button type="button" className="btn-icon text-red-400" onClick={() => removeLevel(i)}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Time threshold */}
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 flex-shrink-0">Trigger after</span>
                    <input
                      type="number" min={1}
                      className="input w-16 text-xs"
                      value={level.after_hours}
                      onChange={e => updateLevel(i, 'after_hours', Number(e.target.value))}
                    />
                    <span className="text-xs text-gray-500">hours of inactivity</span>
                  </div>

                  {/* Notify email */}
                  <div>
                    <p className="text-2xs text-gray-500 mb-1 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> Notify Email
                    </p>
                    <input
                      type="email"
                      className="input text-xs"
                      placeholder="manager@company.com"
                      value={level.notify_email}
                      onChange={e => updateLevel(i, 'notify_email', e.target.value)}
                    />
                  </div>

                  {/* Notify mobile */}
                  <div>
                    <p className="text-2xs text-gray-500 mb-1 flex items-center gap-1">
                      <Smartphone className="w-3 h-3" /> Notify Mobile <span className="text-gray-400">(SMS/WhatsApp)</span>
                    </p>
                    <input
                      type="tel"
                      className="input text-xs"
                      placeholder="+91 9999999999"
                      value={level.mobile || ''}
                      onChange={e => updateLevel(i, 'mobile', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary flex-1">
              {rule ? 'Save Changes' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AlertsPage() {
  const [tab, setTab] = useState<'alerts' | 'escalations'>('alerts')
  const [showAlertModal,      setShowAlertModal]      = useState(false)
  const [showEscalationModal, setShowEscalationModal] = useState(false)
  const [editingAlert,       setEditingAlert]         = useState<any>(null)
  const [editingEscalation,  setEditingEscalation]    = useState<any>(null)
  const qc = useQueryClient()

  const { data: alerts = [],      isLoading: alertsLoading }      = useQuery({ queryKey: ['alerts'],      queryFn: () => alertsApi.list().then(r => r.data) })
  const { data: escalations = [], isLoading: escalationsLoading } = useQuery({ queryKey: ['escalations'], queryFn: () => alertsApi.listEscalations().then(r => r.data) })

  const inv = (keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }))

  const createAlert   = useMutation({ mutationFn: alertsApi.create,                         onSuccess: () => { inv(['alerts']); toast.success('Alert created'); setShowAlertModal(false) }, onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed') })
  const updateAlert   = useMutation({ mutationFn: ({ id, data }: any) => alertsApi.update(id, data),  onSuccess: () => { inv(['alerts']); toast.success('Updated'); setEditingAlert(null) } })
  const toggleAlert   = useMutation({ mutationFn: alertsApi.toggle,                          onSuccess: () => inv(['alerts']) })
  const deleteAlert   = useMutation({ mutationFn: alertsApi.delete,                          onSuccess: () => { inv(['alerts']); toast.success('Deleted') } })

  const createEsc = useMutation({ mutationFn: alertsApi.createEscalation,                          onSuccess: () => { inv(['escalations']); toast.success('Rule created'); setShowEscalationModal(false) }, onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed') })
  const updateEsc = useMutation({ mutationFn: ({ id, data }: any) => alertsApi.updateEscalation(id, data), onSuccess: () => { inv(['escalations']); toast.success('Updated'); setEditingEscalation(null) } })
  const toggleEsc = useMutation({ mutationFn: alertsApi.toggleEscalation,                          onSuccess: () => inv(['escalations']) })
  const deleteEsc = useMutation({ mutationFn: alertsApi.deleteEscalation,                          onSuccess: () => { inv(['escalations']); toast.success('Deleted') } })

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Alerts & Escalations</h1>
          <p className="text-xs text-gray-500">Configure automatic notifications and escalation paths</p>
        </div>
        <button className="btn-primary" onClick={() => tab === 'alerts' ? setShowAlertModal(true) : setShowEscalationModal(true)}>
          <Plus className="w-3.5 h-3.5" /> {tab === 'alerts' ? 'Add Alert' : 'Add Escalation Rule'}
        </button>
      </div>

      <div className="card">
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {(['alerts', 'escalations'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={cn(
              'px-4 py-2.5 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors capitalize',
              tab === t ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}>
              {t === 'alerts' ? <Bell className="w-3.5 h-3.5" /> : <GitBranch className="w-3.5 h-3.5" />}
              {t}
              <span className="badge bg-gray-100 text-gray-600 ml-1 text-2xs">
                {t === 'alerts' ? (alerts as any[]).length : (escalations as any[]).length}
              </span>
            </button>
          ))}
        </div>

        {/* Alerts */}
        {tab === 'alerts' && (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {alertsLoading ? (
              <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
            ) : (alerts as any[]).length === 0 ? (
              <div className="text-center py-12">
                <Bell className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No alert rules yet</p>
                <button className="btn-primary mt-3 btn-sm" onClick={() => setShowAlertModal(true)}><Plus className="w-3.5 h-3.5" /> Create First Alert</button>
              </div>
            ) : (alerts as any[]).map((a: any) => (
              <div key={a.id} className={cn('p-4 flex items-start gap-3', !a.is_active && 'opacity-50')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">{a.name}</p>
                    {!a.is_active && <span className="badge bg-gray-100 text-gray-500 text-2xs">Disabled</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className={cn('badge text-2xs', TRIGGER_COLORS[a.trigger] || 'bg-gray-100 text-gray-600')}>
                      {a.trigger?.replace(/_/g, ' ')}
                    </span>
                    {(a.channels || []).map((ch: string) => (
                      <span key={ch} className={cn('badge text-2xs', CHANNEL_COLORS[ch] || 'bg-gray-100')}>{ch}</span>
                    ))}
                    {a.conditions?.priority && (
                      <span className="badge bg-orange-100 text-orange-700 text-2xs">Priority: {a.conditions.priority}</span>
                    )}
                  </div>
                  {/* Show recipients */}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {a.recipients?.agent   && <span className="text-2xs text-gray-400">→ Assigned Agent</span>}
                    {a.recipients?.creator && <span className="text-2xs text-gray-400">→ Creator</span>}
                    {a.recipients?.email   && <span className="text-2xs text-gray-400">→ {a.recipients.email}</span>}
                    {(a.recipients?.email_list || []).map((e: string) => <span key={e} className="text-2xs text-gray-400">→ {e}</span>)}
                    {a.recipients?.mobile  && <span className="text-2xs text-gray-400">📱 {a.recipients.mobile}</span>}
                    {(a.recipients?.mobile_list || []).map((m: string) => <span key={m} className="text-2xs text-gray-400">📱 {m}</span>)}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button className="btn-icon" title={a.is_active ? 'Disable' : 'Enable'} onClick={() => toggleAlert.mutate(a.id)}>
                    {a.is_active ? <ToggleRight className="w-4 h-4 text-primary-600" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                  </button>
                  <button className="btn-icon" title="Edit" onClick={() => setEditingAlert(a)}><Edit2 className="w-3.5 h-3.5" /></button>
                  <button className="btn-icon text-red-400 hover:text-red-600" title="Delete" onClick={() => deleteAlert.mutate(a.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Escalations */}
        {tab === 'escalations' && (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {escalationsLoading ? (
              <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
            ) : (escalations as any[]).length === 0 ? (
              <div className="text-center py-12">
                <GitBranch className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No escalation rules yet</p>
                <button className="btn-primary mt-3 btn-sm" onClick={() => setShowEscalationModal(true)}><Plus className="w-3.5 h-3.5" /> Create First Rule</button>
              </div>
            ) : (escalations as any[]).map((r: any) => (
              <div key={r.id} className={cn('p-4', !r.is_active && 'opacity-50')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">{r.name}</p>
                      {r.priority && <span className={cn('badge text-2xs', `badge-${r.priority}`)}>{r.priority}</span>}
                      {!r.is_active && <span className="badge bg-gray-100 text-gray-500 text-2xs">Disabled</span>}
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {(r.levels || []).map((level: any, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="flex flex-col items-center">
                            <div className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 text-2xs font-bold flex-shrink-0">{i + 1}</div>
                            {i < r.levels.length - 1 && <div className="w-px h-3 bg-gray-200 dark:bg-gray-700 mt-0.5" />}
                          </div>
                          <div className="pb-1">
                            <p className="text-2xs font-medium text-gray-700 dark:text-gray-300">
                              After <span className="text-primary-600">{level.after_hours}h</span>
                            </p>
                            {level.notify_email && <p className="text-2xs text-gray-400 flex items-center gap-1"><Mail className="w-3 h-3" /> {level.notify_email}</p>}
                            {level.mobile && <p className="text-2xs text-gray-400 flex items-center gap-1"><Smartphone className="w-3 h-3" /> {level.mobile}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button className="btn-icon" title={r.is_active ? 'Disable' : 'Enable'} onClick={() => toggleEsc.mutate(r.id)}>
                      {r.is_active ? <ToggleRight className="w-4 h-4 text-primary-600" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                    </button>
                    <button className="btn-icon" title="Edit" onClick={() => setEditingEscalation(r)}><Edit2 className="w-3.5 h-3.5" /></button>
                    <button className="btn-icon text-red-400 hover:text-red-600" title="Delete" onClick={() => deleteEsc.mutate(r.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gateway setup info */}
      <div className="card p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500" /> SMS & WhatsApp Gateway Setup
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { name: 'MSG91 (India)', vars: 'SMS_GATEWAY=msg91\nMSG91_AUTH_KEY=your_key\nMSG91_SENDER_ID=CTISMS' },
            { name: 'Fast2SMS (India)', vars: 'SMS_GATEWAY=fast2sms\nFAST2SMS_API_KEY=your_key' },
            { name: 'Twilio (Global)', vars: 'SMS_GATEWAY=twilio\nTWILIO_SID=your_sid\nTWILIO_TOKEN=your_token\nTWILIO_FROM=+1234567890' },
          ].map(gw => (
            <div key={gw.name} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
              <p className="text-2xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{gw.name}</p>
              <pre className="text-2xs text-gray-500 font-mono whitespace-pre-wrap">{gw.vars}</pre>
            </div>
          ))}
        </div>
        <p className="text-2xs text-gray-400">
          Add these to <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">D:\Project\CTI\backend\.env</code> and restart the backend.
          For WhatsApp, use Twilio WhatsApp sandbox or 360Dialog.
        </p>
      </div>

      {/* How it works */}
      <div className="card p-4 border-l-4 border-primary-500 bg-primary-50/50 dark:bg-primary-900/10">
        <p className="text-xs font-semibold text-primary-700 dark:text-primary-400 mb-1">How it works</p>
        <ul className="text-2xs text-gray-600 dark:text-gray-400 space-y-0.5">
          <li>• <strong>Alert Rules</strong> fire instantly when a ticket event matches (created, SLA breach, etc.)</li>
          <li>• <strong>Escalation Rules</strong> are checked every 5 minutes — tickets open longer than the threshold get escalated</li>
          <li>• <strong>SLA</strong> is auto-set on create: Critical=4h, High=8h, Medium=24h, Low=48h</li>
          <li>• <strong>In-App</strong> notifications appear instantly in the notification bell (top bar) — no gateway needed</li>
        </ul>
      </div>

      {/* Modals */}
      {showAlertModal    && <AlertModal onClose={() => setShowAlertModal(false)} onSave={d => createAlert.mutate(d)} />}
      {editingAlert      && <AlertModal alert={editingAlert} onClose={() => setEditingAlert(null)} onSave={d => updateAlert.mutate({ id: editingAlert.id, data: d })} />}
      {showEscalationModal && <EscalationModal onClose={() => setShowEscalationModal(false)} onSave={d => createEsc.mutate(d)} />}
      {editingEscalation && <EscalationModal rule={editingEscalation} onClose={() => setEditingEscalation(null)} onSave={d => updateEsc.mutate({ id: editingEscalation.id, data: d })} />}
    </div>
  )
}
