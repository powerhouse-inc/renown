import { useCallback, useEffect, useMemo, useState } from "react";
import { useEnsAvatar, useEnsName } from "wagmi";
import { useAuth } from "./auth";
import { useCredential } from "./credential";
import { useAuthBusy, useAuthInitializing, useSession } from "./use-wallet-adapter";
import { useOpenPanelAnalytics, ANALYTICS_EVENTS } from "../services/analytics";
import { DEFAULT_CREDENTIAL_VALIDITY_DAYS } from "../utils/credential-validity";

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
    /** Validity of the credential this flow issues; defaults to 7 days. */
    expiresInDays?: number;
    /** The session's label, signed into the credential as its `app`. */
    label?: string;
    /** The host the session is for, when the link names one. */
    host?: string;
}

/** The titles of each view, for a link with or without a label and a host. */
function consoleTitles(view: ConsoleAuthFlowView, label?: string, host?: string): { title: string; subtitle: string } {
    const asking = host
        ? `${label ? `"${label}"` : "A session"} on ${host} asks to sign document changes as you.`
        : label
          ? `"${label}" asks to sign actions on your behalf using your identity.`
          : "Authorize the Powerhouse CLI to sign actions on your behalf using your identity.";
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
                title: host ? "Approve a host session" : label ? `Authorize ${label}` : "Authorize CLI",
                subtitle: asking,
            };
        case "needs-authorization":
            return {
                title: host ? "Approve this session?" : "Confirm Authorization",
                subtitle: asking,
            };
        case "completed":
            return {
                title: host ? "Session Approved" : "Authorization Complete",
                subtitle: host
                    ? "The host will pick up your approval. You can close this window."
                    : "You can now close this window and return to your terminal.",
            };
        case "error":
            return {
                title: "Something went wrong",
                subtitle: view.message,
            };
    }
}

export function useConsoleAuthFlow({
    sessionId,
    connectDid,
    expiresInDays = DEFAULT_CREDENTIAL_VALIDITY_DAYS,
    label,
    host,
}: UseConsoleAuthFlowArgs): ConsoleAuthFlowResult {
    const session = useSession();
    const address = session?.address;
    const chainId = session?.chainId ?? 1;

    const { data: ensName } = useEnsName({ address });
    const { data: ensAvatar } = useEnsAvatar({ name: ensName ?? undefined });

    // A console link is never signed silently, whatever the wallet allows:
    // anyone can send one, and signing it hands that key the right to act as
    // the user. The user confirms on the authorization view.
    const {
        credential,
        hasCredential,
        initializing: credentialInitializing,
    } = useCredential(connectDid ?? "", undefined, expiresInDays, label);
    const { userDocId, did, signOut } = useAuth(connectDid);

    const { track } = useOpenPanelAnalytics();
    const authBusy = useAuthBusy();
    const authInitializing = useAuthInitializing();

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
    // Fires once `useCredential(connectDid)` reports a credential is present:
    // one the user just confirmed, or one they confirmed for this key before.
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
                    track(ANALYTICS_EVENTS.consoleCompleted, { connectDid });
                    setCompletionRecord({ key: completionKey, completed: true, error: null });
                } else {
                    const data = await response.json().catch(() => ({}));
                    track(ANALYTICS_EVENTS.consoleFailed, { connectDid });
                    setCompletionRecord({
                        key: completionKey,
                        completed: false,
                        error: data.error || "Failed to complete session",
                    });
                }
            } catch (e) {
                if (cancelled) return;
                console.error("Failed to complete console session:", e);
                track(ANALYTICS_EVENTS.consoleFailed, { connectDid });
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
        track,
    ]);

    const disconnect = useCallback(() => {
        track(ANALYTICS_EVENTS.signOut, { flow: "console" });
        void signOut();
    }, [signOut, track]);

    const view = useMemo<ConsoleAuthFlowView>(() => {
        if (!connectDid) return { kind: "invalid-link" };
        if (authInitializing || authBusy) return { kind: "loading" };
        if (!address) return { kind: "pre-login" };
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
        credentialInitializing,
        hasCredential,
        ensName,
        ensAvatar,
        completionError,
        sessionCompleted,
    ]);

    const { title, subtitle } = useMemo(() => consoleTitles(view, label, host), [view, label, host]);

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
