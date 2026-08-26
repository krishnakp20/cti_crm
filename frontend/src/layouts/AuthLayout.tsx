import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div
        className="hidden lg:flex flex-col justify-between w-[42%] p-12 relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #004f6a 0%, #003347 50%, #001a26 100%)',
        }}
      >
        {/* Decorative orbs */}
        <div className="absolute -top-24 -left-24 w-64 h-64 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #ffcd00 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #e30023 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #779520 0%, transparent 70%)' }} />

        {/* Logo */}
        <div>
          <div className="bg-white rounded-xl px-4 py-2 inline-flex items-center">
            <img src="/dialdesk-logo.svg" alt="DialDesk" className="h-7 w-auto object-contain" />
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Enterprise Call<br />Center Platform
          </h1>
          <p className="text-base leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Intelligent routing, real-time analytics, and seamless agent workflows — all in one unified platform.
          </p>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { value: '99.9%', label: 'Uptime SLA' },
              { value: '<50ms', label: 'Latency' },
              { value: '24/7', label: 'Support' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-2xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-2xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          © 2026 DialDesk. All rights reserved.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="bg-white rounded-xl px-4 py-2 shadow-card inline-flex items-center">
              <img src="/dialdesk-logo.svg" alt="DialDesk" className="h-7 w-auto object-contain" />
            </div>
          </div>

          <div className="card p-8 shadow-card-lg">
            <Outlet />
          </div>

          <p className="text-center text-2xs text-gray-400 mt-5">
            Secure enterprise authentication · TLS 1.3 encrypted
          </p>
        </div>
      </div>
    </div>
  )
}
