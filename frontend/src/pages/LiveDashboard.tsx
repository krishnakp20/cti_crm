import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { cdrApi } from '../services/api'
import { Phone, PhoneCall, PhoneOff, Clock, Users, Headphones, AlertCircle, Loader2, Radio } from 'lucide-react'
import { cn } from '../utils/cn'

interface ActiveCall {
  uniqueid: string
  caller: string
  agent: string
  queue: string
  department?: string
  duration: number
  ringing?: boolean
}

interface QueueCaller {
  uniqueid: string
  caller: string
  queue: string
  wait: number
  position: string
}

interface LiveState {
  active_calls: ActiveCall[]
  queue_count: number
  queue_callers?: QueueCaller[]
}

const DEPT_COLORS: Record<string, string> = {
  'General Enquiries': 'bg-blue-100 text-blue-700',
  'Sales & Marketing': 'bg-green-100 text-green-700',
  'Customer Service': 'bg-purple-100 text-purple-700',
  'Accounts & Finance': 'bg-orange-100 text-orange-700',
  'HR': 'bg-pink-100 text-pink-700',
  'Logistics': 'bg-yellow-100 text-yellow-700',
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = String(s % 60).padStart(2, '0')
  return `${m}:${sec}`
}

export default function LiveDashboard() {
  const token = useSelector((s: RootState) => s.auth.accessToken)
  const [live, setLive] = useState<LiveState>({ active_calls: [], queue_count: 0 })
  const [connected, setConnected] = useState(false)
  const [tick, setTick] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const durationsRef = useRef<Record<string, number>>({})

  // Tick every second to update call durations
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // WebSocket connection
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.host
    const ws = new WebSocket(`${proto}://${host}/api/v1/realtime/ws/live?token=${token}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'ping') return

        if (msg.type === 'init' || msg.type === 'state') {
          setLive({ active_calls: msg.active_calls || [], queue_count: msg.queue_count || 0 })
          // seed durations
          ;(msg.active_calls || []).forEach((c: ActiveCall) => {
            if (durationsRef.current[c.uniqueid] === undefined) durationsRef.current[c.uniqueid] = c.duration
          })
        }

        if (msg.type === 'agent_called') {
          durationsRef.current[msg.uniqueid] = 0
          setLive(prev => ({
            ...prev,
            queue_count: Math.max(0, prev.queue_count - 1),
            active_calls: [
              ...prev.active_calls.filter(c => c.uniqueid !== msg.uniqueid),
              { uniqueid: msg.uniqueid, caller: msg.caller, agent: msg.agent, queue: msg.department || '', department: msg.department, duration: 0, ringing: true },
            ],
          }))
        }

        if (msg.type === 'agent_connect') {
          durationsRef.current[msg.uniqueid] = 0
          setLive(prev => ({
            ...prev,
            queue_count: Math.max(0, prev.queue_count - 1),
            active_calls: [
              ...prev.active_calls.filter(c => c.uniqueid !== msg.uniqueid),
              { uniqueid: msg.uniqueid, caller: msg.caller, agent: msg.agent, queue: msg.department || msg.queue || '', department: msg.department, duration: 0, ringing: false },
            ],
          }))
        }

        if (msg.type === 'agent_complete' || msg.type === 'call_abandoned') {
          delete durationsRef.current[msg.uniqueid]
          setLive(prev => ({
            ...prev,
            active_calls: prev.active_calls.filter(c => c.uniqueid !== msg.uniqueid),
          }))
        }

        if (msg.type === 'queue_join') {
          setLive(prev => ({ ...prev, queue_count: prev.queue_count + 1 }))
        }

        if (msg.type === 'queue_leave') {
          setLive(prev => ({ ...prev, queue_count: Math.max(0, prev.queue_count - 1) }))
        }
      } catch { /* ignore parse errors */ }
    }

    return () => ws.close()
  }, [token])

  // Fallback: poll HTTP if WS not supported
  useEffect(() => {
    if (connected) return
    const t = setInterval(() => {
      cdrApi.liveState().then(r => setLive(r.data)).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [connected])

  // Increment durations every second
  const activeCalls = live.active_calls.map(c => ({
    ...c,
    duration: (durationsRef.current[c.uniqueid] ?? c.duration) + tick * 0,
  }))
  // Use tick to force re-render; compute duration from stored start
  const callsWithDuration = live.active_calls.map(c => {
    if (durationsRef.current[c.uniqueid] !== undefined) {
      durationsRef.current[c.uniqueid]++
    }
    return { ...c, duration: durationsRef.current[c.uniqueid] ?? c.duration }
  })

  const totalOnCall = live.active_calls.length
  const totalWaiting = live.queue_count
  const longestDuration = Math.max(0, ...live.active_calls.map(c => durationsRef.current[c.uniqueid] ?? c.duration))

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Live Dashboard</h1>
          <p className="text-xs text-gray-500">Real-time call centre activity</p>
        </div>
        <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
          connected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>
          <Radio className="w-3 h-3" />
          {connected ? 'Live' : 'Polling'}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<PhoneCall className="w-4 h-4 text-green-600" />} bg="bg-green-50"
          value={totalOnCall} label="On Call" />
        <StatCard icon={<Clock className="w-4 h-4 text-amber-600" />} bg="bg-amber-50"
          value={totalWaiting} label="Waiting in Queue" urgent={totalWaiting > 2} />
        <StatCard icon={<Headphones className="w-4 h-4 text-blue-600" />} bg="bg-blue-50"
          value={fmt(longestDuration)} label="Longest Call" />
        <StatCard icon={<Users className="w-4 h-4 text-purple-600" />} bg="bg-purple-50"
          value={totalOnCall + totalWaiting} label="Total Active" />
      </div>

      {/* Queue warning */}
      {totalWaiting > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span><strong>{totalWaiting}</strong> caller{totalWaiting > 1 ? 's' : ''} waiting in queue — agents may be busy</span>
        </div>
      )}

      {/* Active calls */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-green-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Active Calls</h2>
          <span className="ml-auto text-xs text-gray-400">{callsWithDuration.length} connected</span>
        </div>

        {callsWithDuration.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <PhoneOff className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No active calls right now</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {callsWithDuration.map(call => {
              const dept = call.department || call.queue || ''
              const isRinging = call.ringing
              return (
                <div key={call.uniqueid} className="flex items-center gap-4 px-4 py-3">
                  {/* Animated pulse — amber if ringing, green if connected */}
                  <div className="relative flex-shrink-0">
                    <div className={cn('w-2.5 h-2.5 rounded-full', isRinging ? 'bg-amber-400' : 'bg-green-500')} />
                    <div className={cn('absolute inset-0 rounded-full animate-ping opacity-75', isRinging ? 'bg-amber-300' : 'bg-green-400')} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{call.caller || 'Unknown'}</p>
                      {dept && (
                        <span className={cn('px-2 py-0.5 rounded-full text-2xs font-medium',
                          DEPT_COLORS[dept] || 'bg-gray-100 text-gray-600')}>
                          {dept}
                        </span>
                      )}
                      {isRinging && (
                        <span className="px-2 py-0.5 rounded-full text-2xs font-medium bg-amber-100 text-amber-700">
                          Ringing…
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Agent: {call.agent || '—'}</p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className={cn('text-sm font-mono font-semibold', isRinging ? 'text-amber-500' : 'text-green-600')}>{fmt(call.duration)}</p>
                    <p className="text-2xs text-gray-400">{isRinging ? 'ringing' : 'duration'}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Queue callers */}
      {totalWaiting > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Waiting in Queue</h2>
            <span className="ml-auto text-xs text-amber-500 font-semibold">{totalWaiting} waiting</span>
          </div>
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            {totalWaiting} caller{totalWaiting > 1 ? 's' : ''} in queue — live caller details update via AMI events
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, bg, value, label, urgent }: { icon: React.ReactNode; bg: string; value: any; label: string; urgent?: boolean }) {
  return (
    <div className={cn('card p-3 flex items-center gap-3', urgent && 'ring-2 ring-amber-400')}>
      <div className={cn('p-2 rounded-lg', bg)}>{icon}</div>
      <div>
        <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-2xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}

function _queueToDept(queue: string): string {
  const m: Record<string, string> = {
    'q-reception': 'General Enquiries',
    'q-sales': 'Sales & Marketing',
    'q-support': 'Customer Service',
    'q-accounts': 'Accounts & Finance',
    'q-hr': 'HR',
    'q-logistics': 'Logistics',
  }
  return m[queue] || queue
}
