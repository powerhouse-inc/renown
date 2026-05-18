import type { AuthFlowView } from "../../hooks/use-auth-flow";
import { ConfirmAuthorization } from "./confirm-authorization";
import Credential from "./credential";
import { LoadingBody } from "./loading-body";
import { PreLoginView } from "./pre-login-view";

interface WebFlowViewBodyProps {
    view: AuthFlowView;
    appId: string;
    returnUrl?: string;
}

export function WebFlowViewBody({ view, appId, returnUrl }: WebFlowViewBodyProps) {
    switch (view.kind) {
        case "loading":
            return <LoadingBody />;
        case "pre-login":
            return <PreLoginView appId={appId} returnUrl={returnUrl} />;
        case "needs-authorization":
            return (
                <ConfirmAuthorization
                    appId={appId}
                    returnUrl={returnUrl}
                    ensName={view.ensName}
                    ensAvatar={view.ensAvatar}
                />
            );
        case "authorized":
            return <Credential appId={appId} returnUrl={returnUrl} />;
    }
}
