import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface UIState {
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean
  activeModal: string | null
}

const theme = (localStorage.getItem('theme') as 'light' | 'dark') || 'light'

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    theme,
    sidebarCollapsed: false,
    activeModal: null,
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
  },
})

export const { toggleTheme, toggleSidebar, setModal } = uiSlice.actions
export default uiSlice.reducer
