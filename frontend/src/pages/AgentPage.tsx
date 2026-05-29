import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { callsApi, ticketsApi } from '../services/api'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { Phone, Ticket, Clock, CheckCircle, Calendar, PhoneCall, X } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../utils/cn'

export default function AgentPage() {
  const user = useSelector((s: RootState) => s.auth.user)
  const [activeCall, setActiveCall] = useState<any>(null)
  const [callTimer, setCallTimer] = useState(0)

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    if (activeCall) {
      timer = setInterval(() => setCallTimer(t => t + 1), 1000)
    } else {
      setCallTimer(0)
    }
    return () => clearInterval(timer)
  }, [activeCall])

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
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }).length

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Agent Panel</h1>
          <p className="text-xs text-gray-500">Welcome back, {user?.full_name}</p>
        </div>
        <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium', activeCall ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}>
          <div className={cn('w-2 h-2 rounded-full', activeCall ? 'bg-red-500 animate-pulse' : 'bg-green-500')} />
          {activeCall ? `On Call — ${formatTime(callTimer)}` : 'Available'}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {activeCall && (
        <div className="card p-4 border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <PhoneCall className="w-5 h-5 text-red-600 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{activeCall.name || 'Unknown Caller'}</p>
                <p className="text-xs text-gray-500">{activeCall.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-mono font-bold text-red-600">{formatTime(callTimer)}</div>
              <button className="btn-danger btn-sm" onClick={() => setActiveCall(null)}>
                <X className="w-3.5 h-3.5" /> End Call
              </button>
            </div>
          </div>
        </div>
      )}

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
                <div key={t.id} className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-mono text-primary-600">{t.ticket_number}</span>
                    <span className={`badge-${t.priority}`}>{t.priority}</span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 truncate">{t.subject}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`badge-${t.status}`}>{t.status?.replace('_', ' ')}</span>
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

      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Simulate Incoming Call</h3>
        <div className="flex items-center gap-3">
          <input className="input w-48 text-sm" placeholder="+91 9999999999" id="sim-phone" />
          <button
            className="btn-primary"
            onClick={() => {
              const phone = (document.getElementById('sim-phone') as HTMLInputElement)?.value
              if (phone) setActiveCall({ phone, name: 'Customer' })
            }}
          >
            <PhoneCall className="w-4 h-4" /> Simulate Call
          </button>
        </div>
        <p className="text-2xs text-gray-400 mt-2">Use this to simulate a CRM popup for incoming calls (dev mode)</p>
      </div>
    </div>
  )
}
