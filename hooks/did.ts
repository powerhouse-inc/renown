import { atom, useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { useAccount, useFeeData, useSignTypedData } from "wagmi";
import { createAgent } from "../services/veramo";
import { useEthersProvider, useEthersSigner } from "./index";
import { BrowserProvider } from "ethers";
import {
    IIdentifier,
    MinimalImportableKey,
    VerifiableCredential,
} from "@veramo/core-types";

const didAtom = atom<VerifiableCredential | undefined>(undefined);
const checkingAttom = atom(false);
const attestingAtom = atom(false);
const revokingAtom = atom(false);
const attestGasCostAtom = atom<bigint | undefined>(undefined);

export function useAgent(provider: BrowserProvider | undefined) {
    return useMemo(() => {
        if (!provider) {
            return undefined;
        }
        const agent = createAgent(provider);
        return {
            importAddress(address: string) {
                const did = `did:pkh:eip155:1:${address}`;
                const controllerKeyId = `wagmi-${address}`;
                return agent.didManagerImport({
                    did,
                    provider: "did:pkh",
                    controllerKeyId,
                    keys: [
                        {
                            kid: controllerKeyId,
                            type: "Secp256k1",
                            kms: "web3",
                            privateKeyHex: "",
                            publicKeyHex: "",
                            meta: {
                                address,
                                provider: "did:pkh",
                                algorithms: [
                                    "eth_signMessage",
                                    "eth_signTypedData",
                                ],
                            },
                        } as MinimalImportableKey,
                    ],
                });
            },
            getIdentifier() {
                return agent.didManagerGet();
            },
            resolveDID(address: string) {
                return agent.resolveDid({ didUrl: buildDidId(address) });
            },
            getCredential(hash: string) {
                return agent.dataStoreGetVerifiableCredential({ hash });
            },
            async generateCredential(address: string, publicKey: string) {
                let identifier: IIdentifier | undefined;

                try {
                    identifier = await agent.didManagerGetOrCreate({
                        alias: "default",
                        provider: "did:pkh",
                    });
                } catch (error) {
                    identifier = await this.importAddress(address);
                }
                const verifiableCredential =
                    await agent.createVerifiableCredentialEIP712({
                        credential: {
                            issuer: { id: identifier.did },
                            issuanceDate: new Date().toISOString(),
                            credentialSubject: {
                                id: identifier.did,
                                type: "powerhouse-connect",
                                publicKey: publicKey,
                            },
                            type: [
                                "VerifiableCredential",
                                "PowerhouseConnectCredential",
                            ],
                        },
                    });
                const hash = await agent.dataStoreSaveVerifiableCredential({
                    verifiableCredential,
                });
                console.log(verifiableCredential);
                console.log("Credential saved with hash:", hash);
                return verifiableCredential;
            },
            async verifyCredential(credential: VerifiableCredential) {
                return agent.verifyCredentialEIP712({ credential });
            },
        };
    }, [provider]);
}

export const useDID = (connectId: string) => {
    const account = useAccount();
    const provider = useEthersProvider();
    const veramo = useAgent(provider);
    const [credential, setCredential] = useAtom(didAtom);
    const [checking, setChecking] = useAtom(checkingAttom);
    const [generating, setGenerating] = useAtom(attestingAtom);
    const [revoking, setRevoking] = useAtom(revokingAtom);
    const [attestGasCost, setAttestGasCost] = useAtom(attestGasCostAtom);
    const { data: feeData } = useFeeData();
    const { data: signedData, error, signTypedData } = useSignTypedData();

    // TODO
    // useEffect(() => {
    //     if (signer && feeData?.gasPrice) {
    //         estimateAttestGas(signer, connectId).then((value) =>
    //             setAttestGasCost(value)
    //         );
    //     }
    // }, [signer, connectId, feeData]);

    function signEIP712(publicKey: string, type: string) {
        signTypedData({
            types: {
                Delegation: [
                    { name: "type", type: "string" },
                    { name: "publicKey", type: "string" },
                ],
            },
            primaryType: "Delegation",
            message: {
                publicKey,
                type,
            },
        });
    }

    async function getCredential(address: string, publicKey: string) {
        setChecking(true);
        let credential: VerifiableCredential | undefined;
        try {
            credential = await veramo?.getCredential(address);
        } catch {}
        try {
            if (
                credential
                // TODO check if publicKey is approved && checkConnectAttestation(attestation, connectId)
            ) {
                const valid = await veramo?.verifyCredential(credential);
                if (valid) {
                    setCredential(credential);
                    return credential;
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setChecking(false);
        }
    }

    useEffect(() => {
        (async () => {
            if (!account?.address || !veramo || !connectId) {
                return;
            }
            const credential = await getCredential(account.address, connectId);
            if (!credential) {
                const credential = await generateCredential(
                    account.address,
                    connectId
                );
            }
        })();
    }, [connectId, account?.address, veramo]);

    async function generateCredential(address: string, publicKey: string) {
        if (!veramo) {
            return;
        }
        try {
            setGenerating(true);
            const credential = await veramo.generateCredential(
                address,
                publicKey
            );
            console.log("Credential id:", credential.id);
            if (credential) {
                setCredential(credential);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setGenerating(false);
        }
    }

    async function revoke(address: string, publicKey: string) {
        try {
            setRevoking(true);
            const attestation = await veramo?.generateCredential(
                account.address,
                connectId
            );
            if (attestation?.id) {
                // @ts-ignore
                await revokeConnectAttestation(signer, attestation.id);
                setAttestation(undefined);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setRevoking(false);
        }
    }

    return {
        credential,
        checking,
        generating,
        revoking,
        generateCredential,
        revoke,
        attestGasCost:
            feeData?.gasPrice && attestGasCost
                ? feeData.gasPrice * attestGasCost
                : 0,
    } as const;
};
