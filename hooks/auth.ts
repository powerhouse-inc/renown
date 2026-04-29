import { useState, useCallback, useMemo, useEffect } from 'react'
import { useWalletClient, useAccount, useChainId } from 'wagmi'
import { atom, useAtom } from 'jotai'
import { createEIP712Credential } from '../services/eip712-credential'

// Atom to store the credential ID
const credentialIdAtom = atom<string | null>(null)
// Atom to store the user profile document ID
const userDocIdAtom = atom<string | null>(null)

export interface LoginOptions {
  appId?: string
  driveId?: string
  userDocId?: string
  returnUrl?: string
  ensName?: string | null
  ensAvatar?: string | null
}

export interface UseAuthReturn {
  jwt: string | null // Legacy field name, now stores credentialId
  did: string | null
  userDocId: string | null // The Renown document ID
  isAuthenticated: boolean
  isLoading: boolean
  error: Error | null
  login: (options?: LoginOptions) => Promise<string>
  logout: () => Promise<void>
  refreshToken: () => Promise<string | null>
}

export function useAuth(appDid?: string): UseAuthReturn {
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()
  const chainId = useChainId()

  const [jwt, setJwt] = useAtom(credentialIdAtom) // jwt now stores credentialId
  const [userDocId, setUserDocId] = useAtom(userDocIdAtom)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Calculate DID from address
  const did = useMemo(() => {
    if (!address) return null
    return `did:pkh:eip155:${chainId}:${address.toLowerCase()}`
  }, [address, chainId])

  // Check if authenticated (jwt is now the credential ID)
  const isAuthenticated = useMemo(() => {
    return !!jwt
  }, [jwt])

  // Fetch credential from API on mount and when appDid changes
  useEffect(() => {
    const fetchCredential = async () => {
      if (!address) {
        return
      }

      try {
        const params = new URLSearchParams({
          address,
          includeRevoked: 'false',
        })
        if (appDid) {
          params.set('appId', appDid)
        }

        const response = await fetch(`/api/auth/credential?${params}`)

        if (response.ok) {
          const data = await response.json()
          const credential = data.credential
          if (credential) {
            setJwt(credential.id)
          }
          if (data.userDocumentId) {
            setUserDocId(data.userDocumentId)
          }
        } else {
          // No valid credential found for this app DID
          setJwt(null)
          setUserDocId(null)
        }
      } catch (e) {
        console.error('Failed to fetch credential:', e)
      }
    }

    fetchCredential()
  }, [address, appDid, setJwt, setUserDocId])

  /**
   * Login and create a new JWT
   */
  const login = useCallback(
    async (options?: LoginOptions): Promise<string> => {
      const { appId, driveId, userDocId, returnUrl, ensName, ensAvatar } = options || {}

      if (!walletClient || !address) {
        throw new Error('Wallet not connected')
      }

      setIsLoading(true)
      setError(null)

      try {
        // Extract base URL from returnUrl
        let app = 'renown-app'
        if (returnUrl) {
          try {
            const url = new URL(returnUrl)
            app = `${url.protocol}//${url.host}`
          } catch (e) {
            console.warn('Failed to parse returnUrl, using default app:', e)
          }
        }

        // Create EIP-712 Verifiable Credential
        const { credential, signature, domain } = await createEIP712Credential({
          walletClient,
          chainId,
          app,
          appId,
          expiresInDays: 7,
        })

        // Determine username: use ENS name if available, otherwise use shortened address
        const username = ensName || `${address.slice(0, 6)}...${address.slice(-4)}`

        // Store the credential on Renown Switchboard
        try {
          const response = await fetch('/api/credential/renown', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              driveId,
              docId: userDocId,
              credential,
              signature,
              domain: {
                ...domain,
                chainId: Number(domain.chainId), // Convert BigInt to number for JSON serialization
              },
              username,
              userImage: ensAvatar,
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            console.error('Failed to store credential on Renown Switchboard:', errorData)
            throw new Error(errorData.error || 'Failed to store credential')
          }

          // Capture the user document ID from the response (this is the profile ID)
          const result = await response.json()
          if (result.userDocumentId) {
            setUserDocId(result.userDocumentId)
          }

          // Store the credential ID locally for session tracking
          setJwt(credential.id)
          return credential.id
        } catch (e) {
          console.error('Error storing credential on Renown Switchboard:', e)
          throw e
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        setError(error)
        console.error('Login failed:', error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [walletClient, address, chainId, setJwt, setUserDocId],
  )

  /**
   * Logout and clear JWT
   */
  const logout = useCallback(
    async () => {
      // Revoke on Renown Switchboard if we have a credential and an address
      if (jwt && address) {
        try {
          const response = await fetch('/api/credential/renown', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              credentialId: jwt,
              address,
              reason: 'User logged out',
            }),
          })

          if (!response.ok) {
            const responseData = await response.json();
            console.error('Failed to revoke credential on Renown Switchboard', responseData)
          }
        } catch (e) {
          console.error('Error revoking credential on Renown Switchboard:', e)
        }
      }

      setJwt(null)
      setUserDocId(null)
      setError(null)
    },
    [jwt, address, setJwt, setUserDocId],
  )

  /**
   * Refresh the credential
   */
  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!walletClient || !address) {
      return null
    }

    try {
      setIsLoading(true)

      // Create new EIP-712 Verifiable Credential
      const { credential, signature, domain } = await createEIP712Credential({
        walletClient,
        chainId,
        app: 'renown-app',
        appId: undefined,
        expiresInDays: 7,
      })

      // Store the credential on Renown Switchboard
      const response = await fetch('/api/credential/renown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential,
          signature,
          domain: {
            ...domain,
            chainId: Number(domain.chainId), // Convert BigInt to number for JSON serialization
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to refresh credential')
      }

      const result = await response.json()
      if (result.userDocumentId) {
        setUserDocId(result.userDocumentId)
      }

      setJwt(credential.id)
      return credential.id
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      setError(error)
      console.error('Credential refresh failed:', error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [walletClient, address, chainId, setJwt, setUserDocId])

  return useMemo(
    () => ({
      jwt,
      did,
      userDocId,
      isAuthenticated,
      isLoading,
      error,
      login,
      logout,
      refreshToken,
    }),
    [jwt, did, userDocId, isAuthenticated, isLoading, error, login, logout, refreshToken],
  )
}
