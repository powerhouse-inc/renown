import Image from "next/image";
import IconCheck from "../../assets/icons/check.svg";
import { formatDid } from "../../utils/did";

interface ConsoleSuccessViewProps {
    address: string;
    ensName?: string | null;
    ensAvatar?: string | null;
    connectDid: string;
}

export function ConsoleSuccessView({ address, ensName, ensAvatar, connectDid }: ConsoleSuccessViewProps) {
    return (
        <div className="flex flex-col items-center w-full">
            <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mb-6">
                <Image src={IconCheck} alt="Success" width={48} height={48} />
            </div>
            <div className="rounded-xl p-4 bg-secondary flex gap-3 w-full mb-4">
                {ensAvatar ? (
                    <Image
                        src={ensAvatar}
                        alt="Profile"
                        width={48}
                        height={48}
                        unoptimized
                        className="w-12 h-12 rounded-full object-cover"
                    />
                ) : (
                    <div className="w-12 h-12 rounded-full bg-linear-to-br from-orange-400 via-red-500 to-yellow-500 flex items-center justify-center text-white font-bold text-lg">
                        {address.slice(2, 4).toUpperCase()}
                    </div>
                )}
                <div className="flex-1">
                    <h3 className="text-foreground font-medium">
                        {ensName || `${address.slice(0, 6)}...${address.slice(-4)}`}
                    </h3>
                    <p className="text-success text-sm">CLI authorized successfully</p>
                </div>
            </div>
            <div className="rounded-xl p-3 mb-4 bg-success/10 border border-success/20 w-full">
                <p className="text-xs text-success mb-1">Authorized CLI DID</p>
                <p className="text-sm font-mono text-success break-all">
                    {formatDid(connectDid)}
                </p>
            </div>
            <p className="text-muted-foreground text-sm text-center">
                The CLI will automatically detect your authorization.
                <br />
                You can safely close this browser tab.
            </p>
        </div>
    );
}
