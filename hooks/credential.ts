import { useState, useMemo, useCallback } from "react";
import { useAuth } from "./auth";
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

export function useCredential(appId: string, returnUrl?: string): ICredential {
    const session = useSession();
    const { jwt, isAuthenticated, login, logout, isLoading: authLoading, isFetchingCredential } = useAuth(appId);
    const credential = jwt ?? undefined;
    const [isFetching, setIsFetching] = useState(false);

    const createCredential = useCallback(
        async (appId: string, returnUrl?: string, options?: CreateCredentialOptions) => {
            setIsFetching(true);
            try {
                const jwtToken = await login({
                    appId,
                    returnUrl,
                    ensName: options?.ensName,
                    ensAvatar: options?.ensAvatar,
                });
                return jwtToken;
            } catch (e) {
                console.error("Failed to create credential:", e);
            } finally {
                setIsFetching(false);
            }
        },
        [login]
    );

    const revokeCredential = useCallback(async () => {
        try {
            if (!jwt) {
                return;
            }
            await logout();
        } catch (e) {
            console.error('Failed to revoke credential:', e);
        }
    }, [
        logout,
        jwt,
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
