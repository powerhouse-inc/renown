import Button from "../ui/button";
import { useCredential } from "../../hooks/credential";
import { useSession } from "../../hooks/use-wallet-adapter";
import { useCallback } from "react";
import AppCard from "../ui/app-card";
import { useOpenPanelAnalytics, ANALYTICS_EVENTS } from "../../services/analytics";

interface IProps {
    appId: string;
    returnUrl?: string;
    ensName?: string | null;
    ensAvatar?: string | null;
}

export const ConfirmAuthorization: React.FC<IProps> = ({ appId, returnUrl, ensName, ensAvatar }) => {
    const session = useSession();
    const { createCredential, loading } = useCredential(appId, returnUrl);
    const { track } = useOpenPanelAnalytics();

    const handleCreateCredential = useCallback(() => {
        track(ANALYTICS_EVENTS.authorizationConfirm, { appId });
        return createCredential({
            ensName: ensName ?? null,
            ensAvatar: ensAvatar ?? null,
        });
    }, [createCredential, ensName, ensAvatar, track, appId]);

    if (!session) return null;

    return (
        <div className="flex flex-col w-full gap-3">
            <AppCard appId={appId} returnUrl={returnUrl} />
            <Button
                primary
                onClick={handleCreateCredential}
                className={`w-full mb-3 ${loading ? "animate-pulse" : ""}`}
                disabled={loading}
            >
                {loading ? "Confirming authorization..." : "Confirm Authorization"}
            </Button>
        </div>
    );
};
