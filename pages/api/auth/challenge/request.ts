import { NextApiRequest, NextApiResponse } from "next";
import { allowCors } from "../../[utils]";
import {
    checkConnectAttestation,
    getConnectAttestation,
} from "../../../../services/attestation";
import {
    generateChallenge,
    saveChallenge,
} from "../../../../services/challenge";

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const address = req.body.address?.toString();
    const publicKey = req.body.publicKey?.toString();
    if (!address || !publicKey) {
        res.status(400).end();
        return;
    }

    const attestation = await getConnectAttestation(address, publicKey);

    if (!attestation || !checkConnectAttestation(attestation, publicKey)) {
        res.status(403).end();
        return;
    }

    const challenge = generateChallenge();
    const test = await saveChallenge({ address, publicKey, challenge });
    res.status(200).json({ address, publicKey, challenge });
}

export default allowCors(handler);
