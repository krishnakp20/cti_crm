import { configureStore } from '@reduxjs/toolkit'
import authSlice from './slices/authSlice'
import uiSlice from './slices/uiSlice'
import notificationSlice from './slices/notificationSlice'

export const store = configureStore({
  reducer: {
    auth: authSlice,
    ui: uiSlice,
    notifications: notificationSlice,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
