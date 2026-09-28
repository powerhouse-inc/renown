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

// A silent sign that never settles (a wallet waiting on a prompt nobody sees)
// falls back to the manual Confirm view after this long.
const AUTO_SIGN_TIMEOUT_MS = 30_000;

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
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

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


        // The attempt outlives this effect run: starting it flips `loading`,
        // which re-runs the effect, so its outcome must not be tied to the
        // run's cleanup — only to the component still being mounted.
        autoAttemptedRef.current = address;
        let settled = false;
        const fail = () => {
            if (settled || !mountedRef.current) return;
            settled = true;
            setAutoFailedFor(address);
        };
        const timeout = setTimeout(fail, AUTO_SIGN_TIMEOUT_MS);
        void createCredential({
            ensName: ensName ?? null,
            ensAvatar: ensAvatar ?? null,
        })
            .then((jwt) => {
                if (!jwt) fail();
                settled = true;
            })
            .catch(fail)
            .finally(() => clearTimeout(timeout));
    }, [address, autoSign, initializing, hasCredential, loading, autoFailedFor, justRevoked, createCredential, ensName, ensAvatar]);

    return { autoFailedForCurrentAddress: autoFailedFor === address };
}
