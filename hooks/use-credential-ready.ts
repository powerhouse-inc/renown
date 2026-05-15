import { useEffect, useState } from "react";

export function useCredentialReady(
    address: string | undefined,
    chainId: number,
    connectId: string,
    hasCredential: boolean,
): boolean {
    const sessionKey = hasCredential && address ? `${address}:${chainId}:${connectId}` : null;
    const [readyKey, setReadyKey] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionKey || !address) return;

        let cancelled = false;
        const controller = new AbortController();

        const poll = async () => {
            const maxAttempts = 20;
            const delayMs = 500;

            for (let i = 0; i < maxAttempts; i++) {
                if (cancelled) return;
                try {
                    const params = new URLSearchParams({ address, chainId: String(chainId), connectId });
                    const res = await fetch(`/api/auth/credential?${params}`, { signal: controller.signal });
                    if (res.ok) { if (!cancelled) setReadyKey(sessionKey); return; }
                } catch { if (cancelled) return; }
                await new Promise((r) => setTimeout(r, delayMs));
            }
            if (!cancelled) setReadyKey(sessionKey);
        };

        poll();
        return () => { cancelled = true; controller.abort(); };
    }, [sessionKey, address, chainId, connectId]);

    return sessionKey !== null && readyKey === sessionKey;
}
