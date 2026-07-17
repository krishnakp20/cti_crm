import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ticketsApi } from '../../services/api'
import api from '../../services/api'
import { Download, Filter, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

const STATUSES = ['', 'open', 'in_progress', 'pending', 'resolved', 'closed']
const PRIORITIES = ['', 'low', 'medium', 'high', 'critical']

const STATUS_COLORS: any = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-purple-100 text-purple-700',
  pending: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
}
const PRIORITY_COLORS: any = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

export default function TicketReportPage() {
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ticket-report', status, priority, fromDate, toDate],
    queryFn: () => ticketsApi.list({
      status: status || undefined,
      priority: priority || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      limit: 200,
    }).then(r => r.data),
  })

  const tickets = data?.items || []

  // Collect all unique form_data keys from loaded tickets
  const formKeys = (() => {
    const seen = new Set<string>()
    const keys: string[] = []
    for (const t of tickets) {
      if (t.form_data && typeof t.form_data === 'object') {
        for (const k of Object.keys(t.form_data)) {
          if (!seen.has(k)) { seen.add(k); keys.push(k) }
        }
      }
    }
    return keys
  })()

  const downloadCSV = async () => {
    setDownloading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (priority) params.set('priority', priority)
      if (fromDate) params.set('from_date', fromDate)
      if (toDate) params.set('to_date', toDate)

      const res = await api.get(`/tickets/export?${params.toString()}`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `tickets_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV downloaded')
    } catch {
      toast.error('Export failed')
    } finally {
      setDownloading(false)
    }
  }

  const formatVal = (v: any) => {
    if (v == null || v === '') return '—'
    if (Array.isArray(v)) return v.join(', ')
    return String(v)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Ticket Report</h1>
            <p className="text-xs text-gray-400">
              {isLoading ? 'Loading...' : `${data?.total ?? tickets.length} tickets`}
              {(status || priority || fromDate || toDate) && ' (filtered)'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button onClick={downloadCSV} disabled={downloading || tickets.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50">
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-500 mr-1">Filters:</span>

          <select value={status} onChange={e => setStatus(e.target.value)}
            className="px-2.5 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary-400 dark:bg-gray-800 dark:border-gray-700">
            <option value="">All Status</option>
            {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>

          <select value={priority} onChange={e => setPriority(e.target.value)}
            className="px-2.5 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary-400 dark:bg-gray-800 dark:border-gray-700">
            <option value="">All Priority</option>
            {PRIORITIES.filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">From</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-2.5 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary-400 dark:bg-gray-800 dark:border-gray-700" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">To</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-2.5 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary-400 dark:bg-gray-800 dark:border-gray-700" />
          </div>

          {(status || priority || fromDate || toDate) && (
            <button onClick={() => { setStatus(''); setPriority(''); setFromDate(''); setToDate('') }}
              className="px-2.5 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-all">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm flex-1 overflow-hidden flex flex-col min-h-0">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <FileSpreadsheet className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">No tickets found</p>
            <p className="text-xs mt-1">Try adjusting the filters</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                  <th className="th text-left px-3 py-2 whitespace-nowrap">#</th>
                  <th className="th text-left px-3 py-2 whitespace-nowrap">Ticket No</th>
                  <th className="th text-left px-3 py-2 whitespace-nowrap min-w-40">Subject</th>
                  <th className="th text-left px-3 py-2 whitespace-nowrap">Status</th>
                  <th className="th text-left px-3 py-2 whitespace-nowrap">Priority</th>
                  <th className="th text-left px-3 py-2 whitespace-nowrap">Customer</th>
                  <th className="th text-left px-3 py-2 whitespace-nowrap">Mobile</th>
                  <th className="th text-left px-3 py-2 whitespace-nowrap">Email</th>
                  {formKeys.map(k => (
                    <th key={k} className="th text-left px-3 py-2 whitespace-nowrap capitalize">
                      {k.replace(/_/g, ' ')}
                    </th>
                  ))}
                  <th className="th text-left px-3 py-2 whitespace-nowrap">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {tickets.map((t: any, i: number) => (
                  <tr key={t.id} className={cn('hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors', i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/20')}>
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-primary-600">{t.ticket_number}</td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200 max-w-48 truncate" title={t.subject}>{t.subject}</td>
                    <td className="px-3 py-2">
                      <span className={cn('px-2 py-0.5 rounded-full text-2xs font-semibold capitalize', STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600')}>
                        {(t.status || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('px-2 py-0.5 rounded-full text-2xs font-semibold capitalize', PRIORITY_COLORS[t.priority] || '')}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{t.customer_name || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{t.customer_mobile || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{t.customer_email || '—'}</td>
                    {formKeys.map(k => (
                      <td key={k} className="px-3 py-2 text-gray-600 max-w-32 truncate" title={formatVal(t.form_data?.[k])}>
                        {formatVal(t.form_data?.[k])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                      {t.created_at ? format(new Date(t.created_at), 'dd MMM yy HH:mm') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {tickets.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-gray-400">
              Showing <span className="font-semibold text-gray-600">{tickets.length}</span> of <span className="font-semibold text-gray-600">{data?.total ?? tickets.length}</span> tickets
            </span>
            {formKeys.length > 0 && (
              <span className="text-xs text-gray-400">
                Form fields: <span className="font-semibold text-primary-600">{formKeys.join(', ')}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
