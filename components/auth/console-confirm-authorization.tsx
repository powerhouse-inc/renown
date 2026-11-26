import { useCallback } from "react";
import Button from "../ui/button";
import { useCredential } from "../../hooks/credential";
import { useSession } from "../../hooks/use-wallet-adapter";
import { CliCard } from "./cli-card";
import { useOpenPanelAnalytics, ANALYTICS_EVENTS } from "../../services/analytics";
import { CredentialValidityNotice } from "./credential-validity-notice";

interface ConsoleConfirmAuthorizationProps {
    sessionId: string;
    connectDid: string;
    ensName?: string | null;
    ensAvatar?: string | null;
    expiresInDays: number;
    /** The session's label, signed into the credential as its `app`. */
    label?: string;
    /** The host the session is for, when the link names one. */
    host?: string;
}

export const ConsoleConfirmAuthorization: React.FC<ConsoleConfirmAuthorizationProps> = ({
    sessionId,
    connectDid,
    ensName,
    ensAvatar,
    expiresInDays,
    label,
    host,
}) => {
    const session = useSession();
    const { createCredential, loading } = useCredential(connectDid, undefined, expiresInDays, label);
    const { track } = useOpenPanelAnalytics();

    const handleCreateCredential = useCallback(() => {
        track(ANALYTICS_EVENTS.authorizationConfirm, { appId: connectDid, flow: "console" });
        return createCredential({
            ensName: ensName ?? null,
            ensAvatar: ensAvatar ?? null,
        });
    }, [createCredential, ensName, ensAvatar, track, connectDid]);

    if (!session) return null;

    const action = host ? "Approve Session" : label ? `Authorize ${label}` : "Authorize CLI";

    return (
        <div className="flex flex-col w-full gap-3">
            <CliCard sessionId={sessionId} label={label} host={host} />
            {host && (
                <p role="note" className="rounded-xl bg-muted px-4 py-3 text-center text-sm text-foreground">
                    May sign document changes as you on this host. It cannot administer the host.
                </p>
            )}
            {/* A labelled session always states when it ends; an old link only when it asks for more than the default. */}
            <CredentialValidityNotice expiresInDays={expiresInDays} always={!!label || !!host} />
            <p className="text-sm font-medium text-center text-foreground">
                Approve only a request you started yourself in the last few minutes.
            </p>
            <Button
                primary
                onClick={handleCreateCredential}
                className={`w-full ${loading ? "animate-pulse" : ""}`}
                disabled={loading}
            >
                {loading ? "Signing..." : action}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
                {host
                    ? `By approving, you allow this session to sign document changes on your behalf on ${host}. You can withdraw it at any time on your Renown page.`
                    : label
                      ? `By authorizing, you allow "${label}" to sign documents on your behalf.`
                      : "By authorizing, you allow this CLI to sign documents on your behalf."}
            </p>
        </div>
    );
};
