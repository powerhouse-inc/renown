import IconCheck from "../../assets/icons/check.svg";
import Image from "next/image";
import { useCredential } from "../../hooks/credential";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVerifyToken } from "../../hooks/useVerifyToken";
import { useSession } from "../../hooks/use-wallet-adapter";
import AppCard from "../ui/app-card";

interface CredentialDetails {
    documentId: string;
    credentialId: string;
    status: string;
    revoked: boolean;
    revokedAt: string | null;
    revocationReason: string | null;
    issuerId: string;
    issuerEthereumAddress: string;
    issuanceDate: string;
    expirationDate: string | null;
    credentialSubject: {
        id: string | null;
        app: string;
    };
    createdAt: string | null;
    updatedAt: string | null;
}

interface IProps {
    appId: string;
    returnUrl?: string;
}

const Credential: React.FC<IProps> = ({ appId, returnUrl }) => {
    const { hasCredential, credential, revokeCredential } = useCredential(appId, returnUrl);
    const session = useSession();
    const address = session?.address;
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [revoking, setRevoking] = useState(false);
    const { verifyToken, isVerifying, verificationResult } = useVerifyToken();

    const { data: credentialDetails, isFetching: loadingDetails } = useQuery<CredentialDetails | null>({
        queryKey: ['credentialDetails', address, appId],
        enabled: !!address && hasCredential,
        queryFn: async () => {
            const params = new URLSearchParams({ appId });
            try {
                const res = await fetch(`/api/status/${address}?${params}`);
                const data = await res.json();
                if (data.error) return null;
                return data as CredentialDetails;
            } catch (err) {
                console.error('Failed to fetch credential details:', err);
                return null;
            }
        },
    });

    if (!hasCredential) return null;

    return (
        <div className="flex flex-col w-full">
            <div className="rounded-xl p-4 flex gap-3 w-full">
                <div className="w-12 flex items-center justify-center">
                    <Image src={IconCheck} alt="Confirmed" width={36} height={36} />
                </div>
                <div className="flex flex-col flex-1">
                    <h3 className="font-medium">Authorization confirmed</h3>
                    <div className="flex items-center gap-3 mt-1">
                        <button
                            className="text-accent underline underline-offset-4 text-sm"
                            onClick={() => dialogRef.current?.showModal()}
                        >
                            View details
                        </button>
                        <button
                            className={`text-accent underline underline-offset-4 text-sm ${isVerifying && "animate-pulse pointer-events-none"}`}
                            disabled={isVerifying || !credential || !address}
                            onClick={async () => { if (credential && address) await verifyToken(credential, address); }}
                        >
                            {isVerifying ? 'Verifying...' : 'Verify'}
                        </button>
                        <button
                            className={`text-destructive underline underline-offset-4 text-sm ${revoking && "animate-pulse pointer-events-none"}`}
                            disabled={revoking || !credential}
                            onClick={async () => {
                                setRevoking(true);
                                try { await revokeCredential(); }
                                catch (error) { console.error('Failed to revoke credential:', error); }
                                finally { setRevoking(false); }
                            }}
                        >
                            {revoking ? 'Revoking...' : 'Revoke'}
                        </button>
                    </div>
                    {verificationResult && (
                        <div className={`mt-2 p-2 rounded-sm text-xs ${verificationResult.valid ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                            {verificationResult.valid ? '✓ Token is valid' : `✗ ${verificationResult.error || 'Token is invalid'}`}
                        </div>
                    )}
                </div>
                <dialog
                    ref={dialogRef}
                    className="shadow-lg backdrop:bg-transparent backdrop:cursor-pointer p-6 h-4/6 max-w-2xl rounded-xl"
                    onClick={() => dialogRef.current?.close()}
                >
                    <pre className="text-start text-sm overflow-auto" onClick={(e) => e.stopPropagation()}>
                        {loadingDetails
                            ? 'Loading credential details...'
                            : JSON.stringify(credentialDetails || { credentialId: credential }, null, 4)}
                    </pre>
                </dialog>
            </div>
            <AppCard appId={appId} returnUrl={returnUrl} className="mt-6" />
        </div>
    );
};

export default Credential;
