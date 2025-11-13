import { useState, useCallback, useMemo, useEffect } from 'react'
import { useWalletClient, useAccount, useChainId } from 'wagmi'
import { atom, useAtom } from 'jotai'
import { createEIP712Credential } from '../services/eip712-credential'

const CREDENTIAL_ID_STORAGE_KEY = 'renown_credential_id'
const DOC_ID_STORAGE_KEY = 'renown_doc_id'

// Atom to store the credential ID
const credentialIdAtom = atom<string | null>(null)
// Atom to store the document ID
const docIdAtom = atom<string | null>(null)

export interface UseAuthReturn {
  jwt: string | null // Legacy field name, now stores credentialId
  did: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: Error | null
  login: (connectId?: string, driveId?: string, docId?: string, returnUrl?: string) => Promise<string>
  logout: (driveId?: string, docId?: string) => Promise<void>
  refreshToken: () => Promise<string | null>
}

export function useAuth(): UseAuthReturn {
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()
  const chainId = useChainId()

  const [jwt, setJwt] = useAtom(credentialIdAtom) // jwt now stores credentialId
  const [storedDocId, setStoredDocId] = useAtom(docIdAtom)
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

  // Load credential ID and docId from localStorage on mount and validate with server
  useEffect(() => {
    const validateStoredCredential = async () => {
      try {
        const storedCredentialId = localStorage.getItem(CREDENTIAL_ID_STORAGE_KEY)
        const storedDocIdValue = localStorage.getItem(DOC_ID_STORAGE_KEY)

        if (!storedCredentialId || !address) {
          return
        }

        // Validate with server to check if credential is still valid and not revoked
        try {
          const response = await fetch(`/api/status/${encodeURIComponent(address)}`)

          if (response.ok) {
            const data = await response.json()

            // Check if credential is revoked
            if (data.revoked) {
              console.log('Stored credential has been revoked, removing from storage')
              localStorage.removeItem(CREDENTIAL_ID_STORAGE_KEY)
              localStorage.removeItem(DOC_ID_STORAGE_KEY)
              return
            }

            // Check if status is active
            if (data.status !== 'active') {
              console.log('Stored credential is not active, removing from storage')
              localStorage.removeItem(CREDENTIAL_ID_STORAGE_KEY)
              localStorage.removeItem(DOC_ID_STORAGE_KEY)
              return
            }

            // Credential is valid, set it
            setJwt(storedCredentialId)
            if (storedDocIdValue) {
              setStoredDocId(storedDocIdValue)
            }
            console.log('Stored credential is valid')
          } else if (response.status === 404) {
            // Credential not found on server
            console.log('Stored credential not found on server, removing from storage')
            localStorage.removeItem(CREDENTIAL_ID_STORAGE_KEY)
            localStorage.removeItem(DOC_ID_STORAGE_KEY)
          } else {
            // Server error - be lenient and use the credential anyway
            console.warn('Failed to validate credential with server, using stored credential anyway')
            setJwt(storedCredentialId)
            if (storedDocIdValue) {
              setStoredDocId(storedDocIdValue)
            }
          }
        } catch (e) {
          // Network error - be lenient and use the credential anyway
          console.warn('Failed to validate credential with server (network error), using stored credential anyway:', e)
          setJwt(storedCredentialId)
          if (storedDocIdValue) {
            setStoredDocId(storedDocIdValue)
          }
        }
      } catch (e) {
        console.error('Failed to load credential from storage:', e)
      }
    }

    validateStoredCredential()
  }, [address, setJwt, setStoredDocId])

  // Save credential ID and docId to localStorage when they change
  useEffect(() => {
    if (jwt) {
      localStorage.setItem(CREDENTIAL_ID_STORAGE_KEY, jwt)
    } else {
      localStorage.removeItem(CREDENTIAL_ID_STORAGE_KEY)
    }
  }, [jwt])

  useEffect(() => {
    if (storedDocId) {
      localStorage.setItem(DOC_ID_STORAGE_KEY, storedDocId)
    } else {
      localStorage.removeItem(DOC_ID_STORAGE_KEY)
    }
  }, [storedDocId])

  /**
   * Login and create a new JWT
   */
  const login = useCallback(
    async (connectId?: string, driveId?: string, docId?: string, returnUrl?: string): Promise<string> => {
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
          connectId,
          expiresInDays: 7,
        })

        // Store the credential on Renown Switchboard
        try {
          const response = await fetch('/api/credential/renown', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              driveId,
              docId,
              credential,
              signature,
              domain: {
                ...domain,
                chainId: Number(domain.chainId), // Convert BigInt to number for JSON serialization
              },
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            console.error('Failed to store credential on Renown Switchboard:', errorData)
            throw new Error(errorData.error || 'Failed to store credential')
          }

          // Capture the document ID from the response
          const result = await response.json()
          if (result.documentId) {
            setStoredDocId(result.documentId)
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
    [walletClient, address, chainId, setJwt, setStoredDocId],
  )

  /**
   * Logout and clear JWT
   */
  const logout = useCallback(
    async (driveId?: string, docId?: string) => {
      // Revoke on Renown Switchboard if we have a credential ID
      if (jwt && storedDocId) {
        try {
          const response = await fetch('/api/credential/renown', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              credentialId: storedDocId,
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
      setStoredDocId(null)
      setError(null)
    },
    [jwt, storedDocId, setJwt, setStoredDocId],
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
        connectId: undefined,
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
      if (result.documentId) {
        setStoredDocId(result.documentId)
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
  }, [walletClient, address, chainId, setJwt, setStoredDocId])

  return useMemo(
    () => ({
      jwt,
      did,
      isAuthenticated,
      isLoading,
      error,
      login,
      logout,
      refreshToken,
    }),
    [jwt, did, isAuthenticated, isLoading, error, login, logout, refreshToken],
  )
}
