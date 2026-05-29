import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useDispatch } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { setAuth } from '../../redux/slices/authSlice'
import { authApi } from '../../services/api'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

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
      const res = await authApi.login(data.email, data.password)
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Sign in</h2>
        <p className="text-xs text-gray-500 mt-0.5">Enter your credentials to continue</p>
      </div>

      <div>
        <label className="label">Email</label>
        <input
          type="email"
          {...register('email', { required: 'Email is required' })}
          className="input"
          placeholder="admin@example.com"
          autoComplete="email"
        />
        {errors.email && <p className="text-2xs text-red-500 mt-1">{errors.email.message}</p>}
      </div>

      <div>
        <label className="label">Password</label>
        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            {...register('password', { required: 'Password is required' })}
            className="input pr-9"
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setShowPass(v => !v)}>
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && <p className="text-2xs text-red-500 mt-1">{errors.password.message}</p>}
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
      </button>

      <p className="text-center text-xs text-gray-500">
        Don't have an account?{' '}
        <Link to="/register" className="text-primary-600 hover:underline font-medium">Register your company</Link>
      </p>

      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <p className="text-2xs text-gray-500 font-medium mb-1">Demo credentials</p>
        <p className="text-2xs text-gray-600 dark:text-gray-400">Admin: admin@cti-crm.com / Admin@123</p>
      </div>
    </form>
  )
}
