import {
  createJWT,
  verifyJWT,
  JWTPayload,
  JWTVerified,
  ES256KSigner,
} from "did-jwt";
import { Resolver } from "did-resolver";
import { getResolver } from "ethr-did-resolver";
import type { WalletClient } from "viem";
import { hexToBytes, bytesToHex } from "@veramo/utils";

// Create a DID resolver for Ethereum DIDs
const providerConfig = {
  networks: [
    { name: "mainnet", rpcUrl: "https://mainnet.infura.io/v3/" },
    { name: "sepolia", rpcUrl: "https://sepolia.infura.io/v3/" },
  ],
};

const resolver = new Resolver(getResolver(providerConfig));

export interface JWTAuthPayload extends JWTPayload {
  address: string;
  chainId: number;
  connectId?: string;
}

/**
 * Create an ES256K signer using wagmi's WalletClient
 * This properly signs JWTs using Ethereum's secp256k1 curve
 */
function createWagmiES256KSigner(walletClient: WalletClient) {
  return async (data: string | Uint8Array): Promise<string> => {
    if (!walletClient.account?.address) {
      throw new Error("No account address available");
    }

    // Convert data to Uint8Array if it's a string
    const dataBytes = typeof data === "string" ? hexToBytes(data) : data;

    // Convert to hex string with 0x prefix for wagmi
    const hexData = `0x${bytesToHex(dataBytes)}` as `0x${string}`;

    // Sign with wagmi - this uses eth_sign internally which signs the hash
    const signature = await walletClient.signMessage({
      account: walletClient.account,
      message: { raw: hexData },
    });

    // Remove the '0x' prefix and return
    return signature.slice(2);
  };
}

/**
 * Generate a DID from an Ethereum address
 */
export function getEthereumDID(address: string, chainId: number = 1): string {
  // Format: did:ethr:chainId:address
  // For mainnet (chainId 1), we can omit the chainId
  if (chainId === 1) {
    return `did:ethr:${address}`;
  }
  return `did:ethr:0x${chainId.toString(16)}:${address}`;
}

/**
 * Create a JWT using MetaMask as the signer
 */
export async function createAuthJWT(
  walletClient: WalletClient,
  chainId: number,
  payload: Partial<JWTAuthPayload> = {},
  expiresIn: number = 60 * 60 * 24 * 7 // 7 days default
): Promise<string> {
  if (!walletClient.account?.address) {
    throw new Error("Wallet not connected");
  }

  const address = walletClient.account.address;
  const did = getEthereumDID(address, chainId);

  // Create the ES256K signer using wagmi
  const signer = createWagmiES256KSigner(walletClient);

  // Prepare the payload
  const jwtPayload: JWTAuthPayload = {
    address,
    chainId,
    ...payload,
    iss: did,
    aud: "renown-app",
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    iat: Math.floor(Date.now() / 1000),
  };

  // Create and sign the JWT using ES256K-R algorithm
  const jwt = await createJWT(jwtPayload, {
    issuer: did,
    signer,
    alg: "ES256K-R", // Recoverable ECDSA signature
  });

  return jwt;
}

/**
 * Verify a JWT
 */
export async function verifyAuthJWT(jwt: string): Promise<JWTVerified> {
  try {
    const verified = await verifyJWT(jwt, {
      resolver,
      audience: "renown-app",
    });
    return verified;
  } catch (error) {
    console.error("JWT verification failed:", error);
    throw new Error("Invalid or expired JWT");
  }
}

/**
 * Extract payload from JWT without verification (use carefully)
 */
export function decodeJWT(jwt: string): JWTPayload {
  try {
    const [, payloadBase64] = jwt.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadBase64, "base64url").toString("utf-8")
    );
    return payload;
  } catch (error) {
    throw new Error("Invalid JWT format");
  }
}

/**
 * Check if JWT is expired
 */
export function isJWTExpired(jwt: string): boolean {
  try {
    const payload = decodeJWT(jwt);
    if (!payload.exp) return false;
    return payload.exp < Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
}
