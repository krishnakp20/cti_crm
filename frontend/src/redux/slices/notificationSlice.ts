import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface Notification {
  id: number
  title: string
  message: string
  type: string
  priority: string
  is_read: boolean
  created_at: string
  action_url?: string
}

interface NotificationState {
  items: Notification[]
  unreadCount: number
}

const notificationSlice = createSlice({
  name: 'notifications',
  initialState: { items: [], unreadCount: 0 } as NotificationState,
  reducers: {
    setNotifications(state, action: PayloadAction<{ items: Notification[]; unread: number }>) {
      state.items = action.payload.items
      state.unreadCount = action.payload.unread
    },
    addNotification(state, action: PayloadAction<Notification>) {
      state.items.unshift(action.payload)
      if (!action.payload.is_read) state.unreadCount++
    },
    markRead(state, action: PayloadAction<number>) {
      const n = state.items.find(i => i.id === action.payload)
      if (n && !n.is_read) {
        n.is_read = true
        state.unreadCount = Math.max(0, state.unreadCount - 1)
      }
    },
    markAllRead(state) {
      state.items.forEach(n => (n.is_read = true))
      state.unreadCount = 0
    },
  },
})

export const { setNotifications, addNotification, markRead, markAllRead } = notificationSlice.actions
export default notificationSlice.reducer
