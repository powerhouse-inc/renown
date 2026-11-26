interface CliCardProps {
    sessionId: string;
    /** The session's label; without one, "Powerhouse CLI". */
    label?: string;
    /** The host the session is for, when the link names one. */
    host?: string;
    className?: string;
}

export function CliCard({ sessionId, label, host, className = "" }: CliCardProps) {
    return (
        <div className={`rounded-xl p-4 bg-secondary flex gap-3 w-full ${className}`}>
            <div className="w-9 h-9 rounded-lg bg-border flex items-center justify-center">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="font-medium break-words">{label ?? "Powerhouse CLI"}</h3>
                {host && <p className="text-sm text-foreground break-all">Host: {host}</p>}
                <p className="text-sm text-muted-foreground">
                    Session: {sessionId.slice(0, 8)}...
                </p>
            </div>
        </div>
    );
}
