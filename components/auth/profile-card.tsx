import Image from "next/image";

interface ProfileCardProps {
    address: string;
    ensName?: string | null;
    ensAvatar?: string | null;
    userDocId?: string | null;
    onDisconnect: () => void;
}

export function ProfileCard({ address, ensName, ensAvatar, userDocId, onDisconnect }: ProfileCardProps) {
    return (
        <div className="rounded-xl p-4 mb-6 bg-secondary flex gap-3 w-full">
            {ensAvatar ? (
                <Image src={ensAvatar} alt="Profile" width={48} height={48} unoptimized className="w-12 h-12 rounded-full object-cover" />
            ) : (
                <div className="w-12 h-12 rounded-full bg-linear-to-br from-orange-400 via-red-500 to-yellow-500 flex items-center justify-center text-white font-bold text-lg">
                    {address.slice(2, 4).toUpperCase()}
                </div>
            )}
            <div className="flex-1">
                <h3 className="text-foreground font-medium">
                    {ensName || `${address.slice(0, 6)}...${address.slice(-4)}`}
                </h3>
                <p className="text-muted-foreground text-sm">
                    {address.slice(0, 6)}...{address.slice(-4)}
                </p>
                <div className="flex gap-3 mt-1">
                    <button className="text-accent text-sm underline underline-offset-4" onClick={() => window.open(`/profile/${userDocId || address}`, '_blank')}>
                        View profile
                    </button>
                    <button className="text-destructive text-sm underline underline-offset-4" onClick={onDisconnect}>
                        Disconnect
                    </button>
                </div>
            </div>
        </div>
    );
}
