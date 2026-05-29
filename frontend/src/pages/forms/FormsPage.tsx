import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { formsApi } from '../../services/api'
import { Plus, Edit2, Trash2, FileText, Eye } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

const CATEGORY_COLORS: any = {
  ticket: 'bg-blue-100 text-blue-700',
  lead: 'bg-green-100 text-green-700',
  service: 'bg-purple-100 text-purple-700',
}

export default function FormsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: forms, isLoading } = useQuery({ queryKey: ['forms'], queryFn: () => formsApi.list().then(r => r.data) })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => formsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['forms'] }); toast.success('Form deleted') },
  })

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Form Builder</h1>
          <p className="text-xs text-gray-500">Create dynamic forms for tickets and leads</p>
        </div>
        <Link to="/forms/new" className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> New Form
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (forms || []).length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No forms yet. Create your first form.</p>
          <Link to="/forms/new" className="btn-primary mt-4 inline-flex">Create Form</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(forms || []).map((form: any) => (
            <div key={form.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('badge text-2xs', CATEGORY_COLORS[form.category] || 'bg-gray-100 text-gray-600')}>
                      {form.category}
                    </span>
                    <span className="text-2xs text-gray-400">v{form.version}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{form.name}</h3>
                  {form.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{form.description}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-2xs text-gray-400">{form.created_at ? format(new Date(form.created_at), 'MMM d, yyyy') : ''}</span>
                <div className="flex items-center gap-1">
                  <button className="btn-icon" onClick={() => navigate(`/forms/${form.id}/edit`)} title="Edit">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button className="btn-icon text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10" onClick={() => deleteMutation.mutate(form.id)} title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
