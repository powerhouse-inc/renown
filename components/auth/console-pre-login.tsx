import { CliCard } from "./cli-card";
import { LoginButtons } from "./login-buttons";

interface ConsolePreLoginProps {
    sessionId: string;
    label?: string;
    host?: string;
}

export function ConsolePreLogin({ sessionId, label, host }: ConsolePreLoginProps) {
    return (
        <div className="flex flex-col w-full gap-3">
            <CliCard sessionId={sessionId} label={label} host={host} className="mb-3" />
            <LoginButtons />
        </div>
    );
}
