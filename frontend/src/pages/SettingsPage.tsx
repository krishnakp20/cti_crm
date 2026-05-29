import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../redux/store'
import { toggleTheme } from '../redux/slices/uiSlice'
import { authApi } from '../services/api'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Moon, Sun, Lock, Bell, User, Loader2 } from 'lucide-react'

export default function SettingsPage() {
  const user = useSelector((s: RootState) => s.auth.user)
  const theme = useSelector((s: RootState) => s.ui.theme)
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, reset } = useForm()

  const onChangePassword = async (data: any) => {
    if (data.new_password !== data.confirm_password) {
      toast.error('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await authApi.changePassword({ current_password: data.current_password, new_password: data.new_password })
      toast.success('Password changed successfully')
      reset()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-xs text-gray-500">Manage your account and preferences</p>
      </div>

      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" /> Profile
        </h3>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary-600 flex items-center justify-center text-white text-lg font-bold">
            {user?.full_name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.full_name}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
            <span className="badge bg-primary-100 text-primary-700 capitalize mt-1">{user?.role?.replace('_', ' ')}</span>
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Moon className="w-4 h-4 text-gray-400" /> Appearance
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300">Dark Mode</p>
            <p className="text-xs text-gray-500">Switch between light and dark theme</p>
          </div>
          <button
            onClick={() => dispatch(toggleTheme())}
            className={`relative w-10 h-5 rounded-full transition-colors ${theme === 'dark' ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Lock className="w-4 h-4 text-gray-400" /> Change Password
        </h3>
        <form onSubmit={handleSubmit(onChangePassword)} className="space-y-3">
          <div>
            <label className="label">Current Password</label>
            <input type="password" {...register('current_password', { required: true })} className="input" placeholder="••••••••" />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" {...register('new_password', { required: true, minLength: 8 })} className="input" placeholder="Min. 8 characters" />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" {...register('confirm_password', { required: true })} className="input" placeholder="Repeat new password" />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
