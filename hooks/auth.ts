import { useState, useCallback, useMemo, useEffect } from "react";
import { useWalletClient, useAccount, useChainId } from "wagmi";
import { atom, useAtom } from "jotai";
import {
  createAuthJWT,
  verifyAuthJWT,
  isJWTExpired,
  getEthereumDID,
  type JWTAuthPayload,
} from "../services/did-jwt-auth";

const JWT_STORAGE_KEY = "renown_jwt_token";

// Atom to store the JWT token
const jwtTokenAtom = atom<string | null>(null);

export interface UseAuthReturn {
  jwt: string | null;
  did: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
  login: (connectId?: string, driveId?: string, docId?: string) => Promise<string>;
  logout: (driveId?: string, docId?: string) => Promise<void>;
  refreshToken: () => Promise<string | null>;
}

export function useAuth(): UseAuthReturn {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const chainId = useChainId();

  const [jwt, setJwt] = useAtom(jwtTokenAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Calculate DID from address
  const did = useMemo(() => {
    if (!address) return null;
    return getEthereumDID(address, chainId);
  }, [address, chainId]);

  // Check if authenticated
  const isAuthenticated = useMemo(() => {
    if (!jwt) return false;
    return !isJWTExpired(jwt);
  }, [jwt]);

  // Load JWT from localStorage on mount
  useEffect(() => {
    try {
      const storedJwt = localStorage.getItem(JWT_STORAGE_KEY);
      if (storedJwt && !isJWTExpired(storedJwt)) {
        setJwt(storedJwt);
      } else if (storedJwt) {
        // Remove expired token
        localStorage.removeItem(JWT_STORAGE_KEY);
      }
    } catch (e) {
      console.error("Failed to load JWT from storage:", e);
    }
  }, [setJwt]);

  // Save JWT to localStorage when it changes
  useEffect(() => {
    if (jwt) {
      localStorage.setItem(JWT_STORAGE_KEY, jwt);
    } else {
      localStorage.removeItem(JWT_STORAGE_KEY);
    }
  }, [jwt]);

  // Auto-refresh token when address changes or token expires
  useEffect(() => {
    if (address && jwt && isJWTExpired(jwt)) {
      refreshToken();
    }
  }, [address, jwt]);

  /**
   * Login and create a new JWT
   */
  const login = useCallback(
    async (connectId?: string, driveId?: string, docId?: string): Promise<string> => {
      if (!walletClient || !address) {
        throw new Error("Wallet not connected");
      }

      setIsLoading(true);
      setError(null);

      try {
        const payload: Partial<JWTAuthPayload> = {};
        if (connectId) {
          payload.connectId = connectId;
        }

        const newJwt = await createAuthJWT(walletClient, chainId, payload);

        // Verify the JWT was created correctly
        const verified = await verifyAuthJWT(newJwt);

        // Store the JWT on Renown Switchboard
        try {
          const response = await fetch("/api/credential/renown", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              driveId,
              docId,
              input: {
                jwt: newJwt,
                issuer: verified.payload.iss,
                subject: verified.payload.sub,
                audience: verified.payload.aud,
                payload: JSON.stringify(verified.payload),
              },
            }),
          });

          if (!response.ok) {
            console.error("Failed to store credential on Renown Switchboard");
            // Don't throw - we still want to set the JWT locally
          }
        } catch (e) {
          console.error("Error storing credential on Renown Switchboard:", e);
          // Don't throw - we still want to set the JWT locally
        }

        setJwt(newJwt);
        return newJwt;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        setError(error);
        console.error("Login failed:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, chainId, setJwt]
  );

  /**
   * Logout and clear JWT
   */
  const logout = useCallback(async (driveId?: string, docId?: string) => {
    // Revoke on Renown Switchboard if we have a JWT
    if (jwt) {
      try {
        const response = await fetch("/api/credential/renown", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            driveId,
            docId,
            input: {
              jwt,
            },
          }),
        });

        if (!response.ok) {
          console.error("Failed to revoke credential on Renown Switchboard");
        }
      } catch (e) {
        console.error("Error revoking credential on Renown Switchboard:", e);
      }
    }

    setJwt(null);
    setError(null);
  }, [jwt, setJwt]);

  /**
   * Refresh the JWT token
   */
  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!walletClient || !address) {
      return null;
    }

    try {
      setIsLoading(true);
      const newJwt = await createAuthJWT(walletClient, chainId);
      setJwt(newJwt);
      return newJwt;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      setError(error);
      console.error("Token refresh failed:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, chainId, setJwt]);

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
    [jwt, did, isAuthenticated, isLoading, error, login, logout, refreshToken]
  );
}
