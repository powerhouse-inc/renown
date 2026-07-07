import { NextApiRequest, NextApiResponse } from "next/types";
import { allowCors } from "../[utils]";
import { queryRenownCredentials } from "../../../services/switchboard";

interface VerifyRequest {
  token: string; // This is now a credentialId
  address?: string; // Optional: if provided, we'll use it to query more efficiently
}

interface VerifyResponse {
  valid: boolean;
  payload?: any;
  error?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse<VerifyResponse>) {
  if (req.method !== "POST") {
    res.status(405).json({ valid: false, error: "Method not allowed" });
    return;
  }

  const { token, address } = req.body as VerifyRequest;

  if (!token) {
    res.status(400).json({ valid: false, error: "Credential ID is required" });
    return;
  }

  if (!address) {
    res.status(400).json({ valid: false, error: "Address is required for verification" });
    return;
  }

  try {
    // Use user-specific drive based on address
    const userDriveId = `renown-${address.toLowerCase()}`;

    // Query for credentials by address in the user's drive
    const credentials = await queryRenownCredentials({
      driveId: userDriveId,
      ethAddress: address,
      includeRevoked: true,
    });

    if (credentials.length === 0) {
      res.status(404).json({
        valid: false,
        error: "Credential not found",
      });
      return;
    }

    // Find the credential with the matching ID
    const credential = credentials.find(cred => cred.credentialId === token);

    if (!credential) {
      res.status(404).json({
        valid: false,
        error: "Credential with the specified ID not found for this address",
      });
      return;
    }

    // Check if credential is revoked
    if (credential.revoked) {
      res.status(401).json({
        valid: false,
        error: `Credential has been revoked${credential.revocationReason ? `: ${credential.revocationReason}` : ''}`,
      });
      return;
    }

    // Check if credential is expired
    if (credential.expirationDate) {
      const expirationTime = new Date(credential.expirationDate).getTime();
      const now = Date.now();
      if (now > expirationTime) {
        res.status(401).json({
          valid: false,
          error: "Credential has expired",
        });
        return;
      }
    }

    // Extract chainId from issuer DID (format: did:pkh:eip155:chainId:address)
    const issuerParts = credential.issuerId.split(':');
    const chainId = issuerParts.length >= 4 ? parseInt(issuerParts[3], 10) : undefined;

    res.status(200).json({
      valid: true,
      payload: {
        iss: credential.issuerId,
        aud: credential.credentialSubjectApp,
        exp: credential.expirationDate ? new Date(credential.expirationDate).getTime() / 1000 : undefined,
        iat: new Date(credential.issuanceDate).getTime() / 1000,
        address: credential.issuerEthereumAddress,
        chainId,
        connectId: credential.credentialSubjectId,
        credentialId: credential.credentialId,
        documentId: credential.documentId,
        proofType: credential.proofType,
      },
    });
  } catch (error) {
    console.error("Credential verification failed:", error);
    res.status(401).json({
      valid: false,
      error: error instanceof Error ? error.message : "Credential verification failed",
    });
  }
}

export default allowCors(handler);
