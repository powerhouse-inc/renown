"use client";

import { useAccount, useEnsName, useEnsAvatar, useDisconnect, useChainId } from "wagmi";
import Image from "next/image";
import IconConnect from "../assets/icons/connect.svg";
import IconConnectWhite from "../assets/icons/connect-white.svg";
import Button from "./button";
import { useCredential } from "../hooks/credential";
import { useAuth } from "../hooks/auth";
import { ConfirmAuthorization } from "./confirm-authorization";
import Credential from "./credential";
import WalletButton from "./wallet-button";
import RenownCard from "./renown-card";
import { useState, useEffect, useRef } from "react";

interface IProps {
    connectId: string;
    deeplink?: string;
    returnUrl?: string;
}

function ConnectIdText(id: string) {
    return id.length < 20 ? id : `${id.slice(0, 5)}...${id.slice(-5)}`;
}

const connectUrl = process.env.NEXT_PUBLIC_CONNECT_URL;

function buildUrl(returnUrl: string, user: string) {
    const url = new URL(returnUrl);
    url.searchParams.set("user", user);
    return url.toString();
}

/**
 * Polls the credential API to confirm the credential is indexed and
 * retrievable by the calling app before allowing the redirect back.
 */
function useCredentialReady(address: string | undefined, chainId: number, connectId: string, hasCredential: boolean) {
    const [ready, setReady] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!hasCredential || !address) {
            setReady(false);
            return;
        }

        let cancelled = false;
        const controller = new AbortController();
        abortRef.current = controller;

        const poll = async () => {
            const maxAttempts = 20;
            const delayMs = 500;

            for (let i = 0; i < maxAttempts; i++) {
                if (cancelled) return;

                try {
                    const params = new URLSearchParams({
                        address,
                        chainId: String(chainId),
                        connectId,
                    });
                    const res = await fetch(`/api/auth/credential?${params}`, {
                        signal: controller.signal,
                    });
                    if (res.ok) {
                        if (!cancelled) setReady(true);
                        return;
                    }
                } catch {
                    if (cancelled) return;
                }

                await new Promise((r) => setTimeout(r, delayMs));
            }

            // After all retries, allow redirect anyway to avoid blocking forever
            if (!cancelled) setReady(true);
        };

        poll();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [hasCredential, address, chainId, connectId]);

    return ready;
}

const ConnectFlow: React.FC<IProps> = ({
    connectId,
    deeplink,
    returnUrl = connectUrl,
}) => {
    const { address, isConnected, chain } = useAccount();
    const chainId = useChainId();
    const { data: ensName } = useEnsName({ address });
    const { data: ensAvatar } = useEnsAvatar({ name: ensName ?? undefined });
    const { disconnect } = useDisconnect();
    const { hasCredential, credential } = useCredential(connectId, returnUrl);
    const { docId } = useAuth(connectId);
    const credentialReady = useCredentialReady(address, chainId, connectId, hasCredential);

    // Construct DID from address and chainId
    const user = (address && hasCredential)
        ? encodeURIComponent(`did:pkh:eip155:${chainId}:${address.toLowerCase()}`)
        : "";

    const url = deeplink
        ? `${deeplink}://login/${user}`
        : buildUrl(returnUrl ?? "", user);

    return (
        <div className="flex flex-col items-center">
            <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                <div className="flex flex-col items-center bg-bg px-8 pb-8 pt-10">
                    <h2 className="mb-3 text-3xl font-semibold">
                        {address
                            ? "Confirm Authorization"
                            : "Connect Wallet"}
                    </h2>
                    <p className="mb-10 text-center text-lg leading-6 text-neutral-4-light">
                        Click on the button below to start signing messages in
                        Connect on behalf of your Ethereum identity
                    </p>
                    {/* Ethereum Profile Card */}
                    {address && (
                        <div className="rounded-xl p-4 mb-6 bg-neutral-2-light flex gap-3 w-full">
                            {ensAvatar ? (
                                <img
                                    src={ensAvatar}
                                    alt="Profile"
                                    className="w-12 h-12 rounded-full object-cover"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 via-red-500 to-yellow-500 flex items-center justify-center text-white font-bold text-lg">
                                    {address.slice(2, 4).toUpperCase()}
                                </div>
                            )}
                            <div className="flex-1">
                                <h3 className="text-neutral-5-light font-medium">
                                    {ensName || `${address.slice(0, 6)}...${address.slice(-4)}`}
                                </h3>
                                <p className="text-neutral-4 text-sm">
                                    {address.slice(0, 6)}...{address.slice(-4)}
                                </p>
                                <div className="flex gap-3 mt-1">
                                    <button className="text-link text-sm underline underline-offset-4" onClick={() => {
                                        window.open(`/profile/${docId || address}`, '_blank');
                                    }}>
                                        View profile
                                    </button>
                                    <button className="text-red text-sm underline underline-offset-4" onClick={() => disconnect()}>
                                        Disconnect
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Authorization Status */}
                    {!address ? (
                        <div className="flex flex-col w-full gap-3">
                            {/* Connected Application Card */}
                            <div className="rounded-xl p-4 bg-neutral-2-light flex gap-3 w-full mb-3">
                                <Image src={IconConnect} alt="Application" width={36} height={36} />
                                <div className="flex-1">
                                    <h3 className="font-medium">
                                        {returnUrl ? new URL(returnUrl).hostname : 'Powerhouse: Connect'}
                                    </h3>
                                    <p className="text-sm">
                                        Device ID: {ConnectIdText(connectId)}
                                    </p>
                                </div>
                            </div>
                            <WalletButton />
                            <Button
                                secondary
                                className="w-full hover:bg-neutral-1"
                                onClick={() => {
                                    history.back();
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    ) : !hasCredential ? (
                        <ConfirmAuthorization connectId={connectId} returnUrl={returnUrl} />
                    ) : (
                        <Credential connectId={connectId} returnUrl={returnUrl} />
                    )}

                    
                    {address && hasCredential ? (
                        credentialReady ? (
                            <a
                                href={url}
                                className="text-center block w-full mt-12"
                            >
                                <Button primary className="w-full">
                                    <div className="flex items-center justify-center gap-2">
                                        <Image
                                            src={IconConnectWhite}
                                            alt="Connect"
                                        />
                                        Return to Connect
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
                    ) : null}
                </div>
            </RenownCard>
        </div>
    );
};

export default ConnectFlow;
