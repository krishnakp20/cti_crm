import { useSelector } from 'react-redux'
import { RootState } from '../redux/store'

/** Returns the client_id param to inject into API calls when admin has a client selected. */
export function useAdminClient() {
  const user = useSelector((s: RootState) => s.auth.user)
  const adminClientId = useSelector((s: RootState) => s.ui.adminClientId)
  const adminClientName = useSelector((s: RootState) => s.ui.adminClientName)

  const isAdmin = user?.role === 'admin'
  // Only admins have a switcher; non-admins are always scoped to their own client
  const clientFilter = isAdmin && adminClientId ? { client_id: adminClientId } : {}

  return { isAdmin, adminClientId, adminClientName, clientFilter }
}
