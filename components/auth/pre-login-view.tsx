import AppCard from "../ui/app-card";
import Button from "../ui/button";
import { LoginButtons } from "./login-buttons";

interface PreLoginViewProps {
    appId: string;
    returnUrl?: string;
}

export function PreLoginView({ appId, returnUrl }: PreLoginViewProps) {
    return (
        <div className="flex flex-col w-full gap-3">
            <AppCard appId={appId} returnUrl={returnUrl} className="mb-3" />
            <LoginButtons />
            <Button secondary className="w-full hover:bg-muted" onClick={() => history.back()}>
                Cancel
            </Button>
        </div>
    );
}
