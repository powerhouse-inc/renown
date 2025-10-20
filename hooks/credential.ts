import { useEffect, useState, useMemo, useCallback } from "react";
import { useAccount, useChainId } from "wagmi";
import { atom, useAtom } from "jotai";
import { useAuth } from "./auth";

interface ICredential {
    credential: string | undefined; // Now stores JWT instead of VC
    isAuth: boolean;
    hasCredential: boolean;
    loading: boolean;
    createCredential: () => Promise<string | undefined>;
    revokeCredential: () => Promise<void>;
}

const credentialAtom = atom<string | undefined>(undefined);

export function useCredential(connectId: string, returnUrl?: string): ICredential {
    const { address } = useAccount();
    const chainId = useChainId();
    const { jwt, isAuthenticated, login, logout, isLoading: authLoading } = useAuth();
    const [credential, setCredential] = useAtom<string | undefined>(credentialAtom);
    const [state, setState] = useState<
        "INITIAL" | "FETCHING_CREDENTIAL" | "ERROR" | "SUCCESS"
    >(credential ? "SUCCESS" : "INITIAL");

    // Sync JWT from useAuth to local credential state
    useEffect(() => {
        if (jwt) {
            setCredential(jwt);
            setState("SUCCESS");
        } else {
            setCredential(undefined);
            setState("INITIAL");
        }
    }, [jwt, setCredential]);

    const createCredential = useCallback(
        async (address: `0x${string}`, chainId: number, connectId: string, returnUrl?: string) => {
            setState("FETCHING_CREDENTIAL");
            try {
                // Use the JWT authentication system
                const jwtToken = await login(connectId, undefined, undefined, returnUrl);
                setCredential(jwtToken);
                setState("SUCCESS");
                return jwtToken;
            } catch (e) {
                console.error("Failed to create credential:", e);
                setState("ERROR");
            }
        },
        [login, setCredential]
    );

    const revokeCredential = useCallback(async () => {
        try {
            if (!jwt) {
                return;
            }
            await logout();
            // Don't manually clear credential here - let the useEffect handle it
            // when jwt becomes null, to avoid race conditions
        } catch (e) {
            console.error('Failed to revoke credential:', e);
            setState("ERROR");
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
            loading: state === "FETCHING_CREDENTIAL" || authLoading,
            createCredential: () => {
                if (!address) {
                    throw new Error("Address is not set");
                }
                return createCredential(address, chainId, connectId, returnUrl);
            },
            revokeCredential,
        }),
        [
            credential,
            isAuthenticated,
            state,
            authLoading,
            revokeCredential,
            address,
            createCredential,
            chainId,
            connectId,
            returnUrl,
        ]
    );
}
