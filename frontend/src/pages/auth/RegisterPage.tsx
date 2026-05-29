import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../../services/api'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors } } = useForm()
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onSubmit = async (data: any) => {
    setLoading(true)
    try {
      await authApi.register(data)
      toast.success('Registration submitted. Awaiting admin approval.')
      navigate('/login')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Create account</h2>
        <p className="text-xs text-gray-500 mt-0.5">Register your company to get started</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Full Name</label>
          <input {...register('full_name', { required: true })} className="input" placeholder="John Doe" />
        </div>
        <div className="col-span-2">
          <label className="label">Email</label>
          <input type="email" {...register('email', { required: true })} className="input" placeholder="john@company.com" />
        </div>
        <div className="col-span-2">
          <label className="label">Password</label>
          <input type="password" {...register('password', { required: true, minLength: 8 })} className="input" placeholder="Min. 8 characters" />
        </div>
        <div className="col-span-2">
          <label className="label">Company Name</label>
          <input {...register('company_name', { required: true })} className="input" placeholder="Acme Corp" />
        </div>
        <div className="col-span-2">
          <label className="label">Company Email</label>
          <input type="email" {...register('company_email', { required: true })} className="input" placeholder="info@acme.com" />
        </div>
        <div>
          <label className="label">Mobile</label>
          <input {...register('mobile')} className="input" placeholder="+91 9999999999" />
        </div>
        <div>
          <label className="label">Website</label>
          <input {...register('website')} className="input" placeholder="https://acme.com" />
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register Company'}
      </button>

      <p className="text-center text-xs text-gray-500">
        Already have an account?{' '}
        <Link to="/login" className="text-primary-600 hover:underline font-medium">Sign in</Link>
      </p>
    </form>
  )
}
