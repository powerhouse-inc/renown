// Skeleton block that mirrors the rough vertical rhythm of the login-button
// stack so the card height stays stable while we wait for auth state.
export function LoadingBody() {
    return (
        <div className="flex flex-col w-full gap-3" aria-busy="true" aria-live="polite">
            <div className="rounded-xl p-4 bg-secondary flex gap-3 w-full mb-3 animate-pulse">
                <div className="w-9 h-9 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/2 rounded bg-muted" />
                    <div className="h-3 w-1/3 rounded bg-muted" />
                </div>
            </div>
            <div className="h-11 w-full rounded-md bg-muted animate-pulse" />
            <div className="h-11 w-full rounded-md bg-muted/70 animate-pulse" />
            <p className="mt-2 text-center text-sm text-muted-foreground animate-pulse">
                Signing you in&hellip;
            </p>
        </div>
    );
}
