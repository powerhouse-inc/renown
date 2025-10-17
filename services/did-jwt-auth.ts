import {
  createJWT,
  verifyJWT,
  JWTPayload,
  JWTVerified,
  ES256KSigner,
  bytesToBase64url,
} from 'did-jwt'
import { createVerifiableCredentialJwt, verifyCredential, JwtCredentialPayload } from 'did-jwt-vc'
import { Resolver } from 'did-resolver'
import { getResolver } from 'ethr-did-resolver'
import type { WalletClient } from 'viem'
import { hexToBytes, bytesToHex } from '@veramo/utils'

// Create a DID resolver for Ethereum DIDs
const providerConfig = {
  networks: [
    {
      name: 'mainnet',
      rpcUrl:
        'https://wandering-wispy-brook.quiknode.pro/73b42df6ef3dd79922efd590b4785be884ed4cb4/',
    },
    { name: 'sepolia', rpcUrl: 'https://sepolia.infura.io/v3/' },
  ],
}

const resolver = new Resolver(getResolver(providerConfig))

export interface JWTAuthPayload extends JWTPayload {
  address: string
  chainId: number
  connectId?: string
}

/**
 * Create an ES256K signer using wagmi's WalletClient
 * This properly signs JWTs using Ethereum's secp256k1 curve
 */
function createWagmiES256KSigner(walletClient: WalletClient) {
  return async (data: string | Uint8Array): Promise<string> => {
    if (!walletClient.account?.address) {
      throw new Error('No account address available')
    }

    // Convert data to Uint8Array if it's a string
    const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data

    // For ES256K-R, we need to sign the raw data
    // signMessage adds the Ethereum message prefix, which we want for proper signature recovery
    const signature = await walletClient.signMessage({
      account: walletClient.account,
      message: { raw: dataBytes },
    })

    // wagmi returns signature as 0x + 130 hex chars (65 bytes)
    // Format: r (32 bytes) + s (32 bytes) + v (1 byte)
    // Remove '0x' prefix and convert to bytes
    const signatureBytes = hexToBytes(signature.slice(2))

    // The signature should be 65 bytes (r + s + recovery)
    if (signatureBytes.length !== 65) {
      throw new Error(`Invalid signature length: expected 65 bytes, got ${signatureBytes.length}`)
    }

    // Ethereum uses v = 27 or 28, but did-jwt expects recovery param 0 or 1
    // Convert v to recovery param by subtracting 27
    const recoveryParam = signatureBytes[64] >= 27 ? signatureBytes[64] - 27 : signatureBytes[64]

    // Create the final signature with the corrected recovery param
    const finalSignature = new Uint8Array(65)
    finalSignature.set(signatureBytes.slice(0, 64), 0) // r + s
    finalSignature[64] = recoveryParam // recovery param (0 or 1)

    // Return as base64url-encoded string
    return bytesToBase64url(finalSignature)
  }
}

/**
 * Generate a DID from an Ethereum address using PKH (Public Key Hash) format
 */
export function getEthereumDID(address: string, chainId: number = 1): string {
  // Format: did:pkh:eip155:chainId:address
  // PKH (Public Key Hash) is a simpler DID method for blockchain addresses
  // https://github.com/w3c-ccg/did-pkh/blob/main/did-pkh-method-draft.md
  return `did:pkh:eip155:${chainId}:${address.toLowerCase()}`
}

/**
 * Create a JWT using MetaMask as the signer
 */
export async function createAuthJWT(
  walletClient: WalletClient,
  chainId: number,
  payload: Partial<JWTAuthPayload> = {},
  expiresIn: number = 60 * 60 * 24 * 7, // 7 days default
): Promise<string> {
  if (!walletClient.account?.address) {
    throw new Error('Wallet not connected')
  }

  const address = walletClient.account.address
  const did = getEthereumDID(address, chainId)

  // Create the ES256K signer using wagmi
  const signer = createWagmiES256KSigner(walletClient)

  // Prepare the payload
  const jwtPayload: JWTAuthPayload = {
    address,
    chainId,
    ...payload,
    iss: did,
    aud: 'renown-app',
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    iat: Math.floor(Date.now() / 1000),
  }

  // Create and sign the JWT using ES256K-R algorithm
  try {
    const jwt = await createJWT(jwtPayload, {
      issuer: did,
      signer,
      alg: 'ES256K-R', // Recoverable ECDSA signature
    })

    console.log('JWT created successfully:', jwt)
    return jwt
  } catch (error) {
    console.error('Failed to create JWT:', error)
    throw new Error(`JWT creation failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Verify a JWT
 */
export async function verifyAuthJWT(jwt: string): Promise<JWTVerified> {
  try {
    const verified = await verifyJWT(jwt, {
      resolver,
      audience: 'renown-app',
    })
    return verified
  } catch (error) {
    console.error('JWT verification failed:', error)
    throw new Error('Invalid or expired JWT')
  }
}

/**
 * Extract payload from JWT without verification (use carefully)
 */
export function decodeJWT(jwt: string): JWTPayload {
  try {
    if (!jwt || typeof jwt !== 'string') {
      throw new Error('JWT must be a non-empty string')
    }

    const parts = jwt.split('.')
    if (parts.length !== 3) {
      throw new Error(`JWT must have 3 parts, got ${parts.length}`)
    }

    const payloadBase64 = parts[1]

    // Use atob for browser compatibility, with proper base64url to base64 conversion
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    const jsonString = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )

    const payload = JSON.parse(jsonString)
    return payload
  } catch (error) {
    console.error('JWT decode error:', error, 'JWT:', jwt)
    throw new Error(`Invalid JWT format: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Check if JWT is expired
 */
export function isJWTExpired(jwt: string): boolean {
  try {
    const payload = decodeJWT(jwt)
    if (!payload.exp) return false
    return payload.exp < Math.floor(Date.now() / 1000)
  } catch {
    return true
  }
}

/**
 * Create a Verifiable Credential JWT using did-jwt-vc
 */
export async function createVerifiableCredential(
  walletClient: WalletClient,
  chainId: number,
  credentialSubject: Record<string, any>,
  credentialType: string[] = ['VerifiableCredential'],
  expiresIn: number = 60 * 60 * 24 * 365, // 1 year default for credentials
): Promise<string> {
  if (!walletClient.account?.address) {
    throw new Error('Wallet not connected')
  }

  const address = walletClient.account.address
  const issuerDid = getEthereumDID(address, chainId)

  // Ensure credentialSubject has an id (usually the holder's DID)
  const subjectWithId = {
    id: credentialSubject.id || issuerDid,
    ...credentialSubject,
  }

  // Create the ES256K signer using wagmi
  const signer = createWagmiES256KSigner(walletClient)

  // Build the credential payload
  const vcPayload: JwtCredentialPayload = {
    sub: subjectWithId.id,
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: credentialType,
      credentialSubject: subjectWithId,
    },
  }

  // Create and sign the verifiable credential JWT
  // The issuer parameter expects a Issuer object with did and signer
  const vcJwt = await createVerifiableCredentialJwt(vcPayload, {
    did: issuerDid,
    signer,
    alg: 'ES256K-R',
  })

  return vcJwt
}

/**
 * Verify a Verifiable Credential JWT
 */
export async function verifyVerifiableCredential(vcJwt: string) {
  try {
    const verifiedVC = await verifyCredential(vcJwt, resolver)
    return verifiedVC
  } catch (error) {
    console.error('VC verification failed:', error)
    throw new Error('Invalid or expired Verifiable Credential')
  }
}
