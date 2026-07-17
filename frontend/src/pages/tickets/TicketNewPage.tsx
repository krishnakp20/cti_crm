import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ticketsApi, formsApi } from '../../services/api'
import toast from 'react-hot-toast'
import { ArrowLeft, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '../../utils/cn'

const PRIORITIES = [
  { value: 'low',      label: 'Low',      cls: 'bg-slate-100 text-slate-600 border-slate-300' },
  { value: 'medium',   label: 'Medium',   cls: 'bg-blue-50 text-blue-600 border-blue-300' },
  { value: 'high',     label: 'High',     cls: 'bg-orange-50 text-orange-600 border-orange-300' },
  { value: 'critical', label: 'Critical', cls: 'bg-red-50 text-red-600 border-red-300' },
]

const inputCls = 'w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:bg-white dark:focus:bg-gray-900 transition-all placeholder:text-gray-400'

export default function TicketNewPage() {
  const navigate = useNavigate()
  const { register, handleSubmit, watch, setValue } = useForm({ defaultValues: { priority: 'medium' } })
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [priority, setPriority] = useState('medium')

  const selectedFormId = watch('form_id')

  const { data: forms } = useQuery({
    queryKey: ['forms'],
    queryFn: () => formsApi.list().then(r => r.data),
  })

  const { data: formFields } = useQuery({
    queryKey: ['form-fields', selectedFormId],
    queryFn: () => formsApi.getFields(Number(selectedFormId)).then(r => r.data),
    enabled: !!selectedFormId && selectedFormId !== '',
  })

  const mutation = useMutation({
    mutationFn: (data: any) => ticketsApi.create(data),
    onSuccess: (res) => {
      toast.success('Ticket created')
      navigate(`/tickets/${res.data.id}`)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  })

  const onSubmit = (data: any) => {
    mutation.mutate({
      ...data,
      priority,
      form_id: data.form_id ? Number(data.form_id) : undefined,
      form_data: Object.keys(formData).length > 0 ? formData : undefined,
    })
  }

  const update = (name: string, v: any) => setFormData(prev => ({ ...prev, [name]: v }))

  const renderField = (field: any) => {
    const val = formData[field.field_name] || ''
    switch (field.field_type) {
      case 'textarea':
        return <textarea className={inputCls + ' resize-none'} rows={2} value={val} onChange={e => update(field.field_name, e.target.value)} placeholder={field.placeholder || field.label} />
      case 'dropdown':
        return (
          <div className="relative">
            <select className={inputCls + ' appearance-none pr-7'} value={val} onChange={e => update(field.field_name, e.target.value)}>
              <option value="">Select...</option>
              {(field.options || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        )
      case 'radio':
        return (
          <div className="flex flex-wrap gap-1.5">
            {(field.options || []).map((o: any) => (
              <button type="button" key={o.value} onClick={() => update(field.field_name, o.value)}
                className={cn('px-2.5 py-1 text-xs rounded-full border font-medium transition-all',
                  val === o.value ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300')}>
                {o.label}
              </button>
            ))}
          </div>
        )
      case 'checkbox':
        return (
          <div className="flex flex-wrap gap-3">
            {(field.options || []).map((o: any) => (
              <label key={o.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={(val || []).includes(o.value)}
                  onChange={e => { const a = val||[]; update(field.field_name, e.target.checked ? [...a, o.value] : a.filter((v: string) => v !== o.value)) }}
                  className="rounded border-gray-300 text-primary-600" />
                {o.label}
              </label>
            ))}
          </div>
        )
      case 'date':   return <input type="date" className={inputCls} value={val} onChange={e => update(field.field_name, e.target.value)} />
      case 'number': return <input type="number" className={inputCls} value={val} onChange={e => update(field.field_name, e.target.value)} placeholder={field.placeholder} />
      case 'email':  return <input type="email" className={inputCls} value={val} onChange={e => update(field.field_name, e.target.value)} placeholder={field.placeholder || 'email@example.com'} />
      case 'mobile': return <input type="tel" className={inputCls} value={val} onChange={e => update(field.field_name, e.target.value)} placeholder={field.placeholder || '+91 9999999999'} />
      default:       return <input type="text" className={inputCls} value={val} onChange={e => update(field.field_name, e.target.value)} placeholder={field.placeholder || field.label} />
    }
  }

  const formsList = Array.isArray(forms) ? forms : (forms as any)?.items || []

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate(-1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">New Ticket</h1>
            <p className="text-xs text-gray-400">Fill in the details to create a support ticket</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
            Cancel
          </button>
          <button form="ticket-form" type="submit" disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-60">
            {mutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating...</> : '+ Create Ticket'}
          </button>
        </div>
      </div>

      {/* ── Form body ── */}
      <form id="ticket-form" onSubmit={handleSubmit(onSubmit)} className="flex gap-4 flex-1 min-h-0">

        {/* LEFT — main content */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">

          {/* Subject */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm px-4 py-3 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Subject <span className="text-red-500 normal-case">*</span>
            </label>
            <input
              {...register('subject', { required: true })}
              className="w-full text-sm font-medium bg-transparent border-0 outline-none text-gray-900 dark:text-white placeholder:text-gray-300 placeholder:font-normal"
              placeholder="What's the issue? Give it a clear title..."
            />
          </div>

          {/* Description */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm px-4 py-3 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full text-sm bg-transparent border-0 outline-none text-gray-700 dark:text-gray-300 resize-none placeholder:text-gray-300"
              placeholder="Describe the issue — steps to reproduce, what was expected vs what happened..."
            />
          </div>

          {/* Form fields */}
          {formFields && formFields.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-primary-100 dark:border-primary-900/30 shadow-sm px-4 py-3 flex-1 overflow-y-auto min-h-0">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {formsList.find((f: any) => f.id === Number(selectedFormId))?.name}
                </p>
                <span className="text-2xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full font-medium">
                  {formFields.length} fields
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {formFields.map((field: any) => (
                  <div key={field.id} className={field.field_type === 'textarea' ? 'col-span-2' : 'col-span-1'}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {field.label}{field.is_required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {renderField(field)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — sidebar */}
        <div className="w-56 flex flex-col gap-3 flex-shrink-0">

          {/* Priority */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Priority</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PRIORITIES.map(p => (
                <button type="button" key={p.value}
                  onClick={() => { setPriority(p.value); setValue('priority', p.value) }}
                  className={cn(
                    'py-1.5 rounded-lg border text-xs font-semibold transition-all',
                    priority === p.value ? p.cls + ' ring-2 ring-inset ring-current/30' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                  )}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Customer */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer</p>
            <div className="space-y-2">
              <input {...register('customer_name')} placeholder="Full name" className={inputCls} />
              <input {...register('customer_mobile')} placeholder="Mobile number" className={inputCls} />
              <input type="email" {...register('customer_email')} placeholder="Email address" className={inputCls} />
            </div>
          </div>

          {/* Form template */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Form Template</p>
            <div className="relative">
              <select {...register('form_id')} className={inputCls + ' appearance-none pr-7'}>
                <option value="">No template</option>
                {formsList.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
