import { CliCard } from "./cli-card";
import { LoginButtons } from "./login-buttons";

interface ConsolePreLoginProps {
    sessionId: string;
}

export function ConsolePreLogin({ sessionId }: ConsolePreLoginProps) {
    return (
        <div className="flex flex-col w-full gap-3">
            <CliCard sessionId={sessionId} className="mb-3" />
            <LoginButtons />
        </div>
    );
}
