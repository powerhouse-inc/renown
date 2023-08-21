import { useAccount } from "wagmi";
import { useEthersSigner } from ".";
import { useEffect, useState } from "react";
import {
    ConnectAttestation,
    attestConnect,
    checkConnectAttestation,
    getConnectAttestation,
    revokeConnectAttestation,
} from "../services/attestation";

export const useAttestation = (connectId: string) => {
    const account = useAccount();
    const signer = useEthersSigner();
    const [attestation, setAttestation] = useState<
        ConnectAttestation | undefined
    >(undefined);
    const [checking, setChecking] = useState(false);
    const [attesting, setAttesting] = useState(false);
    const [revoking, setRevoking] = useState(false);

    async function getAttestation(connectId: string, address: string) {
        try {
            setChecking(true);
            const attestation = await getConnectAttestation(address, connectId);
            if (
                attestation &&
                checkConnectAttestation(attestation, connectId)
            ) {
                setAttestation(attestation);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setChecking(false);
        }
    }

    useEffect(() => {
        if (account?.address) {
            getAttestation(connectId, account.address);
        }
    }, [connectId, account?.address]);

    async function attest() {
        if (!signer) {
            return;
        }
        try {
            setAttesting(true);
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
            setAttesting(false);
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
        attestation,
        checking,
        attesting,
        revoking,
        attest,
        revoke,
    };
};
