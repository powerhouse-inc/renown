"use client";

import { useEnsName, useEnsAvatar } from "wagmi";
import Image from "next/image";
import IconConnectWhite from "../../assets/icons/connect-white.svg";
import Button from "../ui/button";
import { useCredential } from "../../hooks/credential";
import { useAuth } from "../../hooks/auth";
import { useSession } from "../../hooks/use-wallet-adapter";
import { ConfirmAuthorization } from "./confirm-authorization";
import Credential from "./credential";
import { LoginButtons } from "./login-buttons";
import RenownCard from "../ui/renown-card";
import AppCard from "../ui/app-card";
import { useState, useEffect, useCallback } from "react";

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

export const WebFlow: React.FC<IProps> = ({
    appId,
    deeplink,
    returnUrl = connectUrl,
}) => {
    const session = useSession();
    const address = session?.address;
    const chainId = session?.chainId ?? 1;
    const { data: ensName } = useEnsName({ address });
    const { data: ensAvatar } = useEnsAvatar({ name: ensName ?? undefined });
    const { hasCredential } = useCredential(appId, returnUrl);
    const { userDocId, signOut } = useAuth(appId);
    const credentialReady = useCredentialReady(address, chainId, appId, hasCredential);

    const disconnect = useCallback(() => {
        void signOut();
    }, [signOut]);

    const user = (address && hasCredential)
        ? encodeURIComponent(`did:pkh:eip155:${chainId}:${address.toLowerCase()}`)
        : "";

    const url = deeplink
        ? `${deeplink}://login/${user}`
        : buildUrl(returnUrl ?? "", user);

    return (
        <div className="flex flex-col items-center">
            <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                <div className="flex flex-col items-center bg-background px-8 pb-8 pt-10">
                    <h2 className="mb-3 text-3xl font-semibold">
                        {address ? "Confirm Authorization" : "Connect Wallet"}
                    </h2>
                    <p className="mb-10 text-center text-lg leading-6 text-muted-foreground-light">
                        Click on the button below to start signing messages in
                        Connect on behalf of your Ethereum identity
                    </p>

                    {address && (
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

                    {!address ? (
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

                    {address && hasCredential && (
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
