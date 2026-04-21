import { useAccount } from "wagmi";
import Button from "./button";
import { useCredential } from "../hooks/credential";
import { useCallback } from "react";
import AppCard from "./app-card";

interface IProps {
    appId: string;
    returnUrl?: string;
    ensName?: string | null;
    ensAvatar?: string | null;
}

export const ConfirmAuthorization: React.FC<IProps> = ({ appId, returnUrl, ensName, ensAvatar }) => {
    const { isConnected, chain } = useAccount();
    const { createCredential, loading } = useCredential(appId, returnUrl);

    const handleCreateCredential = useCallback(() => {
        return createCredential({
            ensName: ensName ?? null,
            ensAvatar: ensAvatar ?? null,
        });
    }, [createCredential, ensName, ensAvatar]);

    if (!isConnected) return null;

    return (
        <div className="flex flex-col w-full gap-3">
            <AppCard appId={appId} returnUrl={returnUrl} />
            <Button
                primary
                onClick={handleCreateCredential}
                className={`w-full mb-3 ${loading ? "animate-pulse" : ""}`}
                disabled={!chain || loading}
            >
                Confirm Authorization
            </Button>
        </div>
    );
};
