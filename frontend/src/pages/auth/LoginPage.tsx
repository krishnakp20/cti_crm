import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useDispatch } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { setAuth } from '../../redux/slices/authSlice'
import { authApi } from '../../services/api'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Loader2, LogIn, Mail, Lock } from 'lucide-react'

interface LoginForm {
  email: string
  password: string
}

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>()
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    try {
      const res = await authApi.login(data.email.trim(), data.password.trim())
      dispatch(setAuth({
        user: res.data.user,
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
      }))
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Sign in</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Welcome back — enter your credentials to continue</p>
      </div>

      <div>
        <label className="label">Email Address</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="email"
            {...register('email', { required: 'Email is required' })}
            className="input pl-9"
            placeholder="you@company.com"
            autoComplete="email"
          />
        </div>
        {errors.email && <p className="text-2xs text-brand-500 mt-1.5 flex items-center gap-1">{errors.email.message}</p>}
      </div>

      <div>
        <label className="label">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type={showPass ? 'text' : 'password'}
            {...register('password', { required: 'Password is required' })}
            className="input pl-9 pr-10"
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            onClick={() => setShowPass(v => !v)}
          >
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && <p className="text-2xs text-brand-500 mt-1.5">{errors.password.message}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-navy hover:shadow-lg"
        style={{ background: loading ? '#003347' : 'linear-gradient(135deg, #004f6a 0%, #003347 100%)' }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-sm text-gray-500 pt-1">
        Don't have an account?{' '}
        <Link to="/register" className="font-semibold hover:underline" style={{ color: '#004058' }}>
          Register your company
        </Link>
      </p>

    </form>
  )
}
