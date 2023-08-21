import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import Attestation from "./attestation";

interface IProps {
    connectId: string;
}

const Connect: React.FC<IProps> = ({ connectId }) => {
    const account = useAccount();

    return (
        <div className="flex flex-col items-center">
            <div className="border-2 border-black rounded-lg p-4 text-center mb-6">
                <b>Powerhouse Connect</b>
                <p>Device ID: {connectId}</p>
            </div>
            <div className="mb-6">
                <ConnectButton />
            </div>
            {account.isConnected && account.address ? (
                <Attestation connectId={connectId} address={account.address} />
            ) : null}
        </div>
    );
};

export default Connect;
