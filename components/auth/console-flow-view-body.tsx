import type { ConsoleAuthFlowView } from "../../hooks/use-console-auth-flow";
import { ConsoleConfirmAuthorization } from "./console-confirm-authorization";
import { ConsolePreLogin } from "./console-pre-login";
import { ConsoleSuccessView } from "./console-success-view";
import { LoadingBody } from "./loading-body";

interface ConsoleFlowViewBodyProps {
    view: ConsoleAuthFlowView;
    sessionId: string;
    connectDid?: string;
    address?: string;
    ensName?: string | null;
    ensAvatar?: string | null;
}

export function ConsoleFlowViewBody({
    view,
    sessionId,
    connectDid,
    address,
    ensName,
    ensAvatar,
}: ConsoleFlowViewBodyProps) {
    switch (view.kind) {
        case "loading":
            return <LoadingBody />;
        case "pre-login":
            return <ConsolePreLogin sessionId={sessionId} />;
        case "needs-authorization":
            return (
                <ConsoleConfirmAuthorization
                    sessionId={sessionId}
                    connectDid={connectDid!}
                    ensName={view.ensName}
                    ensAvatar={view.ensAvatar}
                />
            );
        case "completed":
            return (
                <ConsoleSuccessView
                    address={address!}
                    ensName={ensName}
                    ensAvatar={ensAvatar}
                    connectDid={connectDid!}
                />
            );
        case "error":
            return (
                <div className="rounded-xl p-4 bg-destructive/10 text-destructive w-full mb-6">
                    {view.message}
                </div>
            );
        case "invalid-link":
            return null;
    }
}
