import { useState } from "react";
import IconConnect from "../assets/icons/connect.svg";

export function useAppIcon(returnUrl: string | undefined) {
    const origin = returnUrl ? new URL(returnUrl).origin : null;
    const hostname = returnUrl ? new URL(returnUrl).hostname : null;

    const directSrc = origin ? `${origin}/favicon.ico` : IconConnect.src;
    const serviceSrc = hostname
        ? `https://icons.duckduckgo.com/ip3/${hostname}.ico`
        : IconConnect.src;

    const [src, setSrc] = useState<string>(directSrc);

    const onError = () => {
        setSrc((current) => {
            if (current === directSrc) {
                console.log(`[useAppIcon] favicon.ico failed for ${origin}, trying DuckDuckGo service`);
                return serviceSrc;
            }
            console.log(`[useAppIcon] DuckDuckGo service failed for ${hostname}, using fallback icon`);
            return IconConnect.src;
        });
    };

    return { src, onError };
}
