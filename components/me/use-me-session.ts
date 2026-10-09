import { useRenown, useRenownAuth } from '@powerhousedao/reactor-browser/renown'
import { useCallback } from 'react'
import { useAuthInitializing, useSession } from '../../hooks/use-wallet-adapter'

/** Who /me is for, and how that person can prove it for a revoke. */
export type MeSession =
  | { state: 'loading' }
  | { state: 'signed-out'; login: () => void }
  | {
      state: 'signed-in'
      address: string
      /** The Renown bearer for `address`; null when it cannot be had. */
      getBearer: () => Promise<string | null>
      /** personal_sign by the connected wallet when it is `address`; null otherwise. */
      signMessage: ((message: string) => Promise<string>) | null
    }

// Playwright runs the dev server with NEXT_PUBLIC_E2E_AUTH=1: the wallet
// session from the test wallet then stands in for the Renown session, and the
// bearer comes from window.__renownE2eBearer (absent = no bearer). Inert in
// every other build.
const E2E_AUTH = process.env.NEXT_PUBLIC_E2E_AUTH === '1'
function e2eBearer(): string | null {
  if (!E2E_AUTH || typeof window === 'undefined') return null
  return (window as { __renownE2eBearer?: string }).__renownE2eBearer ?? null
}

export function useMeSession(): MeSession {
  const renownAuth = useRenownAuth()
  const renown = useRenown()
  const wallet = useSession()
  const walletInitializing = useAuthInitializing()

  const getBearer = useCallback(async (): Promise<string | null> => {
    if (E2E_AUTH) return e2eBearer()
    if (!renown?.user) return null
    try {
      return await renown.getBearerToken({ expiresIn: 600 })
    } catch (error) {
      console.warn('Renown bearer unavailable:', error)
      return null
    }
  }, [renown])

  const status = renownAuth.status
  const renownAddress = renownAuth.user?.address
  const address = renownAddress ?? (E2E_AUTH ? wallet?.address : undefined)
  if (!address) {
    if (status === undefined || status === 'loading' || status === 'checking' || (E2E_AUTH && walletInitializing)) {
      return { state: 'loading' }
    }
    return { state: 'signed-out', login: () => renownAuth.login() }
  }
  const signer = wallet && wallet.address.toLowerCase() === address.toLowerCase() ? wallet.signer : null
  return {
    state: 'signed-in',
    address,
    getBearer,
    signMessage: signer ? (message) => signer.signMessage(message) : null,
  }
}
