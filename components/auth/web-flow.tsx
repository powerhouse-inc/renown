"use client";

import { useEnsName, useEnsAvatar } from "wagmi";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { revokedAddressAtom, useAuth } from "../../hooks/auth";
import { useCredential } from "../../hooks/credential";
import { useAuthBusy, useSession } from "../../hooks/use-wallet-adapter";
import { useCredentialReady } from "../../hooks/use-credential-ready";
import { useAutoSignCredential } from "../../hooks/use-auto-sign-credential";
import RenownCard from "../ui/renown-card";
import { ConfirmAuthorization } from "./confirm-authorization";
import Credential from "./credential";
import { LoadingBody } from "./loading-body";
import { PreLoginView } from "./pre-login-view";
import { ProfileCard } from "./profile-card";
import { ReturnToAppButton } from "./return-to-app-button";

interface IProps {
    appId: string;
    deeplink?: string;
    returnUrl?: string;
}

const connectUrl = process.env.NEXT_PUBLIC_CONNECT_URL;

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

    const { autoFailedForCurrentAddress } = useAutoSignCredential({
        address, autoSign, initializing, hasCredential, loading,
        justRevoked, createCredential, ensName, ensAvatar,
    });

    const disconnect = useCallback(() => {
        void signOut();
    }, [signOut]);

    // Show the loading body while:
    //   - an adapter is provisioning a session (Privy authenticated → wallet pending), or
    //   - we're auto-signing on behalf of a provider-managed wallet and haven't
    //     either succeeded (hasCredential) or fallen back to manual (autoFailedFor).
    // Wagmi (autoSign=false) never enters the auto-sign branch, so its flow is
    // unchanged.
    const isAutoSigning =
        !!address && autoSign && !hasCredential && !autoFailedForCurrentAddress && !justRevoked;
    const isAuthLoading = authBusy || isAutoSigning;
    const showPreLogin = !address && !authBusy;
    const title = isAuthLoading
        ? "Signing you in"
        : address
            ? "Confirm Authorization"
            : "Connect Wallet";
    const appName = returnUrl ? new URL(returnUrl).hostname : "this app";
    const subtitle = isAuthLoading
        ? "Hang tight while we finish setting up your session."
        : `Authorize ${appName} to sign actions on your behalf using your identity.`;
    const redirectUrl = address && hasCredential
        ? buildRedirectUrl({ address, chainId, deeplink, returnUrl })
        : "";

    return (
        <div className="flex flex-col items-center">
            <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                <div className="flex flex-col items-center bg-background px-8 pb-8 pt-10">
                    <h2 className="mb-3 text-3xl font-semibold">{title}</h2>
                    <p className="mb-10 text-center text-lg leading-6 text-muted-foreground-light">
                        {subtitle}
                    </p>

                    {address && !isAuthLoading && (
                        <ProfileCard
                            address={address}
                            ensName={ensName}
                            ensAvatar={ensAvatar}
                            userDocId={userDocId}
                            onDisconnect={disconnect}
                        />
                    )}

                    {isAuthLoading ? (
                        <LoadingBody />
                    ) : showPreLogin ? (
                        <PreLoginView appId={appId} returnUrl={returnUrl} />
                    ) : !hasCredential ? (
                        <ConfirmAuthorization appId={appId} returnUrl={returnUrl} ensName={ensName} ensAvatar={ensAvatar} />
                    ) : (
                        <Credential appId={appId} returnUrl={returnUrl} />
                    )}

                    {address && hasCredential && !isAuthLoading && (
                        <ReturnToAppButton url={redirectUrl} returnUrl={returnUrl} isReady={credentialReady} />
                    )}
                </div>
            </RenownCard>
        </div>
    );
};
