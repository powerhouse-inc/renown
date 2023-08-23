import { useAttestation } from "../hooks/attestation";
import IconCheck from "../assets/icons/check.svg";
import Image from "next/image";
import Button from "./button";

interface IProps {
    connectId: string;
    address: string;
}

const Attestation: React.FC<IProps> = ({ connectId, address }) => {
    const { attestation, revoke, revoking, attest, attesting } =
        useAttestation(connectId);

    if (!attestation) {
        return null;
    }

    return (
        <div>
            <div className="rounded-xl p-4 text-center bg-neutral-2-light flex gap-3">
                <Image src={IconCheck} alt="Confirmed" width={36} height={36} />
                <div>
                    <h3 className="text-neutral-5-light font-medium">
                        Authorization confirmed
                    </h3>
                    <div className="flex items-center justify-between">
                        <a
                            className="text-link underline underline-offset-4"
                            href={`${process.env.NEXT_PUBLIC_EAS_SCAN}/attestation/view/${attestation.id}`}
                            target="_blank"
                        >
                            View details
                        </a>
                        <button
                            className={`text-red underline underline-offset-4 ${
                                revoking && "animate-pulse pointer-events-none"
                            }`}
                            disabled={revoking}
                            onClick={revoke}
                        >
                            Revoke
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Attestation;
