import { useRenownAuth } from '@powerhousedao/reactor-browser/renown'
import { useOwnProfile } from '../../hooks/use-own-profile'
import type { RenownProfile } from '../../services/switchboard'

export type SiteAuth =
  | { state: 'loading' }
  | { state: 'signed-out'; login: () => void }
  | {
      state: 'signed-in'
      address: string
      displayName: string | null
      avatarUrl: string | null
      profile: RenownProfile | null
      logout: () => void
    }

/** The visitor's session as the site chrome needs it. */
export function useSiteAuth(): SiteAuth {
  const { user, status, displayName, avatarUrl, login, logout } = useRenownAuth()
  const { profile } = useOwnProfile(user?.address)
  if (status === undefined || status === 'loading' || status === 'checking') return { state: 'loading' }
  if (!user) return { state: 'signed-out', login: () => void login() }
  return {
    state: 'signed-in',
    address: user.address,
    displayName: displayName ?? null,
    avatarUrl: avatarUrl ?? null,
    profile,
    logout: () => void logout(),
  }
}
