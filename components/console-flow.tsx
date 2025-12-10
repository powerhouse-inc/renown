"use client";

import { useAccount, useEnsName, useEnsAvatar, useDisconnect, useChainId } from "wagmi";
import Image from "next/image";
import Button from "./button";
import { useCredential } from "../hooks/credential";
import { useAuth } from "../hooks/auth";
import WalletButton from "./wallet-button";
import RenownCard from "./renown-card";
import { useCallback, useState, useEffect } from "react";
import IconCheck from "../assets/icons/check.svg";

interface IProps {
    sessionId: string;
    connectDid?: string; // The CLI's DID to authorize
}

function formatDid(did: string): string {
    if (did.length <= 24) return did;
    return `${did.slice(0, 16)}...${did.slice(-8)}`;
}

const ConsoleFlow: React.FC<IProps> = ({ sessionId, connectDid }) => {
    const { address, isConnected, chain } = useAccount();
    const chainId = useChainId();
    const { data: ensName } = useEnsName({ address });
    const { data: ensAvatar } = useEnsAvatar({ name: ensName ?? undefined });
    const { disconnect } = useDisconnect();
    const { credential, createCredential, loading } = useCredential(connectDid || sessionId);
    const { docId, did } = useAuth();
    const [sessionCompleted, setSessionCompleted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Track if we have a valid credential for the requested connectDid
    // This can be true if: 1) we created a new credential, or 2) existing credential matches connectDid
    const [hasValidCredentialForSession, setHasValidCredentialForSession] = useState(false);
    const [checkingExistingCredential, setCheckingExistingCredential] = useState(false);

    // Check if existing credential matches the requested connectDid
    useEffect(() => {
        const checkExistingCredential = async () => {
            if (!address || !connectDid || hasValidCredentialForSession) {
                return;
            }

            setCheckingExistingCredential(true);
            try {
                const response = await fetch(`/api/status/${encodeURIComponent(address)}`);
                if (response.ok) {
                    const data = await response.json();
                    // Check if credential is active and matches the requested connectDid
                    if (
                        data.status === 'active' &&
                        !data.revoked &&
                        data.credentialSubject?.id === connectDid
                    ) {
                        // Check if not expired
                        if (data.expirationDate) {
                            const expiration = new Date(data.expirationDate);
                            if (expiration > new Date()) {
                                console.log('Found existing valid credential for connectDid:', connectDid);
                                setHasValidCredentialForSession(true);
                            }
                        } else {
                            // No expiration date means it's valid
                            console.log('Found existing valid credential (no expiration) for connectDid:', connectDid);
                            setHasValidCredentialForSession(true);
                        }
                    }
                }
            } catch (e) {
                console.error('Error checking existing credential:', e);
            } finally {
                setCheckingExistingCredential(false);
            }
        };

        checkExistingCredential();
    }, [address, connectDid, hasValidCredentialForSession]);

    // Complete the console session when we have a valid credential for this connectDid
    // This triggers when: 1) existing credential matches, or 2) new credential was created
    useEffect(() => {
        const completeSession = async () => {
            if (hasValidCredentialForSession && credential && address && did && !sessionCompleted) {
                try {
                    const response = await fetch(`/api/console/session/${sessionId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            address,
                            chainId,
                            did,
                            credentialId: credential,
                            userDocumentId: docId,
                            connectDid, // Include the CLI's DID in the session
                        }),
                    });

                    if (response.ok) {
                        setSessionCompleted(true);
                    } else {
                        const data = await response.json();
                        setError(data.error || 'Failed to complete session');
                    }
                } catch (e) {
                    console.error('Failed to complete console session:', e);
                    setError('Failed to communicate with server');
                }
            }
        };

        completeSession();
    }, [hasValidCredentialForSession, credential, address, chainId, did, docId, sessionId, sessionCompleted, connectDid]);

    const handleCreateCredential = useCallback(async () => {
        const result = await createCredential({
            ensName: ensName ?? null,
            ensAvatar: ensAvatar ?? null,
        });
        if (result) {
            setHasValidCredentialForSession(true);
        }
        return result;
    }, [createCredential, ensName, ensAvatar]);

    return (
        <div className="flex flex-col items-center">
            <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
                <div className="flex flex-col items-center bg-bg px-8 pb-8 pt-10">
                    <h2 className="mb-3 text-3xl font-semibold">
                        {sessionCompleted
                            ? "Authorization Complete"
                            : address
                            ? "Confirm Authorization"
                            : "Authorize CLI"}
                    </h2>
                    <p className="mb-6 text-center text-lg leading-6 text-neutral-4-light">
                        {sessionCompleted
                            ? "You can now close this window and return to your terminal."
                            : "Authorize the Powerhouse CLI to act on behalf of your Ethereum identity"}
                    </p>

                    {/* CLI DID Info */}
                    {connectDid && !sessionCompleted && (
                        <div className="rounded-xl p-3 mb-6 bg-blue-500/10 border border-blue-500/20 w-full">
                            <p className="text-xs text-blue-600 mb-1">CLI Identity (DID)</p>
                            <p className="text-sm font-mono text-blue-700 break-all">
                                {formatDid(connectDid)}
                            </p>
                        </div>
                    )}

                    {/* Ethereum Profile Card */}
                    {address && !sessionCompleted && (
                        <div className="rounded-xl p-4 mb-6 bg-neutral-2-light flex gap-3 w-full">
                            {ensAvatar ? (
                                <img
                                    src={ensAvatar}
                                    alt="Profile"
                                    className="w-12 h-12 rounded-full object-cover"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 via-red-500 to-yellow-500 flex items-center justify-center text-white font-bold text-lg">
                                    {address.slice(2, 4).toUpperCase()}
                                </div>
                            )}
                            <div className="flex-1">
                                <h3 className="text-neutral-5-light font-medium">
                                    {ensName || `${address.slice(0, 6)}...${address.slice(-4)}`}
                                </h3>
                                <p className="text-neutral-4 text-sm">
                                    {address.slice(0, 6)}...{address.slice(-4)}
                                </p>
                                <div className="flex gap-3 mt-1">
                                    <button
                                        className="text-red text-sm underline underline-offset-4"
                                        onClick={() => disconnect()}
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Success State */}
                    {sessionCompleted && (
                        <div className="flex flex-col items-center w-full">
                            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-6">
                                <Image src={IconCheck} alt="Success" width={48} height={48} />
                            </div>
                            <div className="rounded-xl p-4 bg-neutral-2-light flex gap-3 w-full mb-4">
                                {ensAvatar ? (
                                    <img
                                        src={ensAvatar}
                                        alt="Profile"
                                        className="w-12 h-12 rounded-full object-cover"
                                    />
                                ) : address ? (
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 via-red-500 to-yellow-500 flex items-center justify-center text-white font-bold text-lg">
                                        {address.slice(2, 4).toUpperCase()}
                                    </div>
                                ) : null}
                                <div className="flex-1">
                                    <h3 className="text-neutral-5-light font-medium">
                                        {ensName || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '')}
                                    </h3>
                                    <p className="text-green-600 text-sm">
                                        CLI authorized successfully
                                    </p>
                                </div>
                            </div>
                            {connectDid && (
                                <div className="rounded-xl p-3 mb-4 bg-green-500/10 border border-green-500/20 w-full">
                                    <p className="text-xs text-green-600 mb-1">Authorized CLI DID</p>
                                    <p className="text-sm font-mono text-green-700 break-all">
                                        {formatDid(connectDid)}
                                    </p>
                                </div>
                            )}
                            <p className="text-neutral-4 text-sm text-center">
                                The CLI will automatically detect your authorization.
                                <br />
                                You can safely close this browser tab.
                            </p>
                        </div>
                    )}

                    {/* Error State */}
                    {error && (
                        <div className="rounded-xl p-4 bg-red-500/10 text-red-600 w-full mb-6">
                            {error}
                        </div>
                    )}

                    {/* Authorization Flow */}
                    {!sessionCompleted && (
                        <>
                            {!address ? (
                                <div className="flex flex-col w-full gap-3">
                                    {/* CLI Application Card */}
                                    <div className="rounded-xl p-4 bg-neutral-2-light flex gap-3 w-full mb-3">
                                        <div className="w-9 h-9 rounded-lg bg-neutral-3 flex items-center justify-center">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="20"
                                                height="20"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <polyline points="4 17 10 11 4 5"></polyline>
                                                <line x1="12" y1="19" x2="20" y2="19"></line>
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-medium">Powerhouse CLI</h3>
                                            <p className="text-sm text-neutral-4">
                                                Session: {sessionId.slice(0, 8)}...
                                            </p>
                                        </div>
                                    </div>
                                    <WalletButton />
                                </div>
                            ) : !hasValidCredentialForSession ? (
                                <div className="flex flex-col w-full gap-3">
                                    {/* CLI Application Card */}
                                    <div className="rounded-xl p-4 bg-neutral-2-light flex gap-3 w-full">
                                        <div className="w-9 h-9 rounded-lg bg-neutral-3 flex items-center justify-center">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="20"
                                                height="20"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <polyline points="4 17 10 11 4 5"></polyline>
                                                <line x1="12" y1="19" x2="20" y2="19"></line>
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-medium">Powerhouse CLI</h3>
                                            <p className="text-sm text-neutral-4">
                                                Session: {sessionId.slice(0, 8)}...
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        primary
                                        onClick={handleCreateCredential}
                                        className={`w-full ${loading || checkingExistingCredential ? "animate-pulse" : ""}`}
                                        disabled={!isConnected || !chain || loading || checkingExistingCredential}
                                    >
                                        {checkingExistingCredential ? "Checking credentials..." : loading ? "Signing..." : "Authorize CLI"}
                                    </Button>
                                    <p className="text-xs text-neutral-4 text-center mt-2">
                                        By authorizing, you allow this CLI to sign documents on your behalf.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center w-full">
                                    <div className="animate-pulse text-neutral-4">
                                        Completing authorization...
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </RenownCard>
        </div>
    );
};

export default ConsoleFlow;
