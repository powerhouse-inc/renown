interface CliCardProps {
    sessionId: string;
    className?: string;
}

export function CliCard({ sessionId, className = "" }: CliCardProps) {
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
            <div className="flex-1">
                <h3 className="font-medium">Powerhouse CLI</h3>
                <p className="text-sm text-muted-foreground">
                    Session: {sessionId.slice(0, 8)}...
                </p>
            </div>
        </div>
    );
}
