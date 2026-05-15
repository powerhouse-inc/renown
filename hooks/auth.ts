import { useState, useCallback, useMemo, useEffect } from 'react'
import { atom, useAtom } from 'jotai'
import { useOrchestrator, useSession } from './use-wallet-adapter'

const credentialIdAtom = atom<string | null>(null)
const userDocIdAtom = atom<string | null>(null)

interface LoginOptions {
  appId?: string
  driveId?: string
  userDocId?: string
  returnUrl?: string
  ensName?: string | null
  ensAvatar?: string | null
}

interface UseAuthReturn {
  jwt: string | null
  did: string | null
  userDocId: string | null
  isAuthenticated: boolean
  isLoading: boolean
  /** True while the initial credential fetch for the current address has not yet resolved. */
  isFetchingCredential: boolean
  error: Error | null
  login: (options?: LoginOptions) => Promise<string>
  logout: () => Promise<void>
  signOut: () => Promise<void>
  refreshToken: () => Promise<string | null>
}

function deriveAppFromReturnUrl(returnUrl?: string): string {
  if (!returnUrl) return 'renown-app'
  try {
    const url = new URL(returnUrl)
    return `${url.protocol}//${url.host}`
  } catch (e) {
    console.warn('Failed to parse returnUrl, using default app:', e)
    return 'renown-app'
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function useAuth(appDid?: string): UseAuthReturn {
  const session = useSession()
  const orchestrator = useOrchestrator()

  const [jwt, setJwt] = useAtom(credentialIdAtom)
  const [userDocId, setUserDocId] = useAtom(userDocIdAtom)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // Tracks the address that the initial credential fetch most recently resolved
  // for. Used to derive `isFetchingCredential` so the UI can wait for the first
  // fetch before deciding which post-login view to render.
  const [fetchedCredentialFor, setFetchedCredentialFor] = useState<string | null>(null)

  const did = useMemo(() => {
    if (!session) return null
    return `did:pkh:${session.caip2}:${session.address.toLowerCase()}`
  }, [session])

  const isAuthenticated = useMemo(() => !!jwt, [jwt])

  useEffect(() => {
    const address = session?.address
    // No need to reset `fetchedCredentialFor` when the session clears — the
    // derived `isFetchingCredential` below is already gated on `session?.address`.
    if (!address) return

    let cancelled = false
    void (async () => {
      try {
        const data = await orchestrator.fetchCredential({
          address,
          appId: appDid,
          includeRevoked: false,
        })
        if (cancelled) return
        const credential = data?.credential
        if (credential) {
          setJwt(credential.id)
        } else {
          setJwt(null)
          setUserDocId(null)
        }
        if (data?.userDocumentId) {
          setUserDocId(data.userDocumentId)
        }
      } catch (e) {
        if (!cancelled) console.error('Failed to fetch credential:', e)
      } finally {
        if (!cancelled) setFetchedCredentialFor(address)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session?.address, appDid, orchestrator, setJwt, setUserDocId])

  const isFetchingCredential = !!session?.address && fetchedCredentialFor !== session.address

  const login = useCallback(
    async (options?: LoginOptions): Promise<string> => {
      if (!session) {
        throw new Error('Wallet not connected')
      }

      setIsLoading(true)
      setError(null)

      try {
        const { credentialId, userDocumentId } = await orchestrator.issueDelegationVc(
          deriveAppFromReturnUrl(options?.returnUrl),
          options?.appId,
          {
            username: options?.ensName ?? shortAddress(session.address),
            userImage: options?.ensAvatar,
            driveId: options?.driveId,
            docId: options?.userDocId,
          },
        )

        if (userDocumentId) setUserDocId(userDocumentId)
        setJwt(credentialId)
        return credentialId
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        setError(err)
        console.error('Login failed:', err)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [session, orchestrator, setJwt, setUserDocId],
  )

  const logout = useCallback(async () => {
    if (jwt && session) {
      try {
        await orchestrator.revokeCredential(jwt, session.address)
      } catch (e) {
        console.error('Error revoking credential on Renown Switchboard:', e)
      }
    }
    setJwt(null)
    setUserDocId(null)
    setError(null)
  }, [jwt, session, orchestrator, setJwt, setUserDocId])

  const signOut = useCallback(async () => {
    await logout()
    try {
      await orchestrator.signOut()
    } catch (e) {
      console.error('Error signing out of wallet:', e)
    }
  }, [logout, orchestrator])

  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!session) return null

    try {
      setIsLoading(true)
      const { credentialId, userDocumentId } = await orchestrator.issueDelegationVc(
        'renown-app',
        undefined,
        { username: shortAddress(session.address) },
      )
      if (userDocumentId) setUserDocId(userDocumentId)
      setJwt(credentialId)
      return credentialId
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      setError(err)
      console.error('Credential refresh failed:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [session, orchestrator, setJwt, setUserDocId])

  return useMemo(
    () => ({
      jwt,
      did,
      userDocId,
      isAuthenticated,
      isLoading,
      isFetchingCredential,
      error,
      login,
      logout,
      signOut,
      refreshToken,
    }),
    [jwt, did, userDocId, isAuthenticated, isLoading, isFetchingCredential, error, login, logout, signOut, refreshToken],
  )
}
