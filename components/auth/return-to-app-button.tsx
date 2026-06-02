import Image from "next/image";
import IconConnectWhite from "../../assets/icons/connect-white.svg";
import Button from "../ui/button";
import { useOpenPanelAnalytics, ANALYTICS_EVENTS } from "../../services/analytics";

interface ReturnToAppButtonProps {
    url: string;
    returnUrl?: string;
    isReady: boolean;
}

export function ReturnToAppButton({ url, returnUrl, isReady }: ReturnToAppButtonProps) {
    const { track } = useOpenPanelAnalytics();

    if (!isReady) {
        return (
            <div className="text-center block w-full mt-12">
                <Button primary className="w-full animate-pulse" disabled>
                    <div className="flex items-center justify-center gap-2">
                        Preparing session...
                    </div>
                </Button>
            </div>
        );
    }

    return (
        <a
            href={url}
            className="text-center block w-full mt-12"
            onClick={() => track(ANALYTICS_EVENTS.returnToApp, { returnUrl })}
        >
            <Button primary className="w-full">
                <div className="flex items-center justify-center gap-2">
                    <Image src={IconConnectWhite} alt="Connect" />
                    Return to {returnUrl ? new URL(returnUrl).hostname : 'Connect'}
                </div>
            </Button>
        </a>
    );
}
