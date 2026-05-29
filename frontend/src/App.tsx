import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from './redux/store'
import { toggleTheme } from './redux/slices/uiSlice'

import AppLayout from './layouts/AppLayout'
import AuthLayout from './layouts/AuthLayout'

import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import TicketsPage from './pages/tickets/TicketsPage'
import TicketDetailPage from './pages/tickets/TicketDetailPage'
import TicketNewPage from './pages/tickets/TicketNewPage'
import FormsPage from './pages/forms/FormsPage'
import FormBuilderPage from './pages/forms/FormBuilderPage'
import ClientsPage from './pages/admin/ClientsPage'
import UsersPage from './pages/UsersPage'
import CampaignsPage from './pages/calls/CampaignsPage'
import CallLogsPage from './pages/calls/CallLogsPage'
import AlertsPage from './pages/AlertsPage'
import ReportsPage from './pages/ReportsPage'
import AuditPage from './pages/AuditPage'
import AgentPage from './pages/AgentPage'
import SettingsPage from './pages/SettingsPage'
import NotFoundPage from './pages/NotFoundPage'


function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const theme = useSelector((s: RootState) => s.ui.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <Routes>
      <Route element={<GuestRoute><AuthLayout /></GuestRoute>}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/new" element={<TicketNewPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="/forms" element={<FormsPage />} />
        <Route path="/forms/new" element={<FormBuilderPage />} />
        <Route path="/forms/:id/edit" element={<FormBuilderPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/call-logs" element={<CallLogsPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
