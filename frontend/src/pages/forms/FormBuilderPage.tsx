import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { formsApi } from '../../services/api'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, Trash2, GripVertical, Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'number', label: 'Number' },
  { value: 'file', label: 'File Upload' },
]

interface FieldDef {
  id: string
  label: string
  field_name: string
  field_type: string
  placeholder?: string
  is_required: boolean
  options?: string
  order: number
  width: string
}

function makeId() { return Math.random().toString(36).slice(2) }

export default function FormBuilderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: { name: '', slug: '', description: '', category: 'ticket', is_public: false },
  })

  const [fields, setFields] = useState<FieldDef[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const { data: existingForm } = useQuery({
    queryKey: ['form', id],
    queryFn: () => formsApi.get(Number(id)).then(r => r.data),
    enabled: !!id,
  })

  const { data: existingFields } = useQuery({
    queryKey: ['form-fields', id],
    queryFn: () => formsApi.getFields(Number(id)).then(r => r.data),
    enabled: !!id,
  })

  useEffect(() => {
    if (existingForm) {
      setValue('name', existingForm.name)
      setValue('slug', existingForm.slug)
      setValue('description', existingForm.description || '')
      setValue('category', existingForm.category)
    }
  }, [existingForm])

  useEffect(() => {
    if (existingFields) {
      setFields(existingFields.map((f: any) => ({
        id: makeId(),
        label: f.label,
        field_name: f.field_name,
        field_type: f.field_type,
        placeholder: f.placeholder || '',
        is_required: f.is_required,
        options: f.options ? f.options.map((o: any) => o.label || o).join('\n') : '',
        order: f.order,
        width: f.width || 'full',
      })))
    }
  }, [existingFields])

  const mutation = useMutation({
    mutationFn: async (formData: any) => {
      const payload = {
        ...formData,
        fields: fields.map((f, i) => ({
          label: f.label,
          field_name: f.field_name,
          field_type: f.field_type,
          placeholder: f.placeholder,
          is_required: f.is_required,
          order: i,
          width: f.width,
          options: f.options ? f.options.split('\n').filter(Boolean).map((o: string) => ({ label: o, value: o.toLowerCase().replace(/\s+/g, '_') })) : undefined,
        })),
      }
      if (id) return formsApi.update(Number(id), payload)
      return formsApi.create(payload)
    },
    onSuccess: () => {
      toast.success(id ? 'Form updated' : 'Form created')
      navigate('/forms')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed'),
  })

  const addField = () => {
    const f: FieldDef = { id: makeId(), label: 'New Field', field_name: `field_${makeId().slice(0,4)}`, field_type: 'text', is_required: false, order: fields.length, width: 'full' }
    setFields(prev => [...prev, f])
    setSelected(f.id)
  }

  const removeField = (fid: string) => { setFields(prev => prev.filter(f => f.id !== fid)); if (selected === fid) setSelected(null) }
  const updateField = (fid: string, key: string, val: any) => setFields(prev => prev.map(f => f.id === fid ? { ...f, [key]: val } : f))

  const sel = fields.find(f => f.id === selected)

  return (
    <div className="flex flex-col h-full max-h-screen -m-6">
      <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <button onClick={() => navigate('/forms')} className="btn-icon"><ArrowLeft className="w-4 h-4" /></button>
        <h1 className="text-sm font-bold text-gray-900 dark:text-white flex-1">{id ? 'Edit Form' : 'New Form'}</h1>
        <button onClick={handleSubmit(d => mutation.mutate(d))} className="btn-primary btn-sm" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (id ? 'Save Changes' : 'Create Form')}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-3 space-y-2 border-b border-gray-100 dark:border-gray-800">
            <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">Form Settings</p>
            <input {...register('name')} className="input text-xs" placeholder="Form name" />
            <input {...register('slug')} className="input text-xs" placeholder="form-slug" />
            <textarea {...register('description')} className="input text-xs resize-none" placeholder="Description" rows={2} />
            <select {...register('category')} className="input text-xs">
              <option value="ticket">Ticket</option>
              <option value="lead">Lead</option>
              <option value="service">Service Request</option>
            </select>
          </div>

          <div className="p-3 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">Fields ({fields.length})</p>
              <button className="btn-icon" onClick={addField} title="Add field"><Plus className="w-3.5 h-3.5" /></button>
            </div>
            <div className="space-y-1">
              {fields.map((f, i) => (
                <div
                  key={f.id}
                  className={cn('flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs group transition-colors',
                    selected === f.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                  )}
                  onClick={() => setSelected(f.id)}
                >
                  <GripVertical className="w-3 h-3 text-gray-300 flex-shrink-0" />
                  <span className="flex-1 truncate">{f.label}</span>
                  <span className="text-2xs text-gray-400">{f.field_type}</span>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600" onClick={e => { e.stopPropagation(); removeField(f.id) }}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {fields.length === 0 && (
                <button onClick={addField} className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-400 hover:border-primary-300 hover:text-primary-600 transition-colors">
                  + Add first field
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
          {sel ? (
            <div className="max-w-md space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Field Properties</h3>
              <div>
                <label className="label">Label</label>
                <input className="input text-xs" value={sel.label} onChange={e => updateField(sel.id, 'label', e.target.value)} />
              </div>
              <div>
                <label className="label">Field Name (API key)</label>
                <input className="input text-xs font-mono" value={sel.field_name} onChange={e => updateField(sel.id, 'field_name', e.target.value.replace(/\s/g, '_').toLowerCase())} />
              </div>
              <div>
                <label className="label">Field Type</label>
                <select className="input text-xs" value={sel.field_type} onChange={e => updateField(sel.id, 'field_type', e.target.value)}>
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Placeholder</label>
                <input className="input text-xs" value={sel.placeholder || ''} onChange={e => updateField(sel.id, 'placeholder', e.target.value)} />
              </div>
              {['dropdown', 'multi_select', 'radio', 'checkbox'].includes(sel.field_type) && (
                <div>
                  <label className="label">Options (one per line)</label>
                  <textarea className="input text-xs resize-none" rows={4} value={sel.options || ''} onChange={e => updateField(sel.id, 'options', e.target.value)} placeholder="Option 1&#10;Option 2&#10;Option 3" />
                </div>
              )}
              <div>
                <label className="label">Width</label>
                <select className="input text-xs" value={sel.width} onChange={e => updateField(sel.id, 'width', e.target.value)}>
                  <option value="full">Full Width</option>
                  <option value="half">Half Width</option>
                  <option value="third">One Third</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={sel.is_required} onChange={e => updateField(sel.id, 'is_required', e.target.checked)} className="rounded" />
                <span className="text-xs text-gray-700 dark:text-gray-300">Required field</span>
              </label>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <p className="text-sm">Select a field to edit its properties</p>
              <p className="text-xs mt-1">or add a new field from the sidebar</p>
            </div>
          )}
        </div>

        <div className="w-72 bg-white dark:bg-gray-900 border-l border-gray-100 dark:border-gray-800 p-4 overflow-y-auto flex-shrink-0">
          <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Preview</p>
          <div className="space-y-3">
            {fields.map(f => (
              <div key={f.id} className={cn('', f.width === 'half' && 'w-1/2')}>
                <label className="label">{f.label}{f.is_required && <span className="text-red-500 ml-0.5">*</span>}</label>
                {f.field_type === 'textarea' ? (
                  <textarea className="input text-xs resize-none" placeholder={f.placeholder} rows={2} disabled />
                ) : f.field_type === 'dropdown' ? (
                  <select className="input text-xs" disabled>
                    <option>{f.placeholder || 'Select...'}</option>
                  </select>
                ) : f.field_type === 'checkbox' ? (
                  <div className="space-y-1">
                    {(f.options || '').split('\n').filter(Boolean).map((o, i) => (
                      <label key={i} className="flex items-center gap-2 text-xs"><input type="checkbox" className="rounded" disabled />{o}</label>
                    ))}
                  </div>
                ) : f.field_type === 'radio' ? (
                  <div className="space-y-1">
                    {(f.options || '').split('\n').filter(Boolean).map((o, i) => (
                      <label key={i} className="flex items-center gap-2 text-xs"><input type="radio" disabled />{o}</label>
                    ))}
                  </div>
                ) : (
                  <input type={f.field_type === 'date' ? 'date' : 'text'} className="input text-xs" placeholder={f.placeholder} disabled />
                )}
              </div>
            ))}
            {fields.length === 0 && <p className="text-xs text-gray-400">Add fields to preview form</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
