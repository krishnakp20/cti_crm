import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { callsApi, ticketsApi } from '../services/api'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import {
  Phone, Ticket, Calendar, PhoneCall, X, Settings,
  Wifi, WifiOff, FileText, Save, ExternalLink, AlertCircle, CheckCircle2,
  Headphones, Radio, Mic, MicOff, ShieldAlert,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn, formatLabel } from '../utils/cn'
import api from '../services/api'
import toast from 'react-hot-toast'
import JsSIP from 'jssip'

// ── Constants ─────────────────────────────────────────────────────────────────
const CALL_TAGS = ['Query', 'Complaint', 'Follow-up', 'Sales', 'Support', 'Other']

const DISPOSITIONS = [
  { value: '', label: '— Select Disposition —' },
  { value: 'resolved',            label: 'Resolved' },
  { value: 'pending',             label: 'Pending' },
  { value: 'escalated',           label: 'Escalated' },
  { value: 'not_reachable',       label: 'Not Reachable' },
  { value: 'call_back_requested', label: 'Call Back Requested' },
]

// ── Types ─────────────────────────────────────────────────────────────────────
interface IncomingCall {
  uniqueid: string
  caller_id: string
  caller_name: string
  campaign_id?: number
  customer?: { name?: string; email?: string; city?: string }
  form?: {
    id: number
    name: string
    fields: Array<{
      id: number; label: string; field_name: string; field_type: string
      placeholder?: string; options?: Array<{ label: string; value: string }>
      is_required: boolean; order: number
    }>
  }
}

interface WrapupData {
  call: IncomingCall
  formValues: Record<string, any>
}

// ── WebSocket hook ─────────────────────────────────────────────────────────────
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
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, 25000)
      ws.addEventListener('close', () => clearInterval(ping))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
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

// ── Microphone permission hook ────────────────────────────────────────────────
type MicState = 'checking' | 'granted' | 'denied' | 'prompt' | 'unsupported'

function useMicrophonePermission() {
  const [micState, setMicState] = useState<MicState>('checking')

  const check = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState('unsupported')
      return
    }
    try {
      if (navigator.permissions) {
        const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        setMicState(perm.state as MicState)
        perm.onchange = () => setMicState(perm.state as MicState)
        if (perm.state !== 'denied') return
      }
    } catch { /* permissions API not available */ }
    // Fallback: just mark as prompt if we can't query
    setMicState(prev => prev === 'checking' ? 'prompt' : prev)
  }, [])

  const request = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      stream.getTracks().forEach(t => t.stop())
      setMicState('granted')
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicState('denied')
      }
    }
  }, [])

  useEffect(() => { check() }, [check])

  return { micState, request }
}

// ── WebRTC Softphone hook ─────────────────────────────────────────────────────
type SipStatus = 'idle' | 'connecting' | 'registered' | 'ringing' | 'in_call' | 'failed'

interface SipConfig {
  server: string    // wss://192.168.10.30:8089/ws
  extension: string // e.g. "8001"
  password: string
  domain: string    // e.g. "192.168.10.30"
}

function useWebRTCSoftphone(config: SipConfig | null, onIncomingCall?: (callerId: string, callerName: string) => void, onCallEnded?: () => void) {
  const [status, setStatus] = useState<SipStatus>('idle')
  const [callSession, setCallSession] = useState<any>(null)
  const uaRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const onIncomingCallRef = useRef(onIncomingCall)
  const onCallEndedRef = useRef(onCallEnded)
  onIncomingCallRef.current = onIncomingCall
  onCallEndedRef.current = onCallEnded

  useEffect(() => {
    if (!config) return
    if (!config.server || !config.extension || !config.password) return

    // Expose JsSIP for browser console debugging
    ;(window as any).JsSIP = JsSIP
    JsSIP.debug.enable('JsSIP:*')

    const socket = new JsSIP.WebSocketInterface(config.server)
    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${config.extension}@${config.domain}`,
      password: config.password,
      register: true,
      register_expires: 300,
      contact_uri: `sip:${config.extension}@${config.domain};transport=ws`,
    })
    uaRef.current = ua

    ua.on('connecting', () => setStatus('connecting'))
    ua.on('connected', () => setStatus('connecting'))
    ua.on('registered', () => setStatus('registered'))
    ua.on('unregistered', () => setStatus('idle'))
    ua.on('registrationFailed', () => setStatus('failed'))
    ua.on('disconnected', () => setStatus('idle'))

    ua.on('newRTCSession', (e: any) => {
      const session = e.session
      if (session.direction !== 'incoming') return

      // Extract caller ID from SIP From header
      const callerId: string = session.remote_identity?.uri?.user || 'Unknown'
      const callerName: string = session.remote_identity?.display_name || ''
      onIncomingCallRef.current?.(callerId, callerName)

      setStatus('ringing')
      setCallSession(session)

      session.on('accepted', () => setStatus('in_call'))
      session.on('ended', () => { setStatus('registered'); setCallSession(null); onCallEndedRef.current?.() })
      session.on('failed', () => { setStatus('registered'); setCallSession(null); onCallEndedRef.current?.() })

      session.on('peerconnection', (pe: any) => {
        const pc: RTCPeerConnection = pe.peerconnection
        pc.ontrack = (ev) => {
          if (!audioRef.current) {
            audioRef.current = new Audio()
            audioRef.current.autoplay = true
          }
          audioRef.current.srcObject = ev.streams[0]
        }
      })

      // Auto-answer after brief delay (ViciDial expects auto-answer)
      setTimeout(() => {
        if (session.status !== session.C?.STATUS_TERMINATED) {
          session.answer({
            mediaConstraints: { audio: true, video: false },
            pcConfig: { iceServers: [] },
          })
        }
      }, 400)
    })

    ua.start()
    return () => {
      try { ua.stop() } catch { /* ignore */ }
    }
  }, [config?.server, config?.extension, config?.password, config?.domain])

  const hangup = useCallback(() => {
    if (callSession) {
      try { callSession.terminate() } catch { /* ignore */ }
    }
  }, [callSession])

  return { status, hangup }
}

// ── Softphone status badge ────────────────────────────────────────────────────
function SoftphoneBadge({ status, onHangup }: { status: SipStatus; onHangup: () => void }) {
  const map: Record<SipStatus, { label: string; cls: string }> = {
    idle:        { label: 'WebRTC: Offline',     cls: 'bg-gray-100 text-gray-500' },
    connecting:  { label: 'WebRTC: Connecting…', cls: 'bg-yellow-100 text-yellow-700' },
    registered:  { label: 'WebRTC: Ready',       cls: 'bg-blue-100 text-blue-700' },
    ringing:     { label: 'WebRTC: Ringing…',    cls: 'bg-purple-100 text-purple-700' },
    in_call:     { label: 'WebRTC: In Call',     cls: 'bg-green-100 text-green-700' },
    failed:      { label: 'WebRTC: Reg Failed',  cls: 'bg-red-100 text-red-700' },
  }
  const { label, cls } = map[status]
  return (
    <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium', cls)}>
      <Headphones className="w-3 h-3" />
      {label}
      {status === 'in_call' && (
        <button onClick={onHangup} className="ml-1 hover:text-red-600 transition-colors">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ── Dynamic form field renderer ───────────────────────────────────────────────
type FormFieldDef = NonNullable<IncomingCall['form']>['fields'][0]
function DynField({ field, value, onChange }: { field: FormFieldDef; value: any; onChange: (v: any) => void }) {
  const base = 'input w-full text-sm'
  switch (field.field_type) {
    case 'textarea':
      return <textarea className="input w-full text-sm min-h-[56px]" placeholder={field.placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
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
                onChange(e.target.checked ? [...arr, o.value] : arr.filter((v: string) => v !== o.value))
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
    case 'date':   return <input type="date" className={base} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'number': return <input type="number" className={base} placeholder={field.placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'email':  return <input type="email" className={base} placeholder={field.placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'mobile': return <input type="tel" className={base} placeholder={field.placeholder || '+91 9999999999'} value={value || ''} onChange={e => onChange(e.target.value)} />
    default:       return <input type="text" className={base} placeholder={field.placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
  }
}

// ── Call Tags picker ──────────────────────────────────────────────────────────
function CallTagsPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (tag: string) =>
    onChange(value.includes(tag) ? value.filter(t => t !== tag) : [...value, tag])
  return (
    <div className="flex flex-wrap gap-1.5">
      {CALL_TAGS.map(tag => (
        <button
          key={tag} type="button"
          onClick={() => toggle(tag)}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
            value.includes(tag)
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:text-primary-600'
          )}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 mt-1">
      {children}
    </p>
  )
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
  const [callTags, setCallTags] = useState<string[]>([])
  const [disposition, setDisposition] = useState('')
  const [callSummary, setCallSummary] = useState('')

  // Wrap-up gate — shown after call ends if disposition not yet set
  const [wrapup, setWrapup] = useState<WrapupData | null>(null)
  const [wrapupDisposition, setWrapupDisposition] = useState('')
  const [wrapupSummary, setWrapupSummary] = useState('')
  const [wrapupTags, setWrapupTags] = useState<string[]>([])
  const [dispRequired, setDispRequired] = useState(false)

  const [showExtModal, setShowExtModal] = useState(false)
  const [extension, setExtension] = useState('')
  const [sipPassword, setSipPassword] = useState('')
  const [sipServerUrl, setSipServerUrl] = useState('')
  const [connectionType, setConnectionType] = useState<'remote' | 'webrtc'>('remote')
  const [agentMobile, setAgentMobile] = useState('')
  const [dialerUser, setDialerUser] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/calls/dialer/agent-status').then(r => {
      setExtension(r.data.extension || '')
      setDialerUser(r.data.dialer_user || '')
    }).catch(() => {})
    // Load SIP / connection settings from auth profile
    api.get('/auth/me').then(r => {
      setConnectionType(r.data.connection_type || 'remote')
      setAgentMobile(r.data.agent_mobile || '')
      setSipServerUrl(r.data.sip_server_url || '')
      setSipPassword(r.data.sip_password || '')
      if (r.data.extension) setExtension(r.data.extension)
      if (r.data.dialer_user) setDialerUser(r.data.dialer_user)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    if (activeCall) {
      timer = setInterval(() => setCallTimer(t => t + 1), 1000)
    } else {
      setCallTimer(0)
    }
    return () => clearInterval(timer)
  }, [activeCall])

  const handleCallArrive = useCallback(async (call: IncomingCall) => {
    // Don't interrupt wrap-up — queue the call notification but don't pop form
    const prefill: Record<string, any> = {
      customer_name: call.caller_name || call.customer?.name || '',
      customer_mobile: call.caller_id,
      customer_email: call.customer?.email || '',
      customer_address: '',
    }

    let resolvedCall = { ...call }

    if (!call.form) {
      try {
        const formsRes = await api.get('/forms')
        const forms: any[] = Array.isArray(formsRes.data) ? formsRes.data : (formsRes.data?.items || [])
        const ticketForm = forms.find((f: any) => f.is_active)
        if (ticketForm) {
          const fieldsRes = await api.get(`/forms/${ticketForm.id}/fields`)
          resolvedCall.form = { id: ticketForm.id, name: ticketForm.name, fields: fieldsRes.data }
        }
      } catch { /* fallback to basic */ }
    }

    if (resolvedCall.form) {
      resolvedCall.form.fields.forEach((f: any) => {
        if (['mobile', 'phone', 'customer_mobile'].includes(f.field_name)) prefill[f.field_name] = call.caller_id
        if (['name', 'customer_name'].includes(f.field_name)) prefill[f.field_name] = call.caller_name || call.customer?.name || ''
        if (['email', 'customer_email'].includes(f.field_name)) prefill[f.field_name] = call.customer?.email || ''
      })
    }

    setFormValues(prefill)
    setCallTags([])
    setDisposition('')
    setCallSummary('')
    setActiveCall(resolvedCall)
  }, [])

  const wsConnected = useAgentWebSocket(token, handleCallArrive)

  // Build SIP config from current state; null disables the hook
  const sipConfig: SipConfig | null = (connectionType === 'webrtc' && extension && sipPassword && sipServerUrl)
    ? {
        server: sipServerUrl,
        extension,
        password: sipPassword,
        domain: (() => { try { return new URL(sipServerUrl).hostname } catch { return sipServerUrl } })(),
      }
    : null

  const handleWebRTCIncoming = useCallback((callerId: string, callerName: string) => {
    handleCallArrive({
      uniqueid: `webrtc-${Date.now()}`,
      caller_id: callerId,
      caller_name: callerName,
    })
  }, [handleCallArrive])

  const handleWebRTCEnded = useCallback(() => {
    // If call ends from remote side without agent ending it, trigger wrap-up
    setActiveCall(prev => {
      if (prev) {
        setWrapup({ call: prev, formValues })
        setWrapupDisposition('')
        setWrapupSummary(callSummary)
        setWrapupTags([...callTags])
        return null
      }
      return prev
    })
  }, [formValues, callSummary, callTags])

  const { status: sipStatus, hangup: sipHangup } = useWebRTCSoftphone(sipConfig, handleWebRTCIncoming, handleWebRTCEnded)
  const { micState, request: requestMic } = useMicrophonePermission()

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
    queryFn: () => callsApi.listLogs({ limit: 10 }).then(r => r.data).catch(() => ({ total: 0 })),
  })

  // Today's CDR count for this agent
  const today = new Date().toISOString().slice(0, 10)
  const { data: todayCdr } = useQuery({
    queryKey: ['agent-cdr-today'],
    queryFn: () => api.get('/cdr', { params: { date_from: today, date_to: today, limit: 1 } }).then(r => r.data),
    refetchInterval: 30000,
  })

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const openTickets = (tickets?.items || []).filter((t: any) => ['open', 'in_progress'].includes(t.status)).length
  const todayCallbacks = (callbacks || []).filter((c: any) =>
    new Date(c.scheduled_at).toDateString() === new Date().toDateString()
  ).length

  const saveExtension = async () => {
    setSaving(true)
    await Promise.all([
      api.patch('/calls/dialer/set-extension', { extension }).catch(() => {}),
      api.patch('/calls/dialer/set-dialer-user', { dialer_user: dialerUser }).catch(() => {}),
      api.patch('/users/me/dialer-settings', {
        connection_type: connectionType,
        agent_mobile: agentMobile || null,
        sip_server_url: sipServerUrl || null,
        sip_password: sipPassword || null,
      }).catch(() => {}),
    ])
    setSaving(false)
    setShowExtModal(false)
    toast.success('Settings saved')
  }

  // Build ticket payload from current call + disposition fields
  const buildPayload = (call: IncomingCall, fv: Record<string, any>, disp: string, summary: string, tags: string[]) => ({
    subject: fv.subject || `Inbound Call — ${call.caller_id}`,
    customer_name: fv.customer_name || call.caller_name || '',
    customer_mobile: fv.customer_mobile || call.caller_id,
    customer_email: fv.customer_email || '',
    priority: fv.priority || 'medium',
    form_id: call.form?.id,
    form_data: {
      ...fv,
      call_tags: tags,
      disposition: disp,
      call_summary: summary,
    },
    dialer_call_id: call.uniqueid,
  })

  // Save during active call (disposition optional here — warn but allow)
  const saveAndCreate = async () => {
    if (!activeCall) return
    if (!disposition) {
      setDispRequired(true)
      // Scroll to disposition
      document.getElementById('disposition-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast.error('Please select a Call Disposition before saving')
      return
    }
    setDispRequired(false)
    setSaving(true)
    try {
      await ticketsApi.create(buildPayload(activeCall, formValues, disposition, callSummary, callTags))
      queryClient.invalidateQueries({ queryKey: ['agent-tickets'] })
      toast.success('Ticket created!')
      setActiveCall(null)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to create ticket')
    }
    setSaving(false)
  }

  // End call → hang up SIP session, then enter wrap-up gate
  const endCall = () => {
    if (!activeCall) return
    // Terminate WebRTC session if active
    sipHangup()
    // Always enter wrap-up (agent must submit disposition before becoming available)
    setWrapup({ call: activeCall, formValues: { ...formValues } })
    setWrapupDisposition(disposition)
    setWrapupSummary(callSummary)
    setWrapupTags([...callTags])
    setActiveCall(null)
  }

  // Submit wrap-up
  const submitWrapup = async () => {
    if (!wrapup) return
    if (!wrapupDisposition) {
      setDispRequired(true)
      return
    }
    setDispRequired(false)
    setSaving(true)
    try {
      await ticketsApi.create(buildPayload(wrapup.call, wrapup.formValues, wrapupDisposition, wrapupSummary, wrapupTags))
      queryClient.invalidateQueries({ queryKey: ['agent-tickets'] })
      toast.success('Ticket saved — you are now available')
      setWrapup(null)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to save')
    }
    setSaving(false)
  }

  const micBlocked = micState === 'denied' || micState === 'unsupported'
  const micPending = micState === 'prompt' || micState === 'checking'

  return (
    <div className="space-y-4 max-w-5xl">

      {/* ── MICROPHONE DENIED BANNER ───────────────────────────────────────── */}
      {(micBlocked || micPending) && micState !== 'checking' && (
        <div className={cn(
          'flex items-start gap-3 px-4 py-3 rounded-xl border text-sm',
          micBlocked
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        )}>
          <MicOff className={cn('w-5 h-5 mt-0.5 flex-shrink-0', micBlocked ? 'text-red-500' : 'text-amber-500')} />
          <div className="flex-1 min-w-0">
            {micBlocked ? (
              <>
                <p className="font-semibold text-red-700 dark:text-red-400">Microphone access is blocked</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  Incoming calls cannot be received without microphone access. To fix this, click the lock icon
                  in your browser's address bar → <strong>Microphone</strong> → set to <strong>Allow</strong>,
                  then reload the page.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-amber-700 dark:text-amber-400">Microphone permission required</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  You must allow microphone access to receive calls in this browser.
                </p>
              </>
            )}
          </div>
          {micState === 'prompt' && (
            <button
              onClick={requestMic}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
            >
              <Mic className="w-3.5 h-3.5" /> Enable Microphone
            </button>
          )}
          {micBlocked && (
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
            >
              Reload after fixing
            </button>
          )}
        </div>
      )}

      {/* ── MIC BLOCKED INCOMING CALL OVERLAY ─────────────────────────────── */}
      {activeCall && micBlocked && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-900 dark:text-white">Microphone Blocked — Call Cannot Connect</p>
              <p className="text-sm text-gray-500 mt-1">
                An incoming call arrived from <span className="font-semibold">{activeCall.caller_id}</span>, but your microphone is blocked.
                The caller will not hear you until microphone access is granted.
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-left text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
              <p className="font-semibold text-gray-700 dark:text-gray-300">How to fix in Chrome / Edge:</p>
              <p>1. Click the <strong>lock icon</strong> (🔒) in the address bar</p>
              <p>2. Find <strong>Microphone</strong> → change to <strong>Allow</strong></p>
              <p>3. Click <strong>Reload</strong> below</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setActiveCall(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Dismiss Call
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MANDATORY WRAP-UP GATE ─────────────────────────────────────────── */}
      {wrapup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 bg-amber-50 dark:bg-amber-900/20 rounded-t-2xl border-b border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">Complete call wrap-up to continue</p>
                <p className="text-xs text-gray-500">You cannot receive the next call until disposition is submitted.</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Caller summary */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-4 h-4 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{wrapup.call.caller_name || 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{wrapup.call.caller_id}</p>
                </div>
              </div>

              {/* Call Tags */}
              <div>
                <SectionLabel>Call Tags</SectionLabel>
                <CallTagsPicker value={wrapupTags} onChange={setWrapupTags} />
              </div>

              {/* Disposition — required */}
              <div>
                <SectionLabel>Call Disposition <span className="text-red-500 normal-case">*</span></SectionLabel>
                <select
                  value={wrapupDisposition}
                  onChange={e => { setWrapupDisposition(e.target.value); setDispRequired(false) }}
                  className={cn('input w-full text-sm', dispRequired && !wrapupDisposition ? 'border-red-500 ring-2 ring-red-200' : '')}
                >
                  {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                {dispRequired && !wrapupDisposition && (
                  <p className="text-xs text-red-500 mt-1">Disposition is required before you can continue.</p>
                )}
              </div>

              {/* Call Summary — optional */}
              <div>
                <SectionLabel>Call Summary <span className="text-gray-400 normal-case font-normal">(optional)</span></SectionLabel>
                <textarea
                  className="input w-full text-sm min-h-[72px] resize-none"
                  placeholder="Brief summary of the call..."
                  value={wrapupSummary}
                  onChange={e => setWrapupSummary(e.target.value)}
                />
              </div>

              <button
                onClick={submitWrapup}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                {saving ? 'Submitting…' : 'Submit & Mark Available'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Agent Panel</h1>
          <p className="text-xs text-gray-500">Welcome back, {user?.full_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExtModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
          >
            <Settings className="w-3 h-3" />
            Ext: {extension || 'Not set'}
          </button>
          <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
            wsConnected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>
            {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {wsConnected ? 'Live' : 'Connecting…'}
          </div>
          {connectionType === 'webrtc' && (
            <SoftphoneBadge status={sipStatus} onHangup={sipHangup} />
          )}
          {/* Microphone status pill */}
          <button
            onClick={micState === 'prompt' ? requestMic : undefined}
            title={
              micState === 'granted' ? 'Microphone enabled' :
              micState === 'denied' ? 'Microphone blocked — click lock in address bar to fix' :
              micState === 'prompt' ? 'Click to enable microphone' :
              micState === 'unsupported' ? 'Microphone not supported' : 'Checking mic…'
            }
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              micState === 'granted' ? 'bg-green-100 text-green-700 cursor-default' :
              micState === 'denied' || micState === 'unsupported' ? 'bg-red-100 text-red-700 cursor-default' :
              micState === 'prompt' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 cursor-pointer' :
              'bg-gray-100 text-gray-500 cursor-default'
            )}
          >
            {micState === 'granted' ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
            {micState === 'granted' ? 'Mic On' :
             micState === 'denied' ? 'Mic Blocked' :
             micState === 'unsupported' ? 'No Mic' :
             micState === 'prompt' ? 'Enable Mic' : 'Mic…'}
          </button>
          <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
            activeCall ? 'bg-red-100 text-red-700'
            : wrapup ? 'bg-amber-100 text-amber-700'
            : 'bg-green-100 text-green-700')}>
            <div className={cn('w-2 h-2 rounded-full',
              activeCall ? 'bg-red-500 animate-pulse'
              : wrapup ? 'bg-amber-500 animate-pulse'
              : 'bg-green-500')} />
            {activeCall ? `On Call — ${formatTime(callTimer)}` : wrapup ? 'Wrap-up Required' : 'Available'}
          </div>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Open Tickets',    value: openTickets,          icon: Ticket,   color: 'text-primary-600 bg-primary-50' },
          { label: 'Today Callbacks', value: todayCallbacks,       icon: Calendar, color: 'text-orange-600 bg-orange-50' },
          { label: 'Calls Today',     value: todayCdr?.total || 0, icon: Phone,    color: 'text-blue-600 bg-blue-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-3 flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', color)}><Icon className="w-4 h-4" /></div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
              <p className="text-2xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── ACTIVE CALL FORM ──────────────────────────────────────────────────── */}
      {activeCall && (
        <div className="card border-2 border-red-200 dark:border-red-800 shadow-lg">

          {/* Call bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <PhoneCall className="w-4 h-4 text-red-600 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{activeCall.caller_name || 'Unknown Caller'}</p>
                <p className="text-xs text-gray-500">{activeCall.caller_id}</p>
              </div>
              <div className="text-lg font-mono font-bold text-red-600 ml-4">{formatTime(callTimer)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={endCall}
                className="btn-sm bg-red-600 text-white hover:bg-red-700 flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> End Call
              </button>
            </div>
          </div>

          {/* Form body */}
          <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">

            {/* ─ Customer ─ */}
            <div className="lg:col-span-2">
              <SectionLabel>Customer Details</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Name</label>
                  <input className="input w-full text-sm" value={formValues.customer_name || ''} onChange={e => setFormValues(v => ({ ...v, customer_name: e.target.value }))} placeholder="Customer name" />
                </div>
                <div>
                  <label className="label">Mobile <span className="text-red-500">*</span></label>
                  <input className="input w-full text-sm" value={formValues.customer_mobile || ''} onChange={e => setFormValues(v => ({ ...v, customer_mobile: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" className="input w-full text-sm" value={formValues.customer_email || ''} onChange={e => setFormValues(v => ({ ...v, customer_email: e.target.value }))} placeholder="email@example.com" />
                </div>
                <div>
                  <label className="label">Address</label>
                  <input className="input w-full text-sm" value={formValues.customer_address || ''} onChange={e => setFormValues(v => ({ ...v, customer_address: e.target.value }))} placeholder="City / Area" />
                </div>
              </div>
            </div>

            {/* ─ Dynamic form fields ─ */}
            {activeCall.form && activeCall.form.fields.filter(f =>
              !['customer_name','name','mobile','phone','email','customer_email','customer_mobile',
                'call_tags','call_disposition','disposition','call_summary','summary'].includes(f.field_name)
            ).length > 0 && (
              <div className="lg:col-span-2">
                <SectionLabel>
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3 h-3" />{activeCall.form.name}
                  </span>
                </SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  {activeCall.form.fields
                    .filter(f => !['customer_name','name','mobile','phone','email','customer_email','customer_mobile',
                      'call_tags','call_disposition','disposition','call_summary','summary'].includes(f.field_name))
                    .map(f => (
                      <div key={f.id} className={f.field_type === 'textarea' ? 'col-span-2' : ''}>
                        <label className="label">{f.label}{f.is_required && <span className="text-red-500 ml-1">*</span>}</label>
                        <DynField field={f} value={formValues[f.field_name]} onChange={v => setFormValues(p => ({ ...p, [f.field_name]: v }))} />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ─ Call Tags ─ */}
            <div className="lg:col-span-2">
              <SectionLabel>Call Tags</SectionLabel>
              <CallTagsPicker value={callTags} onChange={setCallTags} />
            </div>

            {/* ─ Disposition ─ */}
            <div id="disposition-field">
              <SectionLabel>Call Disposition <span className="text-red-500 normal-case">*</span></SectionLabel>
              <select
                value={disposition}
                onChange={e => { setDisposition(e.target.value); setDispRequired(false) }}
                className={cn('input w-full text-sm', dispRequired && !disposition ? 'border-red-500 ring-2 ring-red-200' : '')}
              >
                {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              {dispRequired && !disposition && (
                <p className="text-xs text-red-500 mt-1">Required — select a disposition to save.</p>
              )}
            </div>

            {/* ─ Call Summary ─ */}
            <div>
              <SectionLabel>Call Summary <span className="text-gray-400 normal-case font-normal">(optional)</span></SectionLabel>
              <textarea
                className="input w-full text-sm min-h-[72px] resize-none"
                placeholder="Brief summary of what was discussed..."
                value={callSummary}
                onChange={e => setCallSummary(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Tickets + Callbacks ────────────────────────────────────────────────── */}
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
                <div key={t.id} className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer group" onClick={() => navigate(`/tickets/${t.id}`)}>
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-mono text-primary-600">{t.ticket_number}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`badge-${t.priority}`}>{formatLabel(t.priority)}</span>
                      <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 truncate">{t.subject}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`badge-${t.status}`}>{formatLabel(t.status)}</span>
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


      {/* ── Extension modal ────────────────────────────────────────────────────── */}
      {showExtModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-96 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Connection Settings</h3>
            <p className="text-xs text-gray-500 mb-4">Your call settings are configured by the administrator.</p>

            {/* Connection type indicator */}
            <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mb-4',
              connectionType === 'webrtc' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-600 border border-gray-200')}>
              {connectionType === 'webrtc' ? <Headphones className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5" />}
              {connectionType === 'webrtc' ? 'WebRTC mode — calls handled in this browser' : 'Remote mode — calls forwarded to your phone'}
            </div>

            {/* Microphone status inside settings modal */}
            <div className={cn(
              'flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium mb-4 border',
              micState === 'granted' ? 'bg-green-50 text-green-700 border-green-200' :
              micState === 'denied' ? 'bg-red-50 text-red-700 border-red-200' :
              'bg-amber-50 text-amber-700 border-amber-200'
            )}>
              {micState === 'granted' ? <Mic className="w-3.5 h-3.5 flex-shrink-0" /> : <MicOff className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="flex-1">
                {micState === 'granted' ? 'Microphone enabled — ready to receive calls' :
                 micState === 'denied' ? 'Microphone blocked — click the lock in address bar → Allow' :
                 micState === 'unsupported' ? 'Microphone not supported in this browser' :
                 'Microphone permission not yet granted'}
              </span>
              {micState === 'prompt' && (
                <button onClick={requestMic} className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-2xs font-semibold transition-colors">
                  Enable
                </button>
              )}
            </div>

            <label className="label">SIP Extension</label>
            <input className="input w-full text-sm mb-3 bg-gray-50 cursor-not-allowed" value={extension} readOnly />

            {connectionType === 'remote' && (
              <>
                <label className="label">Agent Mobile (for call forwarding)</label>
                <input className="input w-full text-sm mb-4" placeholder="+91 9999999999" value={agentMobile} onChange={e => setAgentMobile(e.target.value)} />
              </>
            )}

            {connectionType === 'webrtc' && (
              <>
                <label className="label">SIP Server</label>
                <input className="input w-full text-sm mb-3 bg-gray-50 cursor-not-allowed" value={sipServerUrl} readOnly />
                {sipStatus === 'failed' && (
                  <p className="text-xs text-red-500 mb-3">Registration failed — contact your administrator.</p>
                )}
                {sipStatus === 'registered' && (
                  <p className="text-xs text-green-600 mb-3">✓ Registered — browser is ready to receive calls.</p>
                )}
              </>
            )}

            <div className="flex gap-2 justify-end">
              <button className="btn-secondary btn-sm" onClick={() => setShowExtModal(false)}>Cancel</button>
              {connectionType === 'remote' && (
                <button className="btn-primary btn-sm" onClick={saveExtension} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
