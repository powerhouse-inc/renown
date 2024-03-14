import { ethers } from "ethers";
import { useAccount, useNetwork } from "wagmi";
import Button from "./button";
import WalletButton from "./wallet-button";
import { useAttestation } from "../hooks/attestation";

interface IProps {
    connectId: string;
    deeplink?: string;
}

export const ConfirmAuthorization: React.FC<IProps> = ({ connectId }) => {
    const account = useAccount();
    const { chain } = useNetwork();
    const { attest, attesting, attestGasCost } = useAttestation(connectId);

    return (
        <>
            <WalletButton className={account.isConnected ? "mb-10" : "mb-3"} />
            {account.isConnected ? (
                <Button
                    primary
                    onClick={attest}
                    className={`w-full mb-3 ${
                        attesting ? "animate-pulse" : ""
                    }`}
                    disabled={
                        !account.isConnected ||
                        !!chain?.unsupported ||
                        attesting
                    }
                >
                    Confirm Authorization
                </Button>
            ) : null}
            <Button secondary className="w-full hover:bg-neutral-1">
                Cancel
            </Button>
            {attestGasCost ? (
                <p className="mt-3 text-neutral-4 text-xs font-medium">
                    Estimated cost:{" "}
                    {ethers
                        .formatEther(attestGasCost)
                        .toLocaleString()
                        .slice(0, 8)}
                    ETH
                </p>
            ) : null}
        </>
    );
};
