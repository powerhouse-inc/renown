"use client";

import { useOidcLoginFlow } from "../../hooks/use-oidc-login-flow";
import { useOrchestrator } from "../../hooks/use-wallet-adapter";
import Button from "../ui/button";
import RenownCard from "../ui/renown-card";
import { LoginButtons } from "./login-buttons";
import { ProfileCard } from "./profile-card";

interface OidcLoginFlowProps {
    requestId: string;
    issuer?: string;
}

function shortenAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const OidcLoginFlow: React.FC<OidcLoginFlowProps> = ({ requestId, issuer }) => {
    const view = useOidcLoginFlow(requestId, issuer);
    const orchestrator = useOrchestrator();

    if (view.kind === "invalid") {
        return (
            <div className="text-center text-muted-foreground">
                <h2 className="text-2xl font-semibold mb-4">Invalid sign-in link</h2>
                <p>
                    No sign-in request was provided. Please restart the sign-in flow from the
                    application you were using.
                </p>
            </div>
        );
    }

    if (view.kind === "loading") {
        return (
            <div className="flex flex-col items-center">
                <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                    <div className="flex flex-col items-center bg-background px-8 pb-8 pt-10">
                        <h2 className="mb-3 text-3xl font-semibold">Sign in with Renown</h2>
                        <p className="text-center text-lg leading-6 text-muted-foreground-light">
                            Loading…
                        </p>
                    </div>
                </RenownCard>
            </div>
        );
    }

    if (view.kind === "error") {
        return (
            <div className="flex flex-col items-center">
                <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                    <div className="flex flex-col items-center bg-background px-8 pb-8 pt-10">
                        <h2 className="mb-3 text-3xl font-semibold">Sign in with Renown</h2>
                        <p className="text-center text-lg leading-6 text-muted-foreground-light">
                            {view.message}
                        </p>
                    </div>
                </RenownCard>
            </div>
        );
    }

    const { client } = view;

    return (
        <div className="flex flex-col items-center">
            <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                <div className="flex flex-col items-center bg-background px-8 pb-8 pt-10">
                    <h2 className="mb-3 text-3xl font-semibold">Sign in with Renown</h2>
                    <p className="mb-6 text-center text-lg leading-6 text-muted-foreground-light">
                        <strong>{client.name}</strong> at <strong>{client.redirectHost}</strong> wants
                        to confirm your Renown identity.
                    </p>

                    {view.kind === "pre-login" && <LoginButtons />}

                    {view.kind === "ready" && (
                        <>
                            <ProfileCard
                                address={view.address}
                                onDisconnect={() => void orchestrator.signOut()}
                            />
                            <Button
                                primary
                                className="w-full"
                                onClick={() => void view.submit()}
                                disabled={view.submitting}
                            >
                                {view.submitting ? "Signing…" : `Continue as ${shortenAddress(view.address)}`}
                            </Button>
                            <p className="mt-4 text-center text-sm text-muted-foreground">
                                You will be asked to sign a message. It costs nothing and grants no
                                access to your funds.
                            </p>
                        </>
                    )}

                    {view.kind === "denied" && (
                        <p className="text-center text-destructive">{view.message}</p>
                    )}
                </div>
            </RenownCard>
        </div>
    );
};

export default OidcLoginFlow;
