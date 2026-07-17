import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { callsApi, ticketsApi } from '../services/api'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { Phone, Ticket, Calendar, PhoneCall, X, Settings, Wifi, WifiOff, FileText, Save, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../utils/cn'
import api from '../services/api'

// ── Types ────────────────────────────────────────────────────────────────────
interface IncomingCall {
  uniqueid: string
  caller_id: string
  caller_name: string
  campaign_id?: number
  customer?: { name?: string; email?: string; city?: string; remarks?: string }
  form?: {
    id: number
    name: string
    fields: Array<{
      id: number
      label: string
      field_name: string
      field_type: string
      placeholder?: string
      options?: Array<{ label: string; value: string }>
      is_required: boolean
      order: number
    }>
  }
}

// ── WebSocket hook ────────────────────────────────────────────────────────────
function useAgentWebSocket(token: string | null, onCallArrive: (call: IncomingCall) => void) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    if (!token) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${token}`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      // heartbeat
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, 25000)
      ws.addEventListener('close', () => clearInterval(ping))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        console.log('[WS MESSAGE]', msg)
        if (msg.type === 'call_arrive') onCallArrive(msg as IncomingCall)
      } catch { /* ignore */ }
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectRef.current = setTimeout(connect, 4000)
    }

    ws.onerror = () => ws.close()
  }, [token, onCallArrive])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return connected
}

// ── Form field renderer ───────────────────────────────────────────────────────
type FormFieldDef = NonNullable<IncomingCall['form']>['fields'][0]
function DynField({ field, value, onChange }: { field: FormFieldDef; value: any; onChange: (v: any) => void }) {
  const base = 'input w-full text-sm'
  switch (field.field_type) {
    case 'textarea':
      return <textarea className="input w-full text-sm min-h-[60px]" placeholder={field.placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'dropdown':
      return (
        <select className={base} value={value || ''} onChange={e => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {(field.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    case 'checkbox':
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options || []).map(o => (
            <label key={o.value} className="flex items-center gap-1 text-sm cursor-pointer">
              <input type="checkbox" checked={(value || []).includes(o.value)} onChange={e => {
                const arr: string[] = value || []
                onChange(e.target.checked ? [...arr, o.value] : arr.filter(v => v !== o.value))
              }} />
              {o.label}
            </label>
          ))}
        </div>
      )
    case 'radio':
      return (
        <div className="flex flex-wrap gap-3">
          {(field.options || []).map(o => (
            <label key={o.value} className="flex items-center gap-1 text-sm cursor-pointer">
              <input type="radio" name={field.field_name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )
    case 'date':
      return <input type="date" className={base} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'number':
      return <input type="number" className={base} placeholder={field.placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'email':
      return <input type="email" className={base} placeholder={field.placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'mobile':
      return <input type="tel" className={base} placeholder={field.placeholder || '+91 9999999999'} value={value || ''} onChange={e => onChange(e.target.value)} />
    default:
      return <input type="text" className={base} placeholder={field.placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgentPage() {
  const user = useSelector((s: RootState) => s.auth.user)
  const token = useSelector((s: RootState) => s.auth.accessToken)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [activeCall, setActiveCall] = useState<IncomingCall | null>(null)
  const [callTimer, setCallTimer] = useState(0)
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [showExtModal, setShowExtModal] = useState(false)
  const [extension, setExtension] = useState('')
  const [dialerUser, setDialerUser] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')

  // Load current extension + dialer user
  useEffect(() => {
    api.get('/calls/dialer/agent-status').then(r => {
      setExtension(r.data.extension || '')
      setDialerUser(r.data.dialer_user || '')
    }).catch(() => {})
  }, [])

  // Call timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    if (activeCall) {
      timer = setInterval(() => setCallTimer(t => t + 1), 1000)
    } else {
      setCallTimer(0)
    }
    return () => clearInterval(timer)
  }, [activeCall])

  // WebSocket — auto-pop form on incoming call
  const handleCallArrive = useCallback(async (call: IncomingCall) => {
    console.log('[CALL ARRIVE]', call)
    const prefill: Record<string, any> = {
      customer_name: call.caller_name || call.customer?.name || '',
      customer_mobile: call.caller_id,
      customer_email: call.customer?.email || '',
      city: call.customer?.city || '',
    }

    let resolvedCall = { ...call }

    // If form not in WS payload, fetch the agent's active form from API
    if (!call.form) {
      try {
        const formsRes = await api.get('/forms/')
        const forms: any[] = Array.isArray(formsRes.data) ? formsRes.data : (formsRes.data?.items || [])
        const ticketForm = forms.find((f: any) => f.category === 'ticket' && f.is_active)
        if (ticketForm) {
          const fieldsRes = await api.get(`/forms/${ticketForm.id}/fields`)
          resolvedCall.form = {
            id: ticketForm.id,
            name: ticketForm.name,
            fields: fieldsRes.data,
          }
        }
      } catch (e) {
        // form load failed — show basic quick-capture panel
      }
    }

    // Pre-fill matching form fields
    if (resolvedCall.form) {
      resolvedCall.form.fields.forEach((f: any) => {
        if (f.field_name === 'mobile' || f.field_name === 'phone' || f.field_name === 'customer_mobile') {
          prefill[f.field_name] = call.caller_id
        }
        if (f.field_name === 'name' || f.field_name === 'customer_name') {
          prefill[f.field_name] = call.caller_name || call.customer?.name || ''
        }
        if (f.field_name === 'email' || f.field_name === 'customer_email') {
          prefill[f.field_name] = call.customer?.email || ''
        }
        if (f.field_name === 'city') {
          prefill[f.field_name] = call.customer?.city || ''
        }
      })
    }

    setFormValues(prefill)
    setActiveCall(resolvedCall)
  }, [])

  const wsConnected = useAgentWebSocket(token, handleCallArrive)

  const { data: tickets } = useQuery({
    queryKey: ['agent-tickets'],
    queryFn: () => ticketsApi.list({ assigned_to: user?.id, limit: 20 }).then(r => r.data),
  })

  const { data: callbacks } = useQuery({
    queryKey: ['callbacks'],
    queryFn: () => callsApi.listCallbacks().then(r => r.data),
  })

  const { data: callLogs } = useQuery({
    queryKey: ['agent-calls'],
    queryFn: () => callsApi.listLogs({ limit: 10 }).then(r => r.data),
  })

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const openTickets = (tickets?.items || []).filter((t: any) => t.status === 'open' || t.status === 'in_progress').length
  const todayCallbacks = (callbacks || []).filter((c: any) => {
    const d = new Date(c.scheduled_at)
    return d.toDateString() === new Date().toDateString()
  }).length

  const saveExtension = async () => {
    setSaving(true)
    await Promise.all([
      api.patch('/calls/dialer/set-extension', { extension }).catch(() => {}),
      api.patch('/calls/dialer/set-dialer-user', { dialer_user: dialerUser }).catch(() => {}),
    ])
    setSaving(false)
    setShowExtModal(false)
  }

  const submitCallForm = async () => {
    if (!activeCall) return
    setSaving(true)
    setSubmitMsg('')
    try {
      const payload = {
        subject: formValues.subject || `Inbound Call — ${activeCall.caller_id}`,
        customer_name: formValues.customer_name || activeCall.caller_name || '',
        customer_mobile: formValues.customer_mobile || activeCall.caller_id,
        customer_email: formValues.customer_email || '',
        priority: formValues.priority || 'medium',
        form_id: activeCall.form?.id,
        form_data: formValues,
        dialer_call_id: activeCall.uniqueid,
      }
      await ticketsApi.create(payload)
      queryClient.invalidateQueries({ queryKey: ['agent-tickets'] })
      setSubmitMsg('Ticket created!')
      setTimeout(() => { setActiveCall(null); setSubmitMsg('') }, 1500)
    } catch (e: any) {
      setSubmitMsg('Error: ' + (e?.response?.data?.detail || 'Failed'))
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Agent Panel</h1>
          <p className="text-xs text-gray-500">Welcome back, {user?.full_name}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Extension badge */}
          <button
            onClick={() => setShowExtModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
            title="Set your ViciBox extension"
          >
            <Settings className="w-3 h-3" />
            Ext: {extension || 'Not set'}
          </button>
          {/* WS status */}
          <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium', wsConnected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>
            {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {wsConnected ? 'Live' : 'Connecting…'}
          </div>
          {/* Call status */}
          <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium', activeCall ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}>
            <div className={cn('w-2 h-2 rounded-full', activeCall ? 'bg-red-500 animate-pulse' : 'bg-green-500')} />
            {activeCall ? `On Call — ${formatTime(callTimer)}` : 'Available'}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Open Tickets', value: openTickets, icon: Ticket, color: 'text-primary-600 bg-primary-50' },
          { label: 'Today Callbacks', value: todayCallbacks, icon: Calendar, color: 'text-orange-600 bg-orange-50' },
          { label: 'Calls Today', value: callLogs?.total || 0, icon: Phone, color: 'text-blue-600 bg-blue-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-3 flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', color)}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
              <p className="text-2xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── INCOMING CALL POPUP ─────────────────────────────────────────────── */}
      {activeCall && (
        <div className="card border-2 border-red-300 dark:border-red-700 shadow-lg">
          {/* Call bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <PhoneCall className="w-4 h-4 text-red-600 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  {activeCall.caller_name || 'Unknown Caller'}
                </p>
                <p className="text-xs text-gray-500">{activeCall.caller_id}</p>
              </div>
              <div className="text-lg font-mono font-bold text-red-600 ml-4">{formatTime(callTimer)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-sm bg-green-600 text-white hover:bg-green-700 flex items-center gap-1" onClick={submitCallForm} disabled={saving}>
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save & Create Ticket'}
              </button>
              <button className="btn-danger btn-sm flex items-center gap-1" onClick={() => setActiveCall(null)}>
                <X className="w-3.5 h-3.5" /> End Call
              </button>
            </div>
          </div>

          {submitMsg && (
            <div className={cn('px-4 py-2 text-sm font-medium', submitMsg.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}>
              {submitMsg}
            </div>
          )}

          {/* Form fields */}
          <div className="p-4">
            {activeCall.form ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-primary-600" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{activeCall.form.name}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Always-visible base fields */}
                  <div>
                    <label className="label">Customer Name</label>
                    <input className="input w-full text-sm" value={formValues.customer_name || ''} onChange={e => setFormValues(v => ({ ...v, customer_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Mobile <span className="text-red-500">*</span></label>
                    <input className="input w-full text-sm" value={formValues.customer_mobile || ''} onChange={e => setFormValues(v => ({ ...v, customer_mobile: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input type="email" className="input w-full text-sm" value={formValues.customer_email || ''} onChange={e => setFormValues(v => ({ ...v, customer_email: e.target.value }))} />
                  </div>
                  {/* Dynamic form fields */}
                  {activeCall.form.fields
                    .filter(f => !['customer_name', 'name', 'mobile', 'phone', 'email', 'customer_email', 'customer_mobile'].includes(f.field_name))
                    .map(f => (
                      <div key={f.id} className={f.field_type === 'textarea' ? 'md:col-span-2' : ''}>
                        <label className="label">
                          {f.label}
                          {f.is_required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <DynField
                          field={f}
                          value={formValues[f.field_name]}
                          onChange={v => setFormValues(prev => ({ ...prev, [f.field_name]: v }))}
                        />
                      </div>
                    ))}
                </div>
              </>
            ) : (
              /* No form assigned — show basic quick-capture */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Customer Name</label>
                  <input className="input w-full text-sm" value={formValues.customer_name || ''} onChange={e => setFormValues(v => ({ ...v, customer_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Mobile</label>
                  <input className="input w-full text-sm" value={formValues.customer_mobile || activeCall.caller_id} onChange={e => setFormValues(v => ({ ...v, customer_mobile: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" className="input w-full text-sm" value={formValues.customer_email || ''} onChange={e => setFormValues(v => ({ ...v, customer_email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Priority</label>
                  <select className="input w-full text-sm" value={formValues.priority || 'medium'} onChange={e => setFormValues(v => ({ ...v, priority: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="label">Notes / Subject</label>
                  <textarea className="input w-full text-sm min-h-[60px]" value={formValues.subject || ''} onChange={e => setFormValues(v => ({ ...v, subject: e.target.value }))} placeholder="Brief description of the call..." />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tickets + Callbacks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">My Tickets</h3>
            <span className="badge bg-primary-100 text-primary-700">{openTickets} open</span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-72 overflow-y-auto">
            {(tickets?.items || []).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No tickets assigned</p>
            ) : (
              (tickets?.items || []).slice(0, 10).map((t: any) => (
                <div
                  key={t.id}
                  className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer group"
                  onClick={() => navigate(`/tickets/${t.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-mono text-primary-600">{t.ticket_number}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`badge-${t.priority}`}>{t.priority}</span>
                      <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 truncate">{t.subject}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`badge-${t.status}`}>{t.status?.replace('_', ' ')}</span>
                    {t.customer_name && <span className="text-2xs text-gray-500">{t.customer_name}</span>}
                    {t.customer_mobile && <span className="text-2xs text-gray-400">{t.customer_mobile}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Upcoming Callbacks</h3>
            <span className="badge bg-orange-100 text-orange-700">{todayCallbacks} today</span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-72 overflow-y-auto">
            {(callbacks || []).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No callbacks scheduled</p>
            ) : (
              (callbacks || []).slice(0, 8).map((cb: any) => (
                <div key={cb.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className="w-8 h-8 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-3.5 h-3.5 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white">{cb.customer_name || cb.phone_number}</p>
                    <p className="text-2xs text-gray-400">{cb.phone_number}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-2xs font-medium text-orange-600">{cb.scheduled_at ? format(new Date(cb.scheduled_at), 'HH:mm') : ''}</p>
                    <p className="text-2xs text-gray-400">{cb.scheduled_at ? format(new Date(cb.scheduled_at), 'MMM d') : ''}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Dev simulator */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Simulate Incoming Call <span className="text-2xs text-gray-400 font-normal">(dev / test)</span></h3>
        <p className="text-2xs text-gray-400 mb-3">In production, ViciBox AGI triggers this automatically when a call lands on your extension.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <input className="input w-44 text-sm" placeholder="+91 9999999999" id="sim-phone" />
          <input className="input w-40 text-sm" placeholder="Caller name" id="sim-name" />
          <button
            className="btn-primary flex items-center gap-1.5"
            onClick={async () => {
              const phone = (document.getElementById('sim-phone') as HTMLInputElement)?.value
              const name = (document.getElementById('sim-name') as HTMLInputElement)?.value
              if (!phone) return
              if (extension) {
                // Hit the real webhook — backend will fetch form and push via WS
                try {
                  await api.post('/calls/dialer/call-arrived', {
                    agent_extension: extension,
                    caller_id: phone,
                    caller_name: name || 'Customer',
                    uniqueid: 'sim-' + Date.now(),
                  })
                  // WS event will arrive in ~100ms and trigger handleCallArrive
                } catch {
                  // Fallback if webhook fails — direct trigger with form fetch
                  handleCallArrive({ uniqueid: 'sim-' + Date.now(), caller_id: phone, caller_name: name || 'Customer', customer: {} })
                }
              } else {
                // No extension set — direct trigger with form fetch
                handleCallArrive({ uniqueid: 'sim-' + Date.now(), caller_id: phone, caller_name: name || 'Customer', customer: {} })
              }
            }}
          >
            <PhoneCall className="w-4 h-4" /> Simulate Call
          </button>
        </div>
        {!extension && (
          <p className="text-2xs text-orange-500 mt-2">Set your ViciBox extension (top right) to simulate a full call with form auto-load.</p>
        )}
      </div>

      {/* Extension modal */}
      {showExtModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-80">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Dialer Settings</h3>
            <p className="text-xs text-gray-500 mb-4">Connect your ViciDial account so incoming calls auto-pop the form.</p>
            <label className="label">SIP Extension (ViciBox)</label>
            <input
              className="input w-full text-sm mb-3"
              placeholder="e.g. 8001"
              value={extension}
              onChange={e => setExtension(e.target.value)}
              autoFocus
            />
            <label className="label">ViciDial Agent User ID</label>
            <input
              className="input w-full text-sm mb-4"
              placeholder="e.g. 1001 or agent1"
              value={dialerUser}
              onChange={e => setDialerUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveExtension()}
            />
            <p className="text-2xs text-gray-400 mb-3">ViciDial Admin → Agents → Agent User column</p>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary btn-sm" onClick={() => setShowExtModal(false)}>Cancel</button>
              <button className="btn-primary btn-sm" onClick={saveExtension} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
