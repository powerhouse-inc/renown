import { useState, useCallback, useMemo, useEffect } from 'react'
import { atom, useAtom } from 'jotai'
import { useOrchestrator, useSession } from './use-wallet-adapter'

const credentialIdAtom = atom<string | null>(null)
const userDocIdAtom = atom<string | null>(null)
/**
 * Address whose credential was just revoked in the current page session.
 * Used by the web flow to suppress auto-sign so a revoked user lands on the
 * manual Confirm Authorization view instead of being re-signed-in immediately.
 * Cleared when the user fully signs out (Disconnect) or on page refresh.
 */
export const revokedAddressAtom = atom<string | null>(null)

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
  const [, setRevokedAddress] = useAtom(revokedAddressAtom)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // Tracks the (address, appDid) pair the initial credential fetch most
  // recently resolved for. Keying on both lets `isFetchingCredential` stay
  // true while the appDid changes (e.g. console flow's connectDid hydrating
  // from the query string), so the UI can't act on a stale `jwt` issued for
  // a different app.
  const [fetchedCredentialFor, setFetchedCredentialFor] = useState<string | null>(null)
  const fetchKey = session?.address ? `${session.address}:${appDid ?? ''}` : null

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
        // Defensive: only accept a credential whose subject actually matches
        // the requested appDid. The subgraph filter has historically not been
        // tight enough to rely on alone — see the comment in
        // console-flow.tsx's predecessor and the prior client-side check.
        const subject = (credential as { credentialSubject?: { id?: string | null } } | undefined)?.credentialSubject
        const subjectMatches = !appDid || subject?.id === appDid
        if (credential && subjectMatches) {
          setJwt(credential.id)
        } else {
          setJwt(null)
          setUserDocId(null)
        }
        if (data?.userDocumentId && subjectMatches) {
          setUserDocId(data.userDocumentId)
        }
      } catch (e) {
        if (!cancelled) console.error('Failed to fetch credential:', e)
      } finally {
        if (!cancelled) setFetchedCredentialFor(`${address}:${appDid ?? ''}`)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session?.address, appDid, orchestrator, setJwt, setUserDocId])

  const isFetchingCredential = !!fetchKey && fetchedCredentialFor !== fetchKey

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
    // A full sign-out (Disconnect) clears any prior revoke suppression so the
    // next login can auto-sign normally.
    setRevokedAddress(null)
  }, [logout, orchestrator, setRevokedAddress])

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
