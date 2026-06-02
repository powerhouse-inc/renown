import { useCallback } from "react";
import Button from "../ui/button";
import { useCredential } from "../../hooks/credential";
import { useSession } from "../../hooks/use-wallet-adapter";
import { CliCard } from "./cli-card";
import { useOpenPanelAnalytics, ANALYTICS_EVENTS } from "../../services/analytics";

interface ConsoleConfirmAuthorizationProps {
    sessionId: string;
    connectDid: string;
    ensName?: string | null;
    ensAvatar?: string | null;
}

export const ConsoleConfirmAuthorization: React.FC<ConsoleConfirmAuthorizationProps> = ({
    sessionId,
    connectDid,
    ensName,
    ensAvatar,
}) => {
    const session = useSession();
    const { createCredential, loading } = useCredential(connectDid);
    const { track } = useOpenPanelAnalytics();

    const handleCreateCredential = useCallback(() => {
        track(ANALYTICS_EVENTS.authorizationConfirm, { appId: connectDid, flow: "console" });
        return createCredential({
            ensName: ensName ?? null,
            ensAvatar: ensAvatar ?? null,
        });
    }, [createCredential, ensName, ensAvatar, track, connectDid]);

    if (!session) return null;

    return (
        <div className="flex flex-col w-full gap-3">
            <CliCard sessionId={sessionId} />
            <Button
                primary
                onClick={handleCreateCredential}
                className={`w-full ${loading ? "animate-pulse" : ""}`}
                disabled={loading}
            >
                {loading ? "Signing..." : "Authorize CLI"}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
                By authorizing, you allow this CLI to sign documents on your behalf.
            </p>
        </div>
    );
};
