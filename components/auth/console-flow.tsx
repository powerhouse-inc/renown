"use client";

import { useConsoleAuthFlow } from "../../hooks/use-console-auth-flow";
import RenownCard from "../ui/renown-card";
import { ConsoleFlowViewBody } from "./console-flow-view-body";
import { InvalidConsoleLink } from "./invalid-console-link";
import { ProfileCard } from "./profile-card";

interface IProps {
    sessionId: string;
    connectDid?: string;
}

const ConsoleFlow: React.FC<IProps> = ({ sessionId, connectDid }) => {
    const { view, title, subtitle, address, ensName, ensAvatar, userDocId, disconnect } =
        useConsoleAuthFlow({ sessionId, connectDid });

    if (view.kind === "invalid-link") {
        return <InvalidConsoleLink />;
    }

    return (
        <div className="flex flex-col items-center">
            <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                <div className="flex flex-col items-center bg-background px-8 pb-8 pt-10">
                    <h2 className="mb-3 text-3xl font-semibold">{title}</h2>
                    <p className="mb-6 text-center text-lg leading-6 text-muted-foreground-light">
                        {subtitle}
                    </p>

                    {address && view.kind === "needs-authorization" && (
                        <ProfileCard
                            address={address}
                            ensName={ensName}
                            ensAvatar={ensAvatar}
                            userDocId={userDocId}
                            onDisconnect={disconnect}
                        />
                    )}

                    <ConsoleFlowViewBody
                        view={view}
                        sessionId={sessionId}
                        connectDid={connectDid}
                        address={address}
                        ensName={ensName}
                        ensAvatar={ensAvatar}
                    />
                </div>
            </RenownCard>
        </div>
    );
};

export default ConsoleFlow;
