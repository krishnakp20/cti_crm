import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'
import { apiClient } from '../services/api'
import { Voicemail, Play, Pause, Trash2, Phone, Clock, User, Loader2 } from 'lucide-react'
import { cn } from '../utils/cn'
import { formatDistanceToNow } from 'date-fns'

function formatDuration(secs: number) {
  if (!secs) return '0:00'
  const m = Math.floor(secs / 60)
  const s = String(secs % 60).padStart(2, '0')
  return `${m}:${s}`
}

function VoicemailPlayer({ msgId, token }: { msgId: string; token: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)

  const load = async () => {
    if (src) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/voicemail/play/${msgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      setSrc(URL.createObjectURL(blob))
    } catch {
      alert('Could not load voicemail')
    } finally {
      setLoading(false)
    }
  }

  if (!src) {
    return (
      <button
        onClick={load}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        {loading ? 'Loading…' : 'Play'}
      </button>
    )
  }

  return (
    <audio
      controls
      autoPlay
      src={src}
      className="h-8 w-48"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
    />
  )
}

export default function VoicemailPage() {
  const token = useSelector((s: RootState) => s.auth.accessToken)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['voicemail'],
    queryFn: () => apiClient.get('/voicemail').then(r => r.data),
    refetchInterval: 30000,
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/voicemail/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voicemail'] }),
  })

  const messages: any[] = data?.items || []
  const total = data?.total || 0

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Voicemail className="w-5 h-5 text-primary-600" />
            Voicemail
          </h1>
          <p className="text-xs text-gray-500">{total} message{total !== 1 ? 's' : ''} in inbox</p>
        </div>
      </div>

      {/* Messages */}
      <div className="card divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Voicemail className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No voicemail messages</p>
            <p className="text-xs mt-1">Messages appear here when callers leave voicemail</p>
          </div>
        ) : (
          messages.map((msg: any) => (
            <div key={msg.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              {/* Icon */}
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <Voicemail className="w-5 h-5 text-primary-600" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-gray-900 dark:text-white flex items-center gap-1">
                    <Phone className="w-3 h-3" />{msg.caller_id || 'Unknown'}
                  </span>
                  {msg.agent_name && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <User className="w-3 h-3" />for {msg.agent_name}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{formatDuration(msg.duration)}
                  </span>
                  {msg.timestamp && (
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ext {msg.extension} — {msg.folder}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {token && <VoicemailPlayer msgId={msg.id} token={token} />}
                <button
                  onClick={() => {
                    if (confirm('Delete this voicemail?')) deleteMut.mutate(msg.id)
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
