import { useState, useMemo, useCallback } from "react";
import { useAccount } from "wagmi";
import { useAuth } from "./auth";

interface CreateCredentialOptions {
    ensName?: string | null;
    ensAvatar?: string | null;
}

interface ICredential {
    credential: string | undefined; // Now stores JWT instead of VC
    isAuth: boolean;
    hasCredential: boolean;
    loading: boolean;
    createCredential: (options?: CreateCredentialOptions) => Promise<string | undefined>;
    revokeCredential: () => Promise<void>;
}

export function useCredential(appId: string, returnUrl?: string): ICredential {
    const { address } = useAccount();
    const { jwt, isAuthenticated, login, logout, isLoading: authLoading } = useAuth(appId);
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
            createCredential: (options?: CreateCredentialOptions) => {
                if (!address) {
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
            revokeCredential,
            address,
            createCredential,
            appId,
            returnUrl,
        ]
    );
}
