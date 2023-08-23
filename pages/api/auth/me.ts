import { NextApiRequest, NextApiResponse } from "next";
import { allowCors } from "../[utils]";
import { readJWT } from "../../../services/jwt";
import {
    checkConnectAttestation,
    getConnectAttestation,
} from "../../../services/attestation";

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const token = req.body.token?.toString();
    if (!token) {
        res.status(400).json({ error: "Token not found." });
        return;
    }
    try {
        const data = await readJWT(token);
        const publicKey = data.publicKey;
        if (!publicKey || typeof publicKey !== "string") {
            throw new Error("Token has no valid public key");
        }

        const address = data.address;
        if (!address || typeof address !== "string") {
            throw new Error("Token has no address");
        }

        // checks if attestation is still valid
        const attestation = await getConnectAttestation(address, publicKey);
        if (!attestation || !checkConnectAttestation(attestation, publicKey)) {
            throw new Error("Attestation not found.");
        }

        res.status(200).json({
            publicKey,
            address,
            expirationTime: data.exp,
            startTime: data.iss,
        });
    } catch (error) {
        console.error(error);
        res.status(403).json("Invalid token");
    }
}

export default allowCors(handler);
