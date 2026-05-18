import RenownCard from "../ui/renown-card";

export function InvalidConsoleLink() {
    return (
        <div className="flex flex-col items-center">
            <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                <div className="flex flex-col items-center bg-background px-8 pb-8 pt-10 text-center">
                    <h2 className="mb-3 text-3xl font-semibold">Invalid Login Link</h2>
                    <p className="text-lg leading-6 text-muted-foreground-light">
                        This console session is missing the CLI identity. Please run{' '}
                        <code className="bg-muted px-2 py-1 rounded-sm">ph login</code>{' '}
                        again to start a new session.
                    </p>
                </div>
            </RenownCard>
        </div>
    );
}
