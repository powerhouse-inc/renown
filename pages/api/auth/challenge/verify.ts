import { NextApiRequest, NextApiResponse } from "next";
import { allowCors } from "../../[utils]";
import {
    checkConnectAttestation,
    getConnectAttestation,
} from "../../../../services/attestation";
import { getChallenge, verifyChallenge } from "../../../../services/challenge";
import { generateJWT } from "../../../../services/jwt";

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const address = req.body.address?.toString();
    const publicKey = req.body.publicKey?.toString();
    const challenge = req.body.challenge?.toString();
    const signedChallenge = req.body.signedChallenge?.toString();
    if (!address || !publicKey || !challenge || !signedChallenge) {
        res.status(400).json({});
        return;
    }

    // checks if attestation exists
    const attestation = await getConnectAttestation(address, publicKey);
    if (!attestation || !checkConnectAttestation(attestation, publicKey)) {
        res.status(403).json({ error: "Attestation not found." });
        return;
    }

    // checks if challenge is valid
    const storedChallenge = await getChallenge({
        address,
        publicKey,
        challenge,
    });
    if (!storedChallenge) {
        res.status(403).json({ error: "Challenge not found." });
        return;
    }

    // checks if challenge is correctly signed
    const isSignatureValid = await verifyChallenge(
        publicKey,
        challenge,
        signedChallenge
    );
    if (!isSignatureValid) {
        res.status(403).json({ error: "Invalid signature." });
        return;
    }

    // returns JWT token
    const token = await generateJWT(address, publicKey);
    res.status(200).json({ token });
}

export default allowCors(handler);
