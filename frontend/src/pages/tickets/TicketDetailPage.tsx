import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ticketsApi, formsApi } from '../../services/api'
import { useSelector } from 'react-redux'
import { RootState } from '../../redux/store'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Send, Lock, Clock, AlertTriangle, User, Phone, Mail,
  MessageSquare, Activity, FileText, ChevronDown, ChevronUp
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'

const STATUS_OPTIONS = ['open', 'in_progress', 'pending', 'resolved', 'closed']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical']

// Render a single form_data value nicely
function FormDataValue({ value }: { value: any }) {
  if (value === null || value === undefined || value === '') return <span className="text-gray-400">—</span>
  if (Array.isArray(value)) return <span>{value.join(', ')}</span>
  return <span>{String(value)}</span>
}

export default function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useSelector((s: RootState) => s.auth.user)
  const [comment, setComment] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [activeTab, setActiveTab] = useState<'comments' | 'logs' | 'form'>('comments')
  const [formDataExpanded, setFormDataExpanded] = useState(true)

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => ticketsApi.get(Number(id)).then(r => r.data),
  })

  // Load form definition to get field labels
  const { data: formFields } = useQuery({
    queryKey: ['form-fields-detail', ticket?.form_id],
    queryFn: () => formsApi.getFields(ticket!.form_id).then(r => r.data),
    enabled: !!ticket?.form_id,
  })

  const { data: comments } = useQuery({
    queryKey: ['ticket-comments', id],
    queryFn: () => ticketsApi.getComments(Number(id)).then(r => r.data),
    enabled: activeTab === 'comments',
  })

  const { data: logs } = useQuery({
    queryKey: ['ticket-logs', id],
    queryFn: () => ticketsApi.getLogs(Number(id)).then(r => r.data),
    enabled: activeTab === 'logs',
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => ticketsApi.update(Number(id), data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket', id] }); toast.success('Updated') },
    onError: () => toast.error('Update failed'),
  })

  const commentMutation = useMutation({
    mutationFn: () => ticketsApi.addComment(Number(id), { content: comment, is_internal: isInternal }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-comments', id] })
      setComment('')
      toast.success('Comment added')
    },
    onError: () => toast.error('Failed to add comment'),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!ticket) return <div className="text-center py-12 text-gray-500">Ticket not found</div>

  // Build a label map from form fields
  const labelMap: Record<string, string> = {}
  if (Array.isArray(formFields)) {
    formFields.forEach((f: any) => { labelMap[f.field_name] = f.label })
  }

  // Exclude fields already shown in the ticket header/customer section
  const HIDDEN_FORM_KEYS = new Set(['customer_name', 'customer_mobile', 'customer_email', 'subject'])
  const formDataEntries = ticket.form_data
    ? Object.entries(ticket.form_data).filter(([k]) => !HIDDEN_FORM_KEYS.has(k))
    : []

  const isOverdue = ticket.sla_due_at && new Date(ticket.sla_due_at) < new Date() && !['resolved', 'closed'].includes(ticket.status)

  return (
    <div className="max-w-5xl space-y-4">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-icon">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-primary-600 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded">
              {ticket.ticket_number}
            </span>
            <span className={`badge-${ticket.status}`}>{ticket.status?.replace('_', ' ')}</span>
            <span className={`badge-${ticket.priority}`}>{ticket.priority}</span>
            {isOverdue && (
              <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                <AlertTriangle className="w-3 h-3" /> SLA Breached
              </span>
            )}
          </div>
          <h1 className="text-base font-bold text-gray-900 dark:text-white mt-0.5 truncate">{ticket.subject}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Left: main content ───────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Description */}
          {ticket.description && (
            <div className="card p-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Description</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}

          {/* Form Data — the fields filled during call */}
          {formDataEntries.length > 0 && (
            <div className="card">
              <button
                className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800"
                onClick={() => setFormDataExpanded(v => !v)}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary-600" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Call Form Data</span>
                  <span className="badge bg-primary-100 text-primary-700">{formDataEntries.length} fields</span>
                </div>
                {formDataExpanded
                  ? <ChevronUp className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {formDataExpanded && (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {formDataEntries.map(([key, value]) => (
                    <div key={key}>
                      <p className="text-2xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
                        {labelMap[key] || key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm text-gray-800 dark:text-gray-200">
                        <FormDataValue value={value} />
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comments / Logs / (form tab if form_data exists but no formDataEntries) */}
          <div className="card">
            <div className="flex items-center border-b border-gray-100 dark:border-gray-800">
              {(['comments', 'logs'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-4 py-2.5 text-xs font-medium border-b-2 transition-colors capitalize flex items-center gap-1.5',
                    activeTab === tab
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                >
                  {tab === 'comments' ? <MessageSquare className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
              {activeTab === 'comments' && (
                <>
                  {(comments || []).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
                  )}
                  {(comments || []).map((c: any) => (
                    <div key={c.id} className={cn('flex gap-2.5', c.is_internal && 'opacity-80')}>
                      <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 text-xs font-bold flex-shrink-0">
                        {c.user_id === user?.id ? 'Me' : 'U'}
                      </div>
                      <div className={cn(
                        'flex-1 rounded-lg p-2.5',
                        c.is_internal
                          ? 'bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800'
                          : 'bg-gray-50 dark:bg-gray-800'
                      )}>
                        <div className="flex items-center gap-2 mb-1">
                          {c.is_internal && (
                            <span className="flex items-center gap-0.5 text-2xs text-yellow-700 font-medium">
                              <Lock className="w-2.5 h-2.5" /> Internal
                            </span>
                          )}
                          <span className="text-2xs text-gray-400">
                            {c.created_at ? format(new Date(c.created_at), 'MMM d, HH:mm') : ''}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {activeTab === 'logs' && (
                <>
                  {(logs || []).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">No activity logs</p>
                  )}
                  {(logs || []).map((log: any) => (
                    <div key={log.id} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-1.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                          {log.action?.replace(/_/g, ' ')}
                        </span>
                        {log.new_value && <span className="text-gray-500"> → {log.new_value}</span>}
                        <span className="text-gray-400 ml-2">
                          {log.created_at ? format(new Date(log.created_at), 'MMM d, HH:mm') : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {activeTab === 'comments' && (
              <div className="border-t border-gray-100 dark:border-gray-800 p-3 space-y-2">
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  className="input text-xs resize-none w-full"
                  placeholder="Add a comment..."
                  rows={3}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={e => setIsInternal(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Internal note
                    </span>
                  </label>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => commentMutation.mutate()}
                    disabled={!comment.trim() || commentMutation.isPending}
                  >
                    <Send className="w-3 h-3" />
                    {commentMutation.isPending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: sidebar ───────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Status + Priority controls */}
          <div className="card p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Ticket Details</p>

            <div>
              <label className="label">Status</label>
              <select
                className="input text-xs"
                value={ticket.status}
                onChange={e => updateMutation.mutate({ status: e.target.value })}
                disabled={updateMutation.isPending}
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Priority</label>
              <select
                className="input text-xs"
                value={ticket.priority}
                onChange={e => updateMutation.mutate({ priority: e.target.value })}
                disabled={updateMutation.isPending}
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 pt-1">
              {!['resolved', 'closed'].includes(ticket.status) && (
                <button
                  className="btn-sm flex-1 bg-green-600 text-white hover:bg-green-700"
                  onClick={() => updateMutation.mutate({ status: 'resolved' })}
                  disabled={updateMutation.isPending}
                >
                  Resolve
                </button>
              )}
              {ticket.status === 'closed' || ticket.status === 'resolved' ? (
                <button
                  className="btn-secondary btn-sm flex-1"
                  onClick={() => ticketsApi.reopen(ticket.id).then(() => {
                    qc.invalidateQueries({ queryKey: ['ticket', id] })
                    toast.success('Ticket reopened')
                  })}
                >
                  Reopen
                </button>
              ) : (
                <button
                  className="btn-danger btn-sm flex-1"
                  onClick={() => ticketsApi.close(ticket.id).then(() => {
                    qc.invalidateQueries({ queryKey: ['ticket', id] })
                    toast.success('Ticket closed')
                  })}
                >
                  Close
                </button>
              )}
            </div>

            {/* Timestamps */}
            <div className="text-xs space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-700 dark:text-gray-300">
                  {ticket.created_at ? format(new Date(ticket.created_at), 'MMM d, yyyy HH:mm') : '—'}
                </span>
              </div>
              {ticket.first_response_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">First Response</span>
                  <span className="text-blue-600">{format(new Date(ticket.first_response_at), 'MMM d, HH:mm')}</span>
                </div>
              )}
              {ticket.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Resolved</span>
                  <span className="text-green-600">{format(new Date(ticket.resolved_at), 'MMM d, HH:mm')}</span>
                </div>
              )}
              {ticket.sla_due_at && (
                <div className="flex justify-between">
                  <span className={cn('flex items-center gap-1', isOverdue ? 'text-red-500' : 'text-gray-500')}>
                    <Clock className="w-3 h-3" /> SLA Due
                  </span>
                  <span className={isOverdue ? 'text-red-600 font-semibold' : 'text-orange-600'}>
                    {format(new Date(ticket.sla_due_at), 'MMM d, HH:mm')}
                  </span>
                </div>
              )}
              {ticket.reopened_count > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Reopened</span>
                  <span className="text-orange-600">{ticket.reopened_count}×</span>
                </div>
              )}
            </div>
          </div>

          {/* Customer info */}
          {(ticket.customer_name || ticket.customer_email || ticket.customer_mobile) && (
            <div className="card p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Customer</p>
              {ticket.customer_name && (
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-700 dark:text-gray-300">{ticket.customer_name}</span>
                </div>
              )}
              {ticket.customer_mobile && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <a href={`tel:${ticket.customer_mobile}`} className="text-xs text-primary-600 hover:underline">
                    {ticket.customer_mobile}
                  </a>
                </div>
              )}
              {ticket.customer_email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <a href={`mailto:${ticket.customer_email}`} className="text-xs text-primary-600 hover:underline truncate">
                    {ticket.customer_email}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {ticket.tags && ticket.tags.length > 0 && (
            <div className="card p-3">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Tags</p>
              <div className="flex flex-wrap gap-1">
                {ticket.tags.map((tag: string) => (
                  <span key={tag} className="px-2 py-0.5 text-2xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
