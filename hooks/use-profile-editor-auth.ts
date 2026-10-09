import { useRenown, useRenownAuth } from '@powerhousedao/reactor-browser/renown'
import { useCallback } from 'react'
import type { Hex } from 'viem'
import { useAuthInitializing, useSession } from './use-wallet-adapter'

/**
 * What the profile editor needs from the signed-in user:
 *  - the wallet session, to personal_sign the profile upsert;
 *  - the Renown session (same address), whose bearer authorizes avatar uploads.
 */
export type ProfileEditorAuth =
  | { status: 'loading' }
  | { status: 'signed-out'; login: () => void }
  | { status: 'ready'; address: Hex; profileId: string | null; signMessage: (m: string) => Promise<Hex>; getBearer: () => Promise<string> }

// Playwright runs the dev server with NEXT_PUBLIC_E2E_AUTH=1 and sets
// window.__renownE2eBearer, standing in for the Renown session (the upload
// route that checks bearers is stubbed there). Inert in every other build.
const E2E_AUTH = process.env.NEXT_PUBLIC_E2E_AUTH === '1'
function e2eBearer(): string | undefined {
  if (!E2E_AUTH || typeof window === 'undefined') return undefined
  return (window as { __renownE2eBearer?: string }).__renownE2eBearer
}

export function useProfileEditorAuth(): ProfileEditorAuth {
  const session = useSession()
  const initializing = useAuthInitializing()
  const renownAuth = useRenownAuth()
  const renown = useRenown()

  const getBearer = useCallback(async (): Promise<string> => {
    const injected = e2eBearer()
    if (injected) return injected
    if (!renown?.user) throw new Error('Sign in to Renown to upload an avatar')
    return renown.getBearerToken({ expiresIn: 600 })
  }, [renown])

  if (initializing || renownAuth.status === 'loading' || renownAuth.status === 'checking') return { status: 'loading' }
  const renownAddress = e2eBearer() ? session?.address : renownAuth.address
  if (!session || !renownAddress || renownAddress.toLowerCase() !== session.address.toLowerCase()) {
    return { status: 'signed-out', login: () => renownAuth.login() }
  }
  return {
    status: 'ready',
    address: session.address,
    profileId: renownAuth.profileId ?? null,
    signMessage: (message) => session.signer.signMessage(message),
    getBearer,
  }
}
