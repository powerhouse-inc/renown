"use client";

import { useState } from "react";
import { Icon, type IconifyIcon } from "@iconify/react";
import Button from "../ui/button";
import {
    useOrchestrator,
    useSupportedLoginMethods,
} from "../../hooks/use-wallet-adapter";
import {
    clearLastLoginMethod,
    setLastLoginMethod,
    useLastLoginMethod,
} from "../../hooks/use-last-login-method";
import { LoginCancelledError, LoginMethod } from "../../services/wallet/types";

// Brand-colored icons (logos collection) + a few from simple-icons where logos
// doesn't carry the current brand mark (e.g. X uses a monochrome black mark).
import googleColored from "@iconify-icons/logos/google-icon";
import appleColored from "@iconify-icons/logos/apple";
import facebookColored from "@iconify-icons/logos/facebook";
import linkedinColored from "@iconify-icons/logos/linkedin-icon";
import instagramColored from "@iconify-icons/logos/instagram-icon";
import tiktokColored from "@iconify-icons/logos/tiktok-icon";
import spotifyColored from "@iconify-icons/logos/spotify-icon";
import discordColored from "@iconify-icons/logos/discord-icon";
import githubColored from "@iconify-icons/logos/github-icon";
import xColored from "@iconify-icons/simple-icons/x";

// Plain (monochrome) variants — inherit currentColor.
import googlePlain from "@iconify-icons/simple-icons/google";
import applePlain from "@iconify-icons/simple-icons/apple";
import facebookPlain from "@iconify-icons/simple-icons/facebook";
import xPlain from "@iconify-icons/simple-icons/x";
import linkedinPlain from "@iconify-icons/simple-icons/linkedin";
import instagramPlain from "@iconify-icons/simple-icons/instagram";
import tiktokPlain from "@iconify-icons/simple-icons/tiktok";
import spotifyPlain from "@iconify-icons/simple-icons/spotify";
import discordPlain from "@iconify-icons/simple-icons/discord";
import githubPlain from "@iconify-icons/simple-icons/github";

// Generic UI icons (no brand) — same icon for both variants.
import walletIcon from "@iconify-icons/lucide/wallet";
import mailIcon from "@iconify-icons/lucide/mail";
import phoneIcon from "@iconify-icons/lucide/smartphone";

interface LoginButtonsProps {
    onError?: (error: Error) => void;
    className?: string;
    /** Render monochrome variants instead of brand-colored ones. */
    plain?: boolean;
}

interface LoginMethodConfig {
    label: string;
    icon: IconifyIcon;
    iconPlain: IconifyIcon;
}

// `Record<LoginMethod, ...>` forces every enum member to have a config entry.
// Adding a new LoginMethod will fail the build here until it's configured.
const LOGIN_METHOD_CONFIG: Record<LoginMethod, LoginMethodConfig> = {
    [LoginMethod.WALLET]:    { label: "Connect Wallet",          icon: walletIcon,     iconPlain: walletIcon },
    [LoginMethod.GOOGLE]:    { label: "Continue with Google",    icon: googleColored,  iconPlain: googlePlain },
    [LoginMethod.APPLE]:     { label: "Continue with Apple",     icon: appleColored,   iconPlain: applePlain },
    [LoginMethod.FACEBOOK]:  { label: "Continue with Facebook",  icon: facebookColored,iconPlain: facebookPlain },
    [LoginMethod.TWITTER]:   { label: "Continue with X",         icon: xColored,       iconPlain: xPlain },
    [LoginMethod.LINKEDIN]:  { label: "Continue with LinkedIn",  icon: linkedinColored,iconPlain: linkedinPlain },
    [LoginMethod.INSTAGRAM]: { label: "Continue with Instagram", icon: instagramColored,iconPlain: instagramPlain },
    [LoginMethod.TIKTOK]:    { label: "Continue with TikTok",    icon: tiktokColored,  iconPlain: tiktokPlain },
    [LoginMethod.SPOTIFY]:   { label: "Continue with Spotify",   icon: spotifyColored, iconPlain: spotifyPlain },
    [LoginMethod.DISCORD]:   { label: "Continue with Discord",   icon: discordColored, iconPlain: discordPlain },
    [LoginMethod.GITHUB]:    { label: "Continue with GitHub",    icon: githubColored,  iconPlain: githubPlain },
    [LoginMethod.EMAIL]:     { label: "Continue with Email",     icon: mailIcon,       iconPlain: mailIcon },
    [LoginMethod.SMS]:       { label: "Continue with Phone",     icon: phoneIcon,      iconPlain: phoneIcon },
};

const NON_WALLET_ORDER: LoginMethod[] = [
    LoginMethod.GOOGLE,
    LoginMethod.APPLE,
    LoginMethod.FACEBOOK,
    LoginMethod.TWITTER,
    LoginMethod.LINKEDIN,
    LoginMethod.INSTAGRAM,
    LoginMethod.TIKTOK,
    LoginMethod.SPOTIFY,
    LoginMethod.DISCORD,
    LoginMethod.GITHUB,
    LoginMethod.EMAIL,
    LoginMethod.SMS,
];

export function LoginButtons({ onError, className, plain = false }: LoginButtonsProps) {
    const orchestrator = useOrchestrator();
    const supported = useSupportedLoginMethods();
    const lastLoginMethod = useLastLoginMethod();
    const [pending, setPending] = useState<LoginMethod | null>(null);

    const walletEnabled = supported.includes(LoginMethod.WALLET);
    const others = NON_WALLET_ORDER.filter(method => supported.includes(method));

    if (!walletEnabled && others.length === 0) return null;

    const handle = async (method: LoginMethod) => {
        setPending(method);
        // Set optimistically: OAuth flows trigger a full-page redirect, so
        // anything we'd write *after* signIn never runs. Reverted below on
        // failure so cancelled flows don't get stickered as "last used".
        const previous = lastLoginMethod;
        setLastLoginMethod(method);
        try {
            await orchestrator.signIn({ method });
        } catch (e) {
            if (previous !== null) setLastLoginMethod(previous);
            else clearLastLoginMethod();
            if (e instanceof LoginCancelledError) return;
            const error = e instanceof Error ? e : new Error(String(e));
            console.error(`Login (${method}) failed:`, error);
            onError?.(error);
        } finally {
            setPending(null);
        }
    };

    const renderButton = (
        method: LoginMethod,
        variant: "primary" | "secondary",
        iconOnly = false,
    ) => {
        const config = LOGIN_METHOD_CONFIG[method];
        const icon = plain ? config.iconPlain : config.icon;
        const isLastUsed = lastLoginMethod === method;
        return (
            <Button
                key={method}
                primary={variant === "primary"}
                secondary={variant === "secondary"}
                className={`relative w-full ${pending === method ? "animate-pulse" : ""}`}
                onClick={() => handle(method)}
                disabled={pending !== null}
                aria-label={iconOnly ? config.label : undefined}
                title={iconOnly ? config.label : undefined}
            >
                <div className="flex items-center justify-center gap-2">
                    <Icon icon={icon} width={iconOnly ? 24 : 20} height={iconOnly ? 24 : 20} aria-hidden="true" />
                    {!iconOnly && <span>{config.label}</span>}
                </div>
                {isLastUsed && (
                    <span
                        className="absolute -top-2 right-2 rounded-full bg-foreground text-background text-[10px] font-semibold leading-none px-1.5 py-0.5 shadow"
                        aria-label="Last used"
                    >
                        Last used
                    </span>
                )}
            </Button>
        );
    };

    const renderOthers = () => {
        if (others.length === 0) return null;
        if (others.length === 1) return renderButton(others[0], "secondary");

        const hasEmail = others.includes(LoginMethod.EMAIL);
        const grid = hasEmail ? others.filter(m => m !== LoginMethod.EMAIL) : others;
        const gridRow = grid.slice(0, 4);
        const overflow = grid.slice(4);

        return (
            <>
                {hasEmail && renderButton(LoginMethod.EMAIL, "secondary")}
                {gridRow.length === 1 && renderButton(gridRow[0], "secondary")}
                {gridRow.length >= 2 && (
                    <div className="flex gap-3">
                        {gridRow.map(method => (
                            <div key={method} className="flex-1">
                                {renderButton(method, "secondary", true)}
                            </div>
                        ))}
                    </div>
                )}
                {overflow.map(method => renderButton(method, "secondary"))}
            </>
        );
    };

    return (
        <div className={`flex flex-col w-full gap-3 ${className ?? ""}`}>
            {walletEnabled && renderButton(LoginMethod.WALLET, "primary")}
            {walletEnabled && others.length > 0 && (
                <div className="flex items-center gap-3 my-1">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
                    <div className="flex-1 h-px bg-border" />
                </div>
            )}
            {renderOthers()}
        </div>
    );
}

export default LoginButtons;
