import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ticketsApi } from '../../services/api'
import { Plus, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../utils/cn'
import { format } from 'date-fns'

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Pending', value: 'pending' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
]

const PRIORITY_COLORS: any = {
  low: 'text-gray-500',
  medium: 'text-blue-600',
  high: 'text-orange-600',
  critical: 'text-red-600 font-semibold',
}

export default function TicketsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const status = params.get('status') || ''
  const search = params.get('search') || ''
  const [searchInput, setSearchInput] = useState(search)

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', page, status, search],
    queryFn: () => ticketsApi.list({ page, limit: 20, status: status || undefined, search: search || undefined }).then(r => r.data),
  })

  const tickets = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-3 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Tickets</h1>
          <p className="text-xs text-gray-500">{total} total tickets</p>
        </div>
        <Link to="/tickets/new" className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> New Ticket
        </Link>
      </div>

      <div className="card">
        <div className="border-b border-gray-100 dark:border-gray-800 px-3">
          <div className="flex items-center gap-0 overflow-x-auto">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => { setParams(tab.value ? { status: tab.value } : {}); setPage(1) }}
                className={cn(
                  'px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors',
                  status === tab.value
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              className="input pl-8 h-8 text-xs"
              placeholder="Search tickets..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setParams(searchInput ? { search: searchInput } : {})
                  setPage(1)
                }
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="th">Ticket #</th>
                <th className="th">Subject</th>
                <th className="th">Customer</th>
                <th className="th">Priority</th>
                <th className="th">Status</th>
                <th className="th">Assigned</th>
                <th className="th">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={7} className="td text-center py-8 text-gray-400">Loading...</td></tr>
              ) : tickets.length === 0 ? (
                <tr><td colSpan={7} className="td text-center py-12 text-gray-400">No tickets found</td></tr>
              ) : (
                tickets.map((ticket: any) => (
                  <tr
                    key={ticket.id}
                    className="table-row-hover"
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                  >
                    <td className="td font-mono text-xs text-primary-600">{ticket.ticket_number}</td>
                    <td className="td max-w-xs">
                      <p className="font-medium text-gray-900 dark:text-white text-xs line-clamp-1">{ticket.subject}</p>
                    </td>
                    <td className="td">
                      <p className="text-xs">{ticket.customer_name || '—'}</p>
                      <p className="text-2xs text-gray-400">{ticket.customer_mobile || ''}</p>
                    </td>
                    <td className="td">
                      <span className={cn('text-xs capitalize', PRIORITY_COLORS[ticket.priority])}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="td">
                      <span className={`badge-${ticket.status}`}>{ticket.status?.replace('_', ' ')}</span>
                    </td>
                    <td className="td text-xs text-gray-500">{ticket.assigned_to || '—'}</td>
                    <td className="td text-xs text-gray-400">
                      {ticket.created_at ? format(new Date(ticket.created_at), 'MMM d, HH:mm') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex items-center gap-1">
              <button className="btn-icon" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="btn-icon" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
