import axios from 'axios'
import { store } from '../redux/store'
import { updateToken, logout } from '../redux/slices/authSlice'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

api.interceptors.request.use(config => {
  const token = store.getState().auth.accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = store.getState().auth.refreshToken
      if (refreshToken) {
        try {
          const res = await axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken })
          store.dispatch(updateToken(res.data.access_token))
          original.headers.Authorization = `Bearer ${res.data.access_token}`
          return api(original)
        } catch {
          store.dispatch(logout())
        }
      } else {
        store.dispatch(logout())
      }
    }
    return Promise.reject(error)
  },
)

export default api

export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  logout: (refreshToken: string) => api.post('/auth/logout', { refresh_token: refreshToken }),
  changePassword: (data: any) => api.post('/auth/change-password', data),
}

export const ticketsApi = {
  list: (params?: any) => api.get('/tickets', { params }),
  get: (id: number) => api.get(`/tickets/${id}`),
  create: (data: any) => api.post('/tickets', data),
  update: (id: number, data: any) => api.patch(`/tickets/${id}`, data),
  close: (id: number) => api.post(`/tickets/${id}/close`),
  reopen: (id: number) => api.post(`/tickets/${id}/reopen`),
  addComment: (id: number, data: any) => api.post(`/tickets/${id}/comments`, data),
  getComments: (id: number) => api.get(`/tickets/${id}/comments`),
  getLogs: (id: number) => api.get(`/tickets/${id}/logs`),
}

export const clientsApi = {
  list: (params?: any) => api.get('/clients', { params }),
  get: (id: number) => api.get(`/clients/${id}`),
  me: () => api.get('/clients/me'),
  update: (id: number, data: any) => api.patch(`/clients/${id}`, data),
  activate: (id: number) => api.post(`/clients/${id}/activate`),
  deactivate: (id: number) => api.post(`/clients/${id}/deactivate`),
  getDepartments: (id: number) => api.get(`/clients/${id}/departments`),
  createDepartment: (id: number, data: any) => api.post(`/clients/${id}/departments`, data),
  getTeams: (id: number) => api.get(`/clients/${id}/teams`),
  createTeam: (id: number, data: any) => api.post(`/clients/${id}/teams`, data),
}

export const usersApi = {
  list: (params?: any) => api.get('/users', { params }),
  get: (id: number) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: number, data: any) => api.patch(`/users/${id}`, data),
  listRoles: () => api.get('/users/roles/list'),
  createRole: (data: any) => api.post('/users/roles', data),
  listPermissions: () => api.get('/users/permissions/list'),
  assignRolePermissions: (roleId: number, permissionIds: number[]) =>
    api.post(`/users/roles/${roleId}/permissions`, permissionIds),
  assignUserPermissions: (userId: number, permissions: any[]) =>
    api.post(`/users/${userId}/permissions`, permissions),
}

export const formsApi = {
  list: (params?: any) => api.get('/forms', { params }),
  get: (id: number) => api.get(`/forms/${id}`),
  create: (data: any) => api.post('/forms', data),
  update: (id: number, data: any) => api.patch(`/forms/${id}`, data),
  delete: (id: number) => api.delete(`/forms/${id}`),
  getFields: (id: number) => api.get(`/forms/${id}/fields`),
}

export const callsApi = {
  listCampaigns: (params?: any) => api.get('/calls/campaigns', { params }),
  createCampaign: (data: any) => api.post('/calls/campaigns', data),
  uploadData: (campaignId: number, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/calls/campaigns/${campaignId}/upload`, fd)
  },
  listLogs: (params?: any) => api.get('/calls/logs', { params }),
  createLog: (data: any) => api.post('/calls/logs', data),
  listCallbacks: () => api.get('/calls/callbacks'),
  createCallback: (data: any) => api.post('/calls/callbacks', data),
}

export const alertsApi = {
  list: () => api.get('/alerts'),
  create: (data: any) => api.post('/alerts', data),
  update: (id: number, data: any) => api.patch(`/alerts/${id}`, data),
  delete: (id: number) => api.delete(`/alerts/${id}`),
  listTemplates: () => api.get('/alerts/templates'),
  createTemplate: (data: any) => api.post('/alerts/templates', data),
  listEscalations: () => api.get('/alerts/escalations'),
  createEscalation: (data: any) => api.post('/alerts/escalations', data),
}

export const reportsApi = {
  dashboard: () => api.get('/reports/dashboard'),
  tickets: (params?: any) => api.get('/reports/tickets', { params }),
  calls: (params?: any) => api.get('/reports/calls', { params }),
  agentProductivity: (params?: any) => api.get('/reports/agent-productivity', { params }),
}

export const notificationsApi = {
  list: (params?: any) => api.get('/notifications', { params }),
  markRead: (id: number) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
}

export const auditApi = {
  list: (params?: any) => api.get('/audit', { params }),
}
