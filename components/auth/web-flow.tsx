"use client";

import { useEnsName, useEnsAvatar } from "wagmi";
import Image from "next/image";
import { useAtomValue } from "jotai";
import IconConnectWhite from "../../assets/icons/connect-white.svg";
import Button from "../ui/button";
import { useCredential } from "../../hooks/credential";
import { revokedAddressAtom, useAuth } from "../../hooks/auth";
import { useAuthBusy, useSession } from "../../hooks/use-wallet-adapter";
import { ConfirmAuthorization } from "./confirm-authorization";
import Credential from "./credential";
import { LoginButtons } from "./login-buttons";
import RenownCard from "../ui/renown-card";
import AppCard from "../ui/app-card";
import { useState, useEffect, useCallback, useRef } from "react";

interface IProps {
    appId: string;
    deeplink?: string;
    returnUrl?: string;
}

const connectUrl = process.env.NEXT_PUBLIC_CONNECT_URL;

function buildUrl(returnUrl: string, user: string) {
    const url = new URL(returnUrl);
    url.searchParams.set("user", user);
    return url.toString();
}

function useCredentialReady(address: string | undefined, chainId: number, connectId: string, hasCredential: boolean) {
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

// Skeleton block that mirrors the rough vertical rhythm of the login-button
// stack so the card height stays stable while we wait for auth state.
function LoadingBody() {
    return (
        <div className="flex flex-col w-full gap-3" aria-busy="true" aria-live="polite">
            <div className="rounded-xl p-4 bg-secondary flex gap-3 w-full mb-3 animate-pulse">
                <div className="w-9 h-9 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/2 rounded bg-muted" />
                    <div className="h-3 w-1/3 rounded bg-muted" />
                </div>
            </div>
            <div className="h-11 w-full rounded-md bg-muted animate-pulse" />
            <div className="h-11 w-full rounded-md bg-muted/70 animate-pulse" />
            <p className="mt-2 text-center text-sm text-muted-foreground animate-pulse">
                Signing you in&hellip;
            </p>
        </div>
    );
}

export const WebFlow: React.FC<IProps> = ({
    appId,
    deeplink,
    returnUrl = connectUrl,
}) => {
    const session = useSession();
    const address = session?.address;
    const chainId = session?.chainId ?? 1;
    const autoSign = session?.autoSign ?? false;
    const { data: ensName } = useEnsName({ address });
    const { data: ensAvatar } = useEnsAvatar({ name: ensName ?? undefined });
    const { hasCredential, loading, initializing, createCredential } = useCredential(appId, returnUrl);
    const { userDocId, signOut } = useAuth(appId);
    const credentialReady = useCredentialReady(address, chainId, appId, hasCredential);
    const authBusy = useAuthBusy();
    const revokedAddress = useAtomValue(revokedAddressAtom);
    const justRevoked = !!address && revokedAddress === address;

    // Tracks per-address auto-sign state so we never fire twice and can fall
    // back to the manual Confirm view if Privy's silent sign fails. Both
    // values are address-scoped, so a different address naturally bypasses
    // them without an explicit reset.
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

    const disconnect = useCallback(() => {
        void signOut();
    }, [signOut]);

    const user = (address && hasCredential)
        ? encodeURIComponent(`did:pkh:eip155:${chainId}:${address.toLowerCase()}`)
        : "";

    const url = deeplink
        ? `${deeplink}://login/${user}`
        : buildUrl(returnUrl ?? "", user);

    // Show the loading body while:
    //   - an adapter is provisioning a session (Privy authenticated → wallet pending), or
    //   - we're auto-signing on behalf of a provider-managed wallet and haven't
    //     either succeeded (hasCredential) or fallen back to manual (autoFailedFor).
    // Wagmi (autoSign=false) never enters the auto-sign branch, so its flow is
    // unchanged.
    const isAutoSigning =
        !!address &&
        autoSign &&
        !hasCredential &&
        autoFailedFor !== address &&
        !justRevoked;
    const isAuthLoading = authBusy || isAutoSigning;
    const showPreLogin = !address && !authBusy;
    const titleLoading = isAuthLoading;
    const title = titleLoading
        ? "Signing you in"
        : address
            ? "Confirm Authorization"
            : "Connect Wallet";
    const subtitle = titleLoading
        ? "Hang tight while we finish setting up your session."
        : "Click on the button below to start signing messages in Connect on behalf of your Ethereum identity";

    return (
        <div className="flex flex-col items-center">
            <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                <div className="flex flex-col items-center bg-background px-8 pb-8 pt-10">
                    <h2 className="mb-3 text-3xl font-semibold">{title}</h2>
                    <p className="mb-10 text-center text-lg leading-6 text-muted-foreground-light">
                        {subtitle}
                    </p>

                    {address && !isAuthLoading && (
                        <div className="rounded-xl p-4 mb-6 bg-secondary flex gap-3 w-full">
                            {ensAvatar ? (
                                <Image src={ensAvatar} alt="Profile" width={48} height={48} unoptimized className="w-12 h-12 rounded-full object-cover" />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-linear-to-br from-orange-400 via-red-500 to-yellow-500 flex items-center justify-center text-white font-bold text-lg">
                                    {address.slice(2, 4).toUpperCase()}
                                </div>
                            )}
                            <div className="flex-1">
                                <h3 className="text-foreground font-medium">
                                    {ensName || `${address.slice(0, 6)}...${address.slice(-4)}`}
                                </h3>
                                <p className="text-muted-foreground text-sm">
                                    {address.slice(0, 6)}...{address.slice(-4)}
                                </p>
                                <div className="flex gap-3 mt-1">
                                    <button className="text-accent text-sm underline underline-offset-4" onClick={() => window.open(`/profile/${userDocId || address}`, '_blank')}>
                                        View profile
                                    </button>
                                    <button className="text-destructive text-sm underline underline-offset-4" onClick={disconnect}>
                                        Disconnect
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {isAuthLoading ? (
                        <LoadingBody />
                    ) : showPreLogin ? (
                        <div className="flex flex-col w-full gap-3">
                            <AppCard appId={appId} returnUrl={returnUrl} className="mb-3" />
                            <LoginButtons />
                            <Button secondary className="w-full hover:bg-muted" onClick={() => history.back()}>
                                Cancel
                            </Button>
                        </div>
                    ) : !hasCredential ? (
                        <ConfirmAuthorization appId={appId} returnUrl={returnUrl} ensName={ensName} ensAvatar={ensAvatar} />
                    ) : (
                        <Credential appId={appId} returnUrl={returnUrl} />
                    )}

                    {address && hasCredential && !isAuthLoading && (
                        credentialReady ? (
                            <a href={url} className="text-center block w-full mt-12">
                                <Button primary className="w-full">
                                    <div className="flex items-center justify-center gap-2">
                                        <Image src={IconConnectWhite} alt="Connect" />
                                        Return to {returnUrl ? new URL(returnUrl).hostname : 'Connect'}
                                    </div>
                                </Button>
                            </a>
                        ) : (
                            <div className="text-center block w-full mt-12">
                                <Button primary className="w-full animate-pulse" disabled>
                                    <div className="flex items-center justify-center gap-2">
                                        Preparing session...
                                    </div>
                                </Button>
                            </div>
                        )
                    )}
                </div>
            </RenownCard>
        </div>
    );
};
