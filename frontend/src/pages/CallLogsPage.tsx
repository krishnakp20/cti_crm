import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { cdrApi } from '../services/api'
import { useAdminClient } from '../hooks/useAdminClient'
import { Phone, PhoneCall, PhoneOff, Clock, Play, Square, ChevronDown, ChevronUp, Loader2, Search, Download } from 'lucide-react'
import { cn } from '../utils/cn'

function useAuthDownload() {
  const token = useSelector((s: RootState) => s.auth.accessToken)
  return async (url: string, filename: string) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
}

function useAuthAudio(id: number | null, token: string | null) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!id || !token) { setSrc(null); return }
    fetch(cdrApi.recordingUrl(id), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => setSrc(URL.createObjectURL(blob)))
      .catch(() => setSrc(null))
    return () => { if (src) URL.revokeObjectURL(src) }
  }, [id, token])
  return src
}

const STATUS_BADGE: Record<string, string> = {
  completed:  'bg-green-100 text-green-700',
  answered:   'bg-green-100 text-green-700',
  abandoned:  'bg-red-100 text-red-700',
  no_answer:  'bg-yellow-100 text-yellow-700',
  queued:     'bg-blue-100 text-blue-700',
  initiated:  'bg-gray-100 text-gray-600',
  voicemail:  'bg-purple-100 text-purple-700',
}

const DEPT_COLORS: Record<string, string> = {
  'General Enquiries':  'bg-blue-100 text-blue-700',
  'Sales & Marketing':  'bg-green-100 text-green-700',
  'Customer Service':   'bg-purple-100 text-purple-700',
  'Accounts & Finance': 'bg-orange-100 text-orange-700',
  'HR':                 'bg-pink-100 text-pink-700',
  'Logistics':          'bg-yellow-100 text-yellow-700',
}

function fmt(s: number | null) {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = String(s % 60).padStart(2, '0')
  return `${m}:${sec}`
}

function fmtTime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
}

export default function CallLogsPage() {
  const { adminClientId, clientFilter } = useAdminClient()
  const token = useSelector((s: RootState) => s.auth.accessToken)
  const authDownload = useAuthDownload()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('')
  const [callStatus, setCallStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const audioSrc = useAuthAudio(playing, token)

  const params = {
    page,
    limit: 50,
    ...(search && { search }),
    ...(department && { department }),
    ...(callStatus && { call_status: callStatus }),
    ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }),
    ...clientFilter,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['cdr', params],
    queryFn: () => cdrApi.list(params).then(r => r.data),
  })

  const { data: stats } = useQuery({
    queryKey: ['cdr-stats', adminClientId, dateFrom, dateTo],
    queryFn: () => cdrApi.stats({ ...clientFilter, ...(dateFrom && { date_from: dateFrom }), ...(dateTo && { date_to: dateTo }) }).then(r => r.data),
  })

  const records = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / 50)

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Call Logs</h1>
          <p className="text-xs text-gray-500">IVR call detail records with recordings and dispositions</p>
        </div>
        <button
          className="btn btn-secondary flex items-center gap-1.5 text-sm"
          onClick={() => authDownload(
            cdrApi.exportUrl({
              ...(search && { search }),
              ...(department && { department }),
              ...(callStatus && { call_status: callStatus }),
              ...(dateFrom && { date_from: dateFrom }),
              ...(dateTo && { date_to: dateTo }),
              ...clientFilter,
            }),
            `call_logs_${new Date().toISOString().slice(0,10)}.csv`
          )}
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Calls" value={stats.total} icon={<Phone className="w-4 h-4 text-blue-600" />} bg="bg-blue-50" />
          <StatCard label="Answered" value={stats.answered} icon={<PhoneCall className="w-4 h-4 text-green-600" />} bg="bg-green-50" />
          <StatCard label="Abandoned" value={stats.abandoned} icon={<PhoneOff className="w-4 h-4 text-red-500" />} bg="bg-red-50" />
          <StatCard label="Avg Wait" value={fmt(stats.avg_queue_seconds)} icon={<Clock className="w-4 h-4 text-amber-500" />} bg="bg-amber-50" />
          <StatCard label="Avg Talk" value={fmt(stats.avg_talk_seconds)} icon={<PhoneCall className="w-4 h-4 text-purple-600" />} bg="bg-purple-50" />
        </div>
      )}

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input className="input pl-8 text-sm w-full" placeholder="Search caller, agent..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input text-sm w-auto" value={department} onChange={e => { setDepartment(e.target.value); setPage(1) }}>
          <option value="">All Departments</option>
          <option>General Enquiries</option>
          <option>Sales & Marketing</option>
          <option>Customer Service</option>
          <option>Accounts & Finance</option>
          <option>HR</option>
          <option>Logistics</option>
        </select>
        <select className="input text-sm w-auto" value={callStatus} onChange={e => { setCallStatus(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          <option value="completed">Completed</option>
          <option value="abandoned">Abandoned</option>
          <option value="no_answer">No Answer</option>
        </select>
        <input type="date" className="input text-sm w-auto" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
        <span className="text-xs text-gray-400">to</span>
        <input type="date" className="input text-sm w-auto" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1.2fr_1fr_1fr_0.7fr_0.7fr_0.8fr_auto] gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 text-2xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
          <span>Caller</span>
          <span>Department</span>
          <span>Agent</span>
          <span>Time</span>
          <span>Wait</span>
          <span>Duration</span>
          <span>Status</span>
          <span>Rec</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Phone className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No call records found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {records.map((r: any) => (
              <div key={r.id}>
                {/* Row */}
                <div
                  className="grid grid-cols-[1fr_1.2fr_1fr_1fr_0.7fr_0.7fr_0.8fr_auto] gap-2 px-4 py-2.5 items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.caller_number}</span>
                  <span>
                    {r.department ? (
                      <span className={cn('px-2 py-0.5 rounded-full text-2xs font-medium', DEPT_COLORS[r.department] || 'bg-gray-100 text-gray-600')}>
                        {r.department}
                      </span>
                    ) : '—'}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{r.agent_name || '—'}</span>
                  <span className="text-xs text-gray-500">{fmtTime(r.call_start_time || r.created_at)}</span>
                  <span className="text-xs font-mono text-amber-600">{fmt(r.queue_duration)}</span>
                  <span className="text-xs font-mono text-green-600">{fmt(r.call_duration)}</span>
                  <span>
                    <span className={cn('px-2 py-0.5 rounded-full text-2xs font-semibold', STATUS_BADGE[r.call_status] || 'bg-gray-100 text-gray-500')}>
                      {r.call_status}
                    </span>
                  </span>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {r.has_recording && (
                      <button
                        onClick={() => setPlaying(playing === r.id ? null : r.id)}
                        className="p-1 rounded hover:bg-primary-50 text-primary-600 transition-colors"
                        title="Play recording"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400"
                    >
                      {expanded === r.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Audio player */}
                {playing === r.id && r.has_recording && (
                  <div className="px-4 py-2 bg-primary-50 dark:bg-primary-900/10 border-t border-primary-100">
                    {audioSrc
                      ? <audio controls autoPlay className="w-full h-8" src={audioSrc} />
                      : <p className="text-xs text-gray-400 py-1">Loading recording…</p>
                    }
                  </div>
                )}

                {/* Expanded detail */}
                {expanded === r.id && (
                  <div className="px-4 py-4 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <DetailItem label="Asterisk ID" value={r.asterisk_unique_id} />
                    <DetailItem label="Queue" value={r.queue_name} />
                    <DetailItem label="IVR Key Pressed" value={r.ivr_selection} />
                    <DetailItem label="Extension" value={r.agent_extension} />
                    <DetailItem label="Queue Start" value={fmtTime(r.queue_start_time)} />
                    <DetailItem label="Call Start" value={fmtTime(r.call_start_time)} />
                    <DetailItem label="Call End" value={fmtTime(r.call_end_time)} />
                    <DetailItem label="Ticket" value={r.ticket_id ? `#${r.ticket_id}` : '—'} />
                    {r.disposition && <DetailItem label="Disposition" value={r.disposition} />}
                    {r.call_summary && (
                      <div className="col-span-2 md:col-span-4">
                        <p className="text-gray-400 mb-1">Summary</p>
                        <p className="text-gray-700 dark:text-gray-300">{r.call_summary}</p>
                      </div>
                    )}
                    {r.tags?.length > 0 && (
                      <div className="col-span-2 md:col-span-4 flex flex-wrap gap-1">
                        {r.tags.map((t: string) => (
                          <span key={t} className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-2xs">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{total} total records</span>
          <div className="flex gap-1">
            <button className="px-3 py-1 rounded border disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span className="px-3 py-1">{page} / {totalPages}</span>
            <button className="px-3 py-1 rounded border disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, bg }: { label: string; value: any; icon: React.ReactNode; bg: string }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className={cn('p-2 rounded-lg', bg)}>{icon}</div>
      <div>
        <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-2xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-gray-400 mb-0.5">{label}</p>
      <p className="text-gray-700 dark:text-gray-300 font-medium">{value || '—'}</p>
    </div>
  )
}
