import { useAccount } from "wagmi";
import Button from "./button";
import WalletButton from "./wallet-button";
import { useCredential } from "../hooks/credential";
import Image from "next/image";
import IconConnect from "../assets/icons/connect.svg";

interface IProps {
    connectId: string;
    deeplink?: string;
    returnUrl?: string;
}

function ConnectIdText(id: string) {
    return id.length < 20 ? id : `${id.slice(0, 8)}...${id.slice(-5)}`;
}

export const ConfirmAuthorization: React.FC<IProps> = ({ connectId, returnUrl  }) => {
    const { isConnected, chain } = useAccount();
    const { createCredential, loading } = useCredential(connectId, returnUrl);

    return (
        <div className="flex flex-col w-full ">

            
            {isConnected ? (
                <div className="flex flex-col w-full gap-3">
                                {/* Connected Application Card */}
                                <div className="rounded-xl p-4 bg-neutral-2-light flex gap-3 w-full">
                                <Image src={IconConnect} alt="Application" width={36} height={36} />
                                <div className="flex-1">
                                    <h3 className="text-neutral-5-light font-medium">
                                        {returnUrl ? new URL(returnUrl).hostname : 'Connected Application'}
                                    </h3>
                                    <p className="text-neutral-4 text-sm">
                                        {ConnectIdText(connectId)}
                                    </p>
                                </div>
                            </div>
                <Button
                    primary
                    onClick={createCredential}
                    className={`w-full mb-3 ${loading ? "animate-pulse" : ""}`}
                    disabled={
                        !isConnected || !chain || loading
                    }
                >
                    Confirm Authorization
                </Button>
                </div>
            ) : null}
            <Button
                secondary
                className="w-full hover:bg-neutral-1"
                onClick={() => {
                    history.back();
                }}
            >
                Cancel
            </Button>
        </div>
    );
};
