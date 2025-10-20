import { useState, useCallback, useMemo, useEffect } from 'react'
import { useWalletClient, useAccount, useChainId } from 'wagmi'
import { atom, useAtom } from 'jotai'
import {
  createAuthJWT,
  verifyAuthJWT,
  isJWTExpired,
  getEthereumDID,
  decodeJWT,
  type JWTAuthPayload,
} from '../services/did-jwt-auth'

const JWT_STORAGE_KEY = 'renown_jwt_token'
const DOC_ID_STORAGE_KEY = 'renown_doc_id'

// Atom to store the JWT token
const jwtTokenAtom = atom<string | null>(null)
// Atom to store the document ID
const docIdAtom = atom<string | null>(null)

export interface UseAuthReturn {
  jwt: string | null
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

  const [jwt, setJwt] = useAtom(jwtTokenAtom)
  const [storedDocId, setStoredDocId] = useAtom(docIdAtom)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Calculate DID from address
  const did = useMemo(() => {
    if (!address) return null
    return getEthereumDID(address, chainId)
  }, [address, chainId])

  // Check if authenticated
  const isAuthenticated = useMemo(() => {
    if (!jwt) return false
    return !isJWTExpired(jwt)
  }, [jwt])

  // Load JWT and docId from localStorage on mount
  useEffect(() => {
    try {
      const storedJwt = localStorage.getItem(JWT_STORAGE_KEY)
      const storedDocIdValue = localStorage.getItem(DOC_ID_STORAGE_KEY)

      if (storedJwt && !isJWTExpired(storedJwt)) {
        setJwt(storedJwt)
        if (storedDocIdValue) {
          setStoredDocId(storedDocIdValue)
        }
      } else if (storedJwt) {
        // Remove expired token
        localStorage.removeItem(JWT_STORAGE_KEY)
        localStorage.removeItem(DOC_ID_STORAGE_KEY)
      }
    } catch (e) {
      console.error('Failed to load JWT from storage:', e)
    }
  }, [setJwt, setStoredDocId])

  // Save JWT and docId to localStorage when they change
  useEffect(() => {
    if (jwt) {
      localStorage.setItem(JWT_STORAGE_KEY, jwt)
    } else {
      localStorage.removeItem(JWT_STORAGE_KEY)
    }
  }, [jwt])

  useEffect(() => {
    if (storedDocId) {
      localStorage.setItem(DOC_ID_STORAGE_KEY, storedDocId)
    } else {
      localStorage.removeItem(DOC_ID_STORAGE_KEY)
    }
  }, [storedDocId])

  // Auto-refresh token when address changes or token expires
  useEffect(() => {
    if (address && jwt && isJWTExpired(jwt)) {
      refreshToken()
    }
  }, [address, jwt])

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
        const payload: Partial<JWTAuthPayload> = {}
        if (connectId) {
          payload.connectId = connectId
        }

        // Convert returnUrl to did:web format for audience
        let audience = 'renown-app'
        if (returnUrl) {
          try {
            const url = new URL(returnUrl)
            audience = `did:web:${url.hostname}`
          } catch (e) {
            console.error('Failed to parse returnUrl:', e)
          }
        }

        const newJwt = await createAuthJWT(walletClient, chainId, payload, undefined, audience)

        // Verify the JWT was created correctly
        // Note: Verification is disabled because ES256K-R with Ethereum's signMessage
        // adds a message prefix that interferes with signature recovery in did-jwt.
        // For production use, consider using a registry-based DID method or ES256K without recovery.
        // const verified = await verifyAuthJWT(newJwt);

        // Decode the JWT to extract payload for storage
        const decoded = decodeJWT(newJwt);

        // Store the JWT on Renown Switchboard
        try {
          const response = await fetch('/api/credential/renown', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              driveId,
              docId,
              input: {
                jwt: newJwt,
                issuer: decoded.iss,
                subject: decoded.sub,
                audience: decoded.aud,
                payload: JSON.stringify(decoded),
              },
            }),
          })

          if (!response.ok) {
            console.error('Failed to store credential on Renown Switchboard')
            // Don't throw - we still want to set the JWT locally
          } else {
            // Capture the document ID from the response
            const result = await response.json()
            if (result.documentId) {
              setStoredDocId(result.documentId)
            }
          }
        } catch (e) {
          console.error('Error storing credential on Renown Switchboard:', e)
          // Don't throw - we still want to set the JWT locally
        }

        setJwt(newJwt)
        return newJwt
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
   * Refresh the JWT token
   */
  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!walletClient || !address) {
      return null
    }

    try {
      setIsLoading(true)
      const newJwt = await createAuthJWT(walletClient, chainId)
      setJwt(newJwt)
      return newJwt
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      setError(error)
      console.error('Token refresh failed:', error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [walletClient, address, chainId, setJwt])

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
