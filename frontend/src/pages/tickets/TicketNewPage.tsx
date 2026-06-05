import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ticketsApi, formsApi } from '../../services/api'
import toast from 'react-hot-toast'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function TicketNewPage() {
  const navigate = useNavigate()
  const { register, handleSubmit, watch } = useForm()
  const [formData, setFormData] = useState<Record<string, any>>({})

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
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create ticket'),
  })

  const onSubmit = (data: any) => {
    mutation.mutate({
      ...data,
      form_id: data.form_id ? Number(data.form_id) : undefined,
      form_data: Object.keys(formData).length > 0 ? formData : undefined,
    })
  }

  const renderField = (field: any) => {
    const val = formData[field.field_name] || ''
    const update = (v: any) => setFormData(prev => ({ ...prev, [field.field_name]: v }))

    switch (field.field_type) {
      case 'textarea':
        return <textarea className="input resize-none" rows={3} value={val} onChange={e => update(e.target.value)} placeholder={field.placeholder} />
      case 'dropdown':
        return (
          <select className="input" value={val} onChange={e => update(e.target.value)}>
            <option value="">Select...</option>
            {(field.options || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
      case 'checkbox':
        return (
          <div className="space-y-1">
            {(field.options || []).map((o: any) => (
              <label key={o.value} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={(val || []).includes(o.value)} onChange={e => {
                  const arr = val || []
                  update(e.target.checked ? [...arr, o.value] : arr.filter((v: string) => v !== o.value))
                }} className="rounded" />
                {o.label}
              </label>
            ))}
          </div>
        )
      case 'radio':
        return (
          <div className="space-y-1">
            {(field.options || []).map((o: any) => (
              <label key={o.value} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" name={field.field_name} value={o.value} checked={val === o.value} onChange={() => update(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        )
      case 'date':
        return <input type="date" className="input" value={val} onChange={e => update(e.target.value)} />
      case 'number':
        return <input type="number" className="input" value={val} onChange={e => update(e.target.value)} placeholder={field.placeholder} />
      case 'email':
        return <input type="email" className="input" value={val} onChange={e => update(e.target.value)} placeholder={field.placeholder} />
      case 'mobile':
        return <input type="tel" className="input" value={val} onChange={e => update(e.target.value)} placeholder={field.placeholder} />
      default:
        return <input type="text" className="input" value={val} onChange={e => update(e.target.value)} placeholder={field.placeholder} />
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-icon">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">New Ticket</h1>
          <p className="text-xs text-gray-500">Create a new support ticket</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-5 space-y-4">

        {/* Basic fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Subject *</label>
            <input {...register('subject', { required: 'Subject is required' })} className="input" placeholder="Brief description of the issue" />
          </div>

          <div className="col-span-2">
            <label className="label">Description</label>
            <textarea {...register('description')} className="input min-h-20 resize-none" placeholder="Detailed description..." rows={3} />
          </div>

          <div>
            <label className="label">Priority</label>
            <select {...register('priority')} className="input">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="label">Form Template</label>
            <select {...register('form_id')} className="input">
              <option value="">No template</option>
              {(forms || []).map((f: any) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic form fields */}
        {formFields && formFields.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Form Fields — {forms?.find((f: any) => f.id === Number(selectedFormId))?.name}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {formFields.map((field: any) => (
                <div key={field.id} className={field.width === 'half' ? 'col-span-1' : 'col-span-2'}>
                  <label className="label">
                    {field.label}
                    {field.is_required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {renderField(field)}
                  {field.help_text && <p className="text-2xs text-gray-400 mt-1">{field.help_text}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Customer info */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Customer Information</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Name</label>
              <input {...register('customer_name')} className="input" placeholder="Customer name" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" {...register('customer_email')} className="input" placeholder="customer@email.com" />
            </div>
            <div>
              <label className="label">Mobile</label>
              <input {...register('customer_mobile')} className="input" placeholder="+91 9999999999" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}
