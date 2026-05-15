import { useEffect, useRef, useState } from "react";

interface CreateCredentialOptions {
    ensName?: string | null;
    ensAvatar?: string | null;
}

interface UseAutoSignCredentialArgs {
    address: string | undefined;
    autoSign: boolean;
    initializing: boolean;
    hasCredential: boolean;
    loading: boolean;
    justRevoked: boolean;
    createCredential: (options?: CreateCredentialOptions) => Promise<string | undefined>;
    ensName: string | null | undefined;
    ensAvatar: string | null | undefined;
}

// Tracks per-address auto-sign state so we never fire twice and can fall
// back to the manual Confirm view if Privy's silent sign fails. Both
// values are address-scoped, so a different address naturally bypasses
// them without an explicit reset.
export function useAutoSignCredential({
    address,
    autoSign,
    initializing,
    hasCredential,
    loading,
    justRevoked,
    createCredential,
    ensName,
    ensAvatar,
}: UseAutoSignCredentialArgs): { autoFailedForCurrentAddress: boolean } {
    const autoAttemptedRef = useRef<string | null>(null);
    const [autoFailedFor, setAutoFailedFor] = useState<string | null>(null);

    useEffect(() => {
        if (
            !address ||
            !autoSign ||
            initializing ||
            hasCredential ||
            loading ||
            autoAttemptedRef.current === address ||
            autoFailedFor === address ||
            justRevoked
        ) return;


        autoAttemptedRef.current = address;
        let cancelled = false;
        void createCredential({
            ensName: ensName ?? null,
            ensAvatar: ensAvatar ?? null,
        }).then((jwt) => {
            if (cancelled) return;
            if (!jwt) setAutoFailedFor(address);
        });
        return () => {
            cancelled = true;
        };
    }, [address, autoSign, initializing, hasCredential, loading, autoFailedFor, justRevoked, createCredential, ensName, ensAvatar]);

    return { autoFailedForCurrentAddress: autoFailedFor === address };
}
