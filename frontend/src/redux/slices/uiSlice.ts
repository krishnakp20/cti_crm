import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface UIState {
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean
  activeModal: string | null
  adminClientId: number | null      // which client admin is currently viewing (null = all)
  adminClientName: string | null
  agentOnCall: boolean              // true while agent has an active call
}

const theme = (localStorage.getItem('theme') as 'light' | 'dark') || 'light'

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    theme,
    sidebarCollapsed: false,
    activeModal: null,
    adminClientId: null,
    adminClientName: null,
    agentOnCall: false,
  } as UIState,
  reducers: {
    toggleTheme(state) {
      state.theme = state.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', state.theme)
      document.documentElement.classList.toggle('dark', state.theme === 'dark')
    },
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed
    },
    setModal(state, action: PayloadAction<string | null>) {
      state.activeModal = action.payload
    },
    setAdminClient(state, action: PayloadAction<{ id: number | null; name: string | null }>) {
      state.adminClientId = action.payload.id
      state.adminClientName = action.payload.name
    },
    setAgentOnCall(state, action: PayloadAction<boolean>) {
      state.agentOnCall = action.payload
    },
  },
})

export const { toggleTheme, toggleSidebar, setModal, setAdminClient, setAgentOnCall } = uiSlice.actions
export default uiSlice.reducer
