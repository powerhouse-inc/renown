import { useState, useMemo, useCallback } from "react";
import { useAtom } from "jotai";
import { revokedAddressAtom, useAuth } from "./auth";
import { useSession } from "./use-wallet-adapter";

interface CreateCredentialOptions {
    ensName?: string | null;
    ensAvatar?: string | null;
}

interface ICredential {
    credential: string | undefined;
    isAuth: boolean;
    hasCredential: boolean;
    loading: boolean;
    /** True while the initial credential fetch for the current session has not yet completed. */
    initializing: boolean;
    createCredential: (options?: CreateCredentialOptions) => Promise<string | undefined>;
    revokeCredential: () => Promise<void>;
}

/**
 * @param expiresInDays Validity of credentials this hook issues; the
 * orchestrator's 7-day default when unset.
 */
export function useCredential(appId: string, returnUrl?: string, expiresInDays?: number): ICredential {
    const session = useSession();
    const { jwt, isAuthenticated, login, logout, isLoading: authLoading, isFetchingCredential } = useAuth(appId);
    const credential = jwt ?? undefined;
    const [isFetching, setIsFetching] = useState(false);
    const [, setRevokedAddress] = useAtom(revokedAddressAtom);

    const createCredential = useCallback(
        async (appId: string, returnUrl?: string, options?: CreateCredentialOptions) => {
            setIsFetching(true);
            try {
                const jwtToken = await login({
                    appId,
                    returnUrl,
                    ensName: options?.ensName,
                    ensAvatar: options?.ensAvatar,
                    expiresInDays,
                });
                return jwtToken;
            } catch (e) {
                console.error("Failed to create credential:", e);
            } finally {
                setIsFetching(false);
            }
        },
        [login, expiresInDays]
    );

    // Rejects when the revocation didn't happen (RevokeSignatureRejectedError
    // for a declined signature, or the Renown API's refusal); the credential
    // is then still active.
    const revokeCredential = useCallback(async () => {
        if (!jwt) {
            return;
        }
        await logout();
        // Mark this address as just-revoked so the auto-sign effect in the
        // web flow won't immediately recreate a credential for the same
        // session. Cleared by signOut (Disconnect) or page refresh.
        if (session?.address) setRevokedAddress(session.address);
    }, [
        logout,
        jwt,
        session,
        setRevokedAddress,
    ]);

    return useMemo(
        () => ({
            credential,
            isAuth: isAuthenticated,
            hasCredential: !!credential,
            loading: isFetching || authLoading,
            initializing: isFetchingCredential,
            createCredential: (options?: CreateCredentialOptions) => {
                if (!session?.address) {
                    throw new Error("Address is not set");
                }
                return createCredential(appId, returnUrl, options);
            },
            revokeCredential,
        }),
        [
            credential,
            isAuthenticated,
            isFetching,
            authLoading,
            isFetchingCredential,
            revokeCredential,
            session?.address,
            createCredential,
            appId,
            returnUrl,
        ]
    );
}
