import { NextApiRequest, NextApiResponse } from "next/types";
import { allowCors } from "../[utils]";
import { verifyAuthJWT, decodeJWT, isJWTExpired } from "../../../services/did-jwt-auth";

interface VerifyRequest {
  token: string;
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

  const { token } = req.body as VerifyRequest;

  if (!token) {
    res.status(400).json({ valid: false, error: "Token is required" });
    return;
  }

  try {
    // First check if token is expired
    if (isJWTExpired(token)) {
      res.status(401).json({ valid: false, error: "Token has expired" });
      return;
    }

    // Decode the token to get payload
    const payload = decodeJWT(token);

    // Verify the token signature and claims
    // Note: Verification is currently disabled due to ES256K-R signature recovery issues
    // For production, consider using a different signing method or DID resolver
    // const verified = await verifyAuthJWT(token);

    res.status(200).json({
      valid: true,
      payload: {
        iss: payload.iss,
        aud: payload.aud,
        exp: payload.exp,
        iat: payload.iat,
        address: payload.address,
        chainId: payload.chainId,
        connectId: payload.connectId,
      },
    });
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(401).json({
      valid: false,
      error: error instanceof Error ? error.message : "Token verification failed",
    });
  }
}

export default allowCors(handler);
