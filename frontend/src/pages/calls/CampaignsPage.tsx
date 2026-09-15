import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { callsApi } from '../../services/api'
import { useForm } from 'react-hook-form'
import { Plus, Upload, X, Loader2, Megaphone, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'
import api from '../../services/api'
import { useSelector } from 'react-redux'
import { RootState } from '../../redux/store'

const STATUS_COLORS: any = {
  draft: 'badge bg-gray-100 text-gray-600',
  active: 'badge bg-green-100 text-green-700',
  paused: 'badge bg-yellow-100 text-yellow-700',
  completed: 'badge bg-blue-100 text-blue-700',
}

// Upload states: idle → previewing → confirmed → uploading → done
type UploadStep = 'select' | 'preview' | 'done'

export default function CampaignsPage() {
  const [showModal, setShowModal] = useState(false)
  const [uploadCampaign, setUploadCampaign] = useState<number | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadStep, setUploadStep] = useState<UploadStep>('select')
  const [previewData, setPreviewData] = useState<any>(null)
  const [mobileField, setMobileField] = useState('')
  const [nameField, setNameField] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm()
  const adminClientId = useSelector((s: RootState) => s.ui.adminClientId)

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', adminClientId],
    queryFn: () => callsApi.listCampaigns(adminClientId ? { client_id: adminClientId } : {}).then(r => r.data),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/calls/campaigns/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to update status'),
  })

  const createMutation = useMutation({
    mutationFn: (d: any) => callsApi.createCampaign({ ...d, ...(adminClientId ? { client_id: adminClientId } : {}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign created'); setShowModal(false); reset() },
  })

  const uploadMutation = useMutation({
    mutationFn: ({ id, mobileF, nameF }: { id: number; mobileF: string; nameF: string }) => {
      // Re-send the base64 file as a Blob
      const b64 = previewData?.file_b64 || ''
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'text/csv' })
      const file = new File([blob], previewData?.filename || 'data.csv')
      return callsApi.uploadData(id, file, mobileF, nameF)
    },
    onSuccess: (res) => {
      toast.success(`Uploaded ${res.data.total} records`)
      setUploadStep('done')
      qc.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Upload failed'),
  })

  const closeUpload = () => {
    setUploadCampaign(null); setUploadFile(null); setPreviewData(null)
    setUploadStep('select'); setMobileField(''); setNameField('')
  }

  const runPreview = async () => {
    if (!uploadFile || !uploadCampaign) return
    setPreviewLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      const res = await api.post(`/calls/campaigns/${uploadCampaign}/preview`, fd)
      setPreviewData(res.data)
      setMobileField(res.data.detected_mobile || res.data.columns?.[0] || '')
      setNameField(res.data.detected_name || '')
      setUploadStep('preview')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Preview failed')
    }
    setPreviewLoading(false)
  }

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
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge bg-indigo-100 text-indigo-700 capitalize">{c.campaign_type?.replace('_', ' ')}</span>
                {c.caller_id_number && (
                  <span className="badge bg-purple-100 text-purple-700 font-mono">CID: {c.caller_id_number}</span>
                )}
                {c.dial_prefix && (
                  <span className="badge bg-orange-100 text-orange-700 font-mono">prefix: {c.dial_prefix}</span>
                )}
                {c.dial_context && c.dial_context !== 'from-internal' && (
                  <span className="badge bg-gray-100 text-gray-600 font-mono">{c.dial_context}</span>
                )}
                <span className="text-2xs text-gray-400">{c.created_at ? format(new Date(c.created_at), 'MMM d') : ''}</span>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex-1 btn-sm justify-center"
                  onClick={() => setUploadCampaign(c.id)}
                >
                  <Upload className="w-3.5 h-3.5" /> Upload
                </button>
                {c.status === 'draft' && (
                  <button
                    className="btn-sm bg-green-600 hover:bg-green-700 text-white px-3 rounded-lg text-xs font-semibold"
                    onClick={() => statusMutation.mutate({ id: c.id, status: 'active' })}
                  >
                    Activate
                  </button>
                )}
                {c.status === 'active' && (
                  <button
                    className="btn-sm bg-yellow-500 hover:bg-yellow-600 text-white px-3 rounded-lg text-xs font-semibold"
                    onClick={() => statusMutation.mutate({ id: c.id, status: 'paused' })}
                  >
                    Pause
                  </button>
                )}
                {c.status === 'paused' && (
                  <button
                    className="btn-sm bg-green-600 hover:bg-green-700 text-white px-3 rounded-lg text-xs font-semibold"
                    onClick={() => statusMutation.mutate({ id: c.id, status: 'active' })}
                  >
                    Resume
                  </button>
                )}
              </div>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Caller ID Name <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input {...register('caller_id_name')} className="input" placeholder="e.g. Sheesha Green" />
                  <p className="text-2xs text-gray-400 mt-1">Shown to customer on their phone</p>
                </div>
                <div>
                  <label className="label">Caller ID Number <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input {...register('caller_id_number')} className="input" placeholder="e.g. 02212345678" />
                  <p className="text-2xs text-gray-400 mt-1">Number shown to customer</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Dial Prefix <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input {...register('dial_prefix')} className="input" placeholder="e.g. 0 or 9" />
                  <p className="text-2xs text-gray-400 mt-1">Prepended to mobile before dialing</p>
                </div>
                <div>
                  <label className="label">Asterisk Context <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input {...register('dial_context')} className="input" placeholder="from-internal" />
                  <p className="text-2xs text-gray-400 mt-1">Default: from-internal</p>
                </div>
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
          <div className="card p-5 w-full max-w-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">
                {uploadStep === 'select' && 'Upload Calling Data'}
                {uploadStep === 'preview' && 'Map Fields & Confirm'}
                {uploadStep === 'done' && 'Upload Complete'}
              </h3>
              <button className="btn-icon" onClick={closeUpload}><X className="w-4 h-4" /></button>
            </div>

            {/* Step 1: Select file */}
            {uploadStep === 'select' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Upload a CSV file. We'll auto-detect the mobile and name columns.</p>
                <label className="block border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-primary-300 transition-colors">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{uploadFile ? uploadFile.name : 'Click to select CSV file'}</p>
                  <p className="text-xs text-gray-400 mt-1">CSV format, any columns</p>
                  <input type="file" accept=".csv" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                </label>
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1" onClick={closeUpload}>Cancel</button>
                  <button
                    className="btn-primary flex-1"
                    disabled={!uploadFile || previewLoading}
                    onClick={runPreview}
                  >
                    {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Next: Preview →'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Field mapping + preview */}
            {uploadStep === 'preview' && previewData && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <span className="text-xs text-blue-700 dark:text-blue-300">
                    Found <strong>{previewData.total_rows}</strong> rows in <strong>{previewData.filename}</strong>
                  </span>
                </div>

                {/* Field mapping */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Mobile Number Column <span className="text-red-500">*</span></label>
                    <select className="input text-sm" value={mobileField} onChange={e => setMobileField(e.target.value)}>
                      <option value="">— select —</option>
                      {previewData.columns?.map((c: string) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Name Column</label>
                    <select className="input text-sm" value={nameField} onChange={e => setNameField(e.target.value)}>
                      <option value="">— select —</option>
                      {previewData.columns?.map((c: string) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preview table */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Preview (first 5 rows)</p>
                  <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800">
                          {previewData.columns?.map((c: string) => (
                            <th key={c} className={cn(
                              'px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap',
                              c === mobileField && 'text-green-700 bg-green-50 dark:bg-green-900/20',
                              c === nameField && 'text-blue-700 bg-blue-50 dark:bg-blue-900/20',
                            )}>
                              {c}
                              {c === mobileField && <span className="ml-1 text-2xs bg-green-100 text-green-700 px-1 rounded">mobile</span>}
                              {c === nameField && <span className="ml-1 text-2xs bg-blue-100 text-blue-700 px-1 rounded">name</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {previewData.preview_rows?.map((row: any, i: number) => (
                          <tr key={i}>
                            {previewData.columns?.map((c: string) => (
                              <td key={c} className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{row[c] ?? '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={() => setUploadStep('select')}>← Back</button>
                  <button
                    className="btn-primary flex-1"
                    disabled={!mobileField || uploadMutation.isPending}
                    onClick={() => uploadMutation.mutate({ id: uploadCampaign, mobileF: mobileField, nameF: nameField })}
                  >
                    {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Upload ${previewData.total_rows} Records`}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Done */}
            {uploadStep === 'done' && (
              <div className="text-center py-8 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Upload complete!</p>
                <p className="text-xs text-gray-500">Contacts are now available in the Campaign Dialer.</p>
                <button className="btn-primary mx-auto" onClick={closeUpload}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
