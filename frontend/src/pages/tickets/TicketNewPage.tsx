import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ticketsApi, formsApi } from '../../services/api'
import toast from 'react-hot-toast'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function TicketNewPage() {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors } } = useForm()

  const { data: forms } = useQuery({ queryKey: ['forms'], queryFn: () => formsApi.list().then(r => r.data) })

  const mutation = useMutation({
    mutationFn: (data: any) => ticketsApi.create(data),
    onSuccess: (res) => {
      toast.success('Ticket created')
      navigate(`/tickets/${res.data.id}`)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create ticket'),
  })

  const onSubmit = (data: any) => {
    mutation.mutate(data)
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
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Subject *</label>
            <input {...register('subject', { required: 'Subject is required' })} className="input" placeholder="Brief description of the issue" />
            {errors.subject && <p className="text-2xs text-red-500 mt-1">{String(errors.subject.message)}</p>}
          </div>

          <div className="col-span-2">
            <label className="label">Description</label>
            <textarea {...register('description')} className="input min-h-20 resize-none" placeholder="Detailed description..." rows={4} />
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

          <div className="col-span-2 border-t border-gray-100 dark:border-gray-800 pt-3">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-3">Customer Information</p>
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
