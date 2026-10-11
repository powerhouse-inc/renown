import { useRenownAuth } from '@powerhousedao/reactor-browser/renown'
import { useSyncExternalStore } from 'react'
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
      /** Signs out, then starts the sign-in again (with the account the wallet now has). */
      switchAccount: () => void
    }

/** Ends the session, then starts a new sign-in: never the other way round. */
export async function signInAgain(logout: () => Promise<void> | void, login: () => void): Promise<void> {
  await logout()
  login()
}

// Playwright runs the dev server with NEXT_PUBLIC_E2E_AUTH=1: a test can then
// stand in for a Renown session in the site chrome by setting
// window.__renownE2eSession = { address, calls: [] }; its sign-out and sign-in
// are recorded in `calls`. Inert in every other build.
const E2E_AUTH = process.env.NEXT_PUBLIC_E2E_AUTH === '1'
interface E2eSession {
  address: string
  calls: string[]
}
const noSubscribe = () => () => {}
const e2eSession = () => (E2E_AUTH ? ((window as { __renownE2eSession?: E2eSession }).__renownE2eSession ?? null) : null)

/** The visitor's session as the site chrome needs it. */
export function useSiteAuth(): SiteAuth {
  const { user, status, displayName, avatarUrl, login, logout } = useRenownAuth()
  const testSession = useSyncExternalStore(noSubscribe, e2eSession, () => null)
  const address = user?.address ?? testSession?.address
  const { profile } = useOwnProfile(address)
  if (testSession && !user) {
    const record = (call: string) => () => void testSession.calls.push(call)
    return {
      state: 'signed-in',
      address: testSession.address,
      displayName: null,
      avatarUrl: null,
      profile,
      logout: record('logout'),
      switchAccount: () => void signInAgain(record('logout'), record('login')),
    }
  }
  if (status === undefined || status === 'loading' || status === 'checking') return { state: 'loading' }
  if (!user) return { state: 'signed-out', login: () => void login() }
  return {
    state: 'signed-in',
    address: user.address,
    displayName: displayName ?? null,
    avatarUrl: avatarUrl ?? null,
    profile,
    logout: () => void logout(),
    switchAccount: () => void signInAgain(logout, () => void login()),
  }
}
