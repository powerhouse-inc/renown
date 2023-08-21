import { useAttestation } from "../hooks/attestation";

interface IProps {
    connectId: string;
    address: string;
}

const Attestation: React.FC<IProps> = ({ connectId, address }) => {
    const { checking, attestation, revoke, revoking, attest, attesting } =
        useAttestation(connectId);

    if (checking) {
        return <p className="animate-pulse">Checking authorization</p>;
    }

    if (attestation) {
        return (
            <div>
                <h3>Authorization confirmed!</h3>
                <div className="flex items-center justify-between mb-6">
                    <a
                        className="text-blue-500 underline"
                        href={`${process.env.NEXT_PUBLIC_EAS_SCAN}/attestation/view/${attestation.id}`}
                        target="_blank"
                    >
                        View details
                    </a>
                    <button
                        className={`text-red-500 underline ${
                            revoking && "animate-pulse pointer-events-none"
                        }`}
                        disabled={revoking}
                        onClick={revoke}
                    >
                        Revoke
                    </button>
                </div>
                <a href={`connect-dev://${address}`} className="text-center">
                    <h2>Return to Connect</h2>
                </a>
            </div>
        );
    }

    return (
        <div>
            <button
                onClick={attest}
                className={`${
                    attesting && "animate-pulse pointer-events-none"
                }`}
            >
                Confirm Authorization
            </button>
        </div>
    );
};

export default Attestation;
