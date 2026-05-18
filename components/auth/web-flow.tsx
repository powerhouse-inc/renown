"use client";

import { useAuthFlow, type AuthFlowView } from "../../hooks/use-auth-flow";
import RenownCard from "../ui/renown-card";
import { ProfileCard } from "./profile-card";
import { ReturnToAppButton } from "./return-to-app-button";
import { WebFlowViewBody } from "./web-flow-view-body";

interface IProps {
    appId: string;
    deeplink?: string;
    returnUrl?: string;
}

const connectUrl = process.env.NEXT_PUBLIC_CONNECT_URL;

const showsProfileCard = (kind: AuthFlowView["kind"]): boolean =>
    kind === "needs-authorization" || kind === "authorized";

export const WebFlow: React.FC<IProps> = ({ appId, deeplink, returnUrl = connectUrl }) => {
    const { view, title, subtitle, address, ensName, ensAvatar, userDocId, disconnect } = useAuthFlow({
        appId,
        returnUrl,
        deeplink,
    });

    return (
        <div className="flex flex-col items-center">
            <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                <div className="flex flex-col items-center bg-background px-8 pb-8 pt-10">
                    <h2 className="mb-3 text-3xl font-semibold">{title}</h2>
                    <p className="mb-10 text-center text-lg leading-6 text-muted-foreground-light">
                        {subtitle}
                    </p>

                    {address && showsProfileCard(view.kind) && (
                        <ProfileCard
                            address={address}
                            ensName={ensName}
                            ensAvatar={ensAvatar}
                            userDocId={userDocId}
                            onDisconnect={disconnect}
                        />
                    )}

                    <WebFlowViewBody view={view} appId={appId} returnUrl={returnUrl} />

                    {view.kind === "authorized" && (
                        <ReturnToAppButton
                            url={view.redirectUrl}
                            returnUrl={returnUrl}
                            isReady={view.credentialReady}
                        />
                    )}
                </div>
            </RenownCard>
        </div>
    );
};
