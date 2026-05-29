import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { callsApi } from '../../services/api'
import { useForm } from 'react-hook-form'
import { Plus, Upload, X, Loader2, Megaphone } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

const STATUS_COLORS: any = {
  draft: 'badge bg-gray-100 text-gray-600',
  active: 'badge bg-green-100 text-green-700',
  paused: 'badge bg-yellow-100 text-yellow-700',
  completed: 'badge bg-blue-100 text-blue-700',
}

export default function CampaignsPage() {
  const [showModal, setShowModal] = useState(false)
  const [uploadCampaign, setUploadCampaign] = useState<number | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm()

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => callsApi.listCampaigns().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (d: any) => callsApi.createCampaign(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign created'); setShowModal(false); reset() },
  })

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => callsApi.uploadData(id, file),
    onSuccess: (res) => {
      toast.success(`Uploaded ${res.data.total} records`)
      setUploadCampaign(null)
      setUploadFile(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Upload failed'),
  })

  const campaigns = data?.items || []

  return (
    <div className="space-y-3 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Campaigns</h1>
          <p className="text-xs text-gray-500">Manage calling campaigns</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus className="w-3.5 h-3.5" /> New Campaign
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : campaigns.length === 0 ? (
        <div className="card p-12 text-center">
          <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No campaigns yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {campaigns.map((c: any) => (
            <div key={c.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{c.name}</h3>
                  {c.description && <p className="text-2xs text-gray-500 mt-0.5 line-clamp-2">{c.description}</p>}
                </div>
                <span className={STATUS_COLORS[c.status] || 'badge'}>{c.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge bg-indigo-100 text-indigo-700 capitalize">{c.campaign_type?.replace('_', ' ')}</span>
                <span className="text-2xs text-gray-400">{c.created_at ? format(new Date(c.created_at), 'MMM d') : ''}</span>
              </div>
              <button
                className="btn-secondary w-full btn-sm justify-center"
                onClick={() => setUploadCampaign(c.id)}
              >
                <Upload className="w-3.5 h-3.5" /> Upload Data
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">New Campaign</h3>
              <button className="btn-icon" onClick={() => { setShowModal(false); reset() }}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-3">
              <div>
                <label className="label">Campaign Name</label>
                <input {...register('name', { required: true })} className="input" placeholder="Q4 Outreach" />
              </div>
              <div>
                <label className="label">Type</label>
                <select {...register('campaign_type', { required: true })} className="input">
                  <option value="manual">Manual</option>
                  <option value="predictive">Predictive</option>
                  <option value="preview">Preview</option>
                  <option value="progressive">Progressive</option>
                </select>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea {...register('description')} className="input resize-none" rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowModal(false); reset() }}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {uploadCampaign && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">Upload Calling Data</h3>
              <button className="btn-icon" onClick={() => { setUploadCampaign(null); setUploadFile(null) }}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Upload CSV or Excel file with columns: name, mobile, city, state, priority, remarks</p>
              <label className="block border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-primary-300 transition-colors">
                <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-500">{uploadFile ? uploadFile.name : 'Click to select file (CSV/Excel)'}</p>
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
              </label>
              <div className="flex gap-2">
                <button className="btn-secondary flex-1" onClick={() => { setUploadCampaign(null); setUploadFile(null) }}>Cancel</button>
                <button
                  className="btn-primary flex-1"
                  disabled={!uploadFile || uploadMutation.isPending}
                  onClick={() => uploadFile && uploadMutation.mutate({ id: uploadCampaign, file: uploadFile })}
                >
                  {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
