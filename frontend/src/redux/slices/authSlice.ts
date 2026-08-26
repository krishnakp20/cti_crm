import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface User {
  id: number
  email: string
  full_name: string
  role: string
  client_id: number | null
  avatar_url: string | null
  role_id: number | null
  permissions: string[]  // granted permission slugs, e.g. ["tickets.view", "reports.view"]
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
}

const stored = localStorage.getItem('auth')
const initial: AuthState = stored
  ? JSON.parse(stored)
  : { user: null, accessToken: null, refreshToken: null, isAuthenticated: false }

// Ensure legacy stored auth without permissions array doesn't break
if (initial.user && !Array.isArray(initial.user.permissions)) {
  initial.user.permissions = []
}

const authSlice = createSlice({
  name: 'auth',
  initialState: initial,
  reducers: {
    setAuth(state, action: PayloadAction<{ user: User; accessToken: string; refreshToken: string }>) {
      state.user = action.payload.user
      if (!Array.isArray(state.user.permissions)) state.user.permissions = []
      state.accessToken = action.payload.accessToken
      state.refreshToken = action.payload.refreshToken
      state.isAuthenticated = true
      localStorage.setItem('auth', JSON.stringify(state))
    },
    updateToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload
      localStorage.setItem('auth', JSON.stringify(state))
    },
    updatePermissions(state, action: PayloadAction<string[]>) {
      if (state.user) {
        state.user.permissions = action.payload
        localStorage.setItem('auth', JSON.stringify(state))
      }
    },
    logout(state) {
      state.user = null
      state.accessToken = null
      state.refreshToken = null
      state.isAuthenticated = false
      localStorage.removeItem('auth')
    },
  },
})

export const { setAuth, updateToken, updatePermissions, logout } = authSlice.actions
export default authSlice.reducer
