import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useEnsAvatar, useEnsName } from "wagmi";
import { revokedAddressAtom, useAuth } from "./auth";
import { useCredential } from "./credential";
import { useAuthBusy, useAuthInitializing, useSession } from "./use-wallet-adapter";
import { useAutoSignCredential } from "./use-auto-sign-credential";

/**
 * Tagged union of the paint states the console authorization flow can be in.
 * Owning this here (instead of derived booleans in the view) keeps invalid
 * combinations unrepresentable and mirrors the structure of `useAuthFlow`.
 */
export type ConsoleAuthFlowView =
    | { kind: "invalid-link" }
    | { kind: "loading" }
    | { kind: "pre-login" }
    | { kind: "needs-authorization"; ensName: string | null; ensAvatar: string | null }
    | { kind: "completed" }
    | { kind: "error"; message: string };

export interface ConsoleAuthFlowResult {
    view: ConsoleAuthFlowView;
    title: string;
    subtitle: string;
    address?: string;
    ensName?: string | null;
    ensAvatar?: string | null;
    userDocId?: string | null;
    sessionId: string;
    connectDid?: string;
    disconnect: () => void;
}

interface UseConsoleAuthFlowArgs {
    sessionId: string;
    connectDid?: string;
}

export function useConsoleAuthFlow({ sessionId, connectDid }: UseConsoleAuthFlowArgs): ConsoleAuthFlowResult {
    const session = useSession();
    const address = session?.address;
    const chainId = session?.chainId ?? 1;
    const autoSign = session?.autoSign ?? false;

    const { data: ensName } = useEnsName({ address });
    const { data: ensAvatar } = useEnsAvatar({ name: ensName ?? undefined });

    const {
        credential,
        hasCredential,
        loading: credentialLoading,
        initializing: credentialInitializing,
        createCredential,
    } = useCredential(connectDid ?? "");
    const { userDocId, did, signOut } = useAuth(connectDid);

    const authBusy = useAuthBusy();
    const authInitializing = useAuthInitializing();
    const revokedAddress = useAtomValue(revokedAddressAtom);
    const justRevoked = !!address && revokedAddress === address;

    const { autoFailedForCurrentAddress } = useAutoSignCredential({
        address,
        autoSign,
        initializing: credentialInitializing,
        hasCredential,
        loading: credentialLoading,
        justRevoked,
        createCredential,
        ensName,
        ensAvatar,
    });

    const isAutoSigning =
        !!address && autoSign && !hasCredential && !autoFailedForCurrentAddress && !justRevoked;

    // Tying completion state to a key derived from address+connectDid means a
    // wallet switch or disconnect invalidates the record without needing an
    // effect to reset it — the derived `sessionCompleted`/`completionError`
    // below simply stop matching.
    const completionKey = `${address ?? ""}:${connectDid ?? ""}`;
    const [completionRecord, setCompletionRecord] = useState<{
        key: string;
        completed: boolean;
        error: string | null;
    }>({ key: "", completed: false, error: null });

    const sessionCompleted =
        completionRecord.key === completionKey && completionRecord.completed;
    const completionError =
        completionRecord.key === completionKey ? completionRecord.error : null;

    // Hand the freshly minted credential off to the CLI session backend.
    // Fires once `useCredential(connectDid)` reports a credential is present
    // — regardless of whether it was created via the manual button or by
    // the auto-sign hook above.
    useEffect(() => {
        if (
            !connectDid ||
            !hasCredential ||
            !credential ||
            !address ||
            !did ||
            sessionCompleted ||
            completionError
        ) {
            return;
        }

        let cancelled = false;
        void (async () => {
            try {
                const response = await fetch(`/api/console/session/${sessionId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        address,
                        chainId,
                        did,
                        credentialId: credential,
                        userDocumentId: userDocId,
                        connectDid,
                    }),
                });

                if (cancelled) return;

                if (response.ok) {
                    setCompletionRecord({ key: completionKey, completed: true, error: null });
                } else {
                    const data = await response.json().catch(() => ({}));
                    setCompletionRecord({
                        key: completionKey,
                        completed: false,
                        error: data.error || "Failed to complete session",
                    });
                }
            } catch (e) {
                if (cancelled) return;
                console.error("Failed to complete console session:", e);
                setCompletionRecord({
                    key: completionKey,
                    completed: false,
                    error: "Failed to communicate with server",
                });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        connectDid,
        hasCredential,
        credential,
        address,
        chainId,
        did,
        userDocId,
        sessionId,
        completionKey,
        sessionCompleted,
        completionError,
    ]);

    const disconnect = useCallback(() => {
        void signOut();
    }, [signOut]);

    const view = useMemo<ConsoleAuthFlowView>(() => {
        if (!connectDid) return { kind: "invalid-link" };
        if (authInitializing || authBusy) return { kind: "loading" };
        if (!address) return { kind: "pre-login" };
        if (isAutoSigning) return { kind: "loading" };
        if (credentialInitializing) return { kind: "loading" };
        if (!hasCredential) {
            return {
                kind: "needs-authorization",
                ensName: ensName ?? null,
                ensAvatar: ensAvatar ?? null,
            };
        }
        if (completionError) return { kind: "error", message: completionError };
        if (sessionCompleted) return { kind: "completed" };
        // hasCredential is true but the session PUT hasn't resolved yet.
        return { kind: "loading" };
    }, [
        connectDid,
        authInitializing,
        authBusy,
        address,
        isAutoSigning,
        credentialInitializing,
        hasCredential,
        ensName,
        ensAvatar,
        completionError,
        sessionCompleted,
    ]);

    const { title, subtitle } = useMemo(() => {
        switch (view.kind) {
            case "invalid-link":
                return {
                    title: "Invalid Login Link",
                    subtitle: "This console session is missing the CLI identity. Please run ph login again to start a new session.",
                };
            case "loading":
                return {
                    title: "Signing you in",
                    subtitle: "Hang tight while we finish setting up your session.",
                };
            case "pre-login":
                return {
                    title: "Authorize CLI",
                    subtitle: "Authorize the Powerhouse CLI to sign actions on your behalf using your identity.",
                };
            case "needs-authorization":
                return {
                    title: "Confirm Authorization",
                    subtitle: "Authorize the Powerhouse CLI to sign actions on your behalf using your identity.",
                };
            case "completed":
                return {
                    title: "Authorization Complete",
                    subtitle: "You can now close this window and return to your terminal.",
                };
            case "error":
                return {
                    title: "Something went wrong",
                    subtitle: view.message,
                };
        }
    }, [view]);

    return {
        view,
        title,
        subtitle,
        address,
        ensName: ensName ?? null,
        ensAvatar: ensAvatar ?? null,
        userDocId: userDocId ?? null,
        sessionId,
        connectDid,
        disconnect,
    };
}
