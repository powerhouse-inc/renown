import { atom, useAtom } from "jotai";
import { useEffect } from "react";
import { useAccount, useFeeData, useSignTypedData } from "wagmi";
import { createAgent } from "../services/veramo";
import { useEthersProvider, useEthersSigner } from "./index";
import { BrowserProvider } from "ethers";
import { DIDResolutionResult } from "@veramo/core-types";

const didAtom = atom<DIDResolutionResult | undefined>(undefined);
const checkingAttom = atom(false);
const attestingAtom = atom(false);
const revokingAtom = atom(false);
const attestGasCostAtom = atom<bigint | undefined>(undefined);

export function useAgent(provider: BrowserProvider) {
    const agent = createAgent(provider);

    function resolveDID(address: string) {
        return agent.resolveDid({
            didUrl: `did:ethr:sepolia:${address}`,
        });
    }

    function generateDID(address: string, publicKey: string) {
        return agent.didManagerCreate();
    }

    return { resolveDID, generateDID };
}

export const useDID = (connectId: string) => {
    const account = useAccount();
    const provider = useEthersProvider();
    const veramo = useAgent(provider!);
    const [did, setDid] = useAtom(didAtom);
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

    async function getDid(publicKey: string, address: string) {
        try {
            veramo.generateDID("", "").then(console.log);
            setChecking(true);
            const didDoc = await resolveDID(address);
            if (
                didDoc
                // TODO check if publicKey is approved && checkConnectAttestation(attestation, connectId)
            ) {
                setDid(didDoc);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setChecking(false);
        }
    }

    useEffect(() => {
        if (account?.address) {
            getDid(connectId, account.address);
        }
    }, [connectId, account?.address]);

    async function generateDID() {
        if (!veramo) {
            return;
        }
        try {
            setGenerating(true);
            const uId = await attestConnect(signer, connectId);
            console.log("Attestation id:", uId);
            if (uId) {
                const attestation = await getConnectAttestation(
                    signer.address,
                    connectId
                );
                setAttestation(attestation);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setGenerating(false);
        }
    }

    async function revoke() {
        if (!signer || !account.address) {
            return;
        }
        try {
            setRevoking(true);
            const attestation = await getConnectAttestation(
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
        did,
        checking,
        generating,
        revoking,
        generateDID,
        revoke,
        attestGasCost:
            feeData?.gasPrice && attestGasCost
                ? feeData.gasPrice * attestGasCost
                : 0,
    } as const;
};
