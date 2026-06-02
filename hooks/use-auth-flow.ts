import { useCallback, useMemo } from "react";
import { useAtomValue } from "jotai";
import { useEnsAvatar, useEnsName } from "wagmi";
import { revokedAddressAtom, useAuth } from "./auth";
import { useCredential } from "./credential";
import { useCredentialReady } from "./use-credential-ready";
import { useAuthBusy, useAuthInitializing, useSession } from "./use-wallet-adapter";
import { useAutoSignCredential } from "./use-auto-sign-credential";
import { useOpenPanelAnalytics, ANALYTICS_EVENTS } from "../services/analytics";

/**
 * Tagged union of the four paint states the web authorization flow can be in.
 * Owning this here (instead of derived booleans in the view) makes invalid
 * combinations unrepresentable — e.g. you cannot render the credential view
 * while a session is still being restored.
 */
export type AuthFlowView =
    | { kind: "loading" }
    | { kind: "pre-login" }
    | { kind: "needs-authorization"; ensName: string | null; ensAvatar: string | null }
    | { kind: "authorized"; redirectUrl: string; credentialReady: boolean };

export interface AuthFlowResult {
    view: AuthFlowView;
    title: string;
    subtitle: string;
    /** Set whenever a session is established (regardless of credential state). */
    address?: string;
    ensName?: string | null;
    ensAvatar?: string | null;
    userDocId?: string | null;
    disconnect: () => void;
}

interface UseAuthFlowArgs {
    appId: string;
    returnUrl?: string;
    deeplink?: string;
}

function buildRedirectUrl(args: {
    address: string;
    chainId: number;
    deeplink?: string;
    returnUrl?: string;
}): string {
    const { address, chainId, deeplink, returnUrl } = args;
    const user = encodeURIComponent(`did:pkh:eip155:${chainId}:${address.toLowerCase()}`);
    if (deeplink) return `${deeplink}://login/${user}`;
    const url = new URL(returnUrl ?? "");
    url.searchParams.set("user", user);
    return url.toString();
}

export function useAuthFlow({ appId, returnUrl, deeplink }: UseAuthFlowArgs): AuthFlowResult {
    const session = useSession();
    const address = session?.address;
    const chainId = session?.chainId ?? 1;
    const autoSign = session?.autoSign ?? false;

    const { data: ensName } = useEnsName({ address });
    const { data: ensAvatar } = useEnsAvatar({ name: ensName ?? undefined });

    const { hasCredential, loading: credentialLoading, initializing: credentialInitializing, createCredential } =
        useCredential(appId, returnUrl);
    const { userDocId, signOut } = useAuth(appId);
    const { track } = useOpenPanelAnalytics();
    const credentialReady = useCredentialReady(address, chainId, appId, hasCredential);

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

    const disconnect = useCallback(() => {
        track(ANALYTICS_EVENTS.signOut, { appId, flow: "web" });
        void signOut();
    }, [signOut, track, appId]);

    const view = useMemo<AuthFlowView>(() => {
        // Order matters: the loading branch dominates so we never render a
        // post-login view before the adapter and credential layers have both
        // settled.
        if (authInitializing || authBusy || isAutoSigning) return { kind: "loading" };
        if (!address) return { kind: "pre-login" };
        // Wagmi flow (autoSign=false) reaches here after `useAuth` finishes the
        // initial credential probe — `credentialInitializing` gates against the
        // brief window where `hasCredential` is still false because the probe
        // hasn't resolved yet.
        if (credentialInitializing) return { kind: "loading" };
        if (!hasCredential) {
            return {
                kind: "needs-authorization",
                ensName: ensName ?? null,
                ensAvatar: ensAvatar ?? null,
            };
        }
        return {
            kind: "authorized",
            redirectUrl: buildRedirectUrl({ address, chainId, deeplink, returnUrl }),
            credentialReady,
        };
    }, [
        authInitializing,
        authBusy,
        isAutoSigning,
        address,
        credentialInitializing,
        hasCredential,
        ensName,
        ensAvatar,
        chainId,
        deeplink,
        returnUrl,
        credentialReady,
    ]);

    const { title, subtitle } = useMemo(() => {
        const appName = returnUrl ? safeHostname(returnUrl) : "this app";
        switch (view.kind) {
            case "loading":
                return {
                    title: "Signing you in",
                    subtitle: "Hang tight while we finish setting up your session.",
                };
            case "pre-login":
                return {
                    title: "Connect Wallet",
                    subtitle: `Authorize ${appName} to sign actions on your behalf using your identity.`,
                };
            case "needs-authorization":
            case "authorized":
                return {
                    title: "Confirm Authorization",
                    subtitle: `Authorize ${appName} to sign actions on your behalf using your identity.`,
                };
        }
    }, [view.kind, returnUrl]);

    return {
        view,
        title,
        subtitle,
        address,
        ensName: ensName ?? null,
        ensAvatar: ensAvatar ?? null,
        userDocId: userDocId ?? null,
        disconnect,
    };
}

function safeHostname(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return "this app";
    }
}
