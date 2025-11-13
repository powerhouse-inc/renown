import type { WalletClient } from 'viem'
import { v4 as uuidv4 } from 'uuid'

// EIP-712 domain and types (from Powerhouse Renown SDK constants)
const DOMAIN_TYPE = [
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
] as const

const VERIFIABLE_CREDENTIAL_EIP712_TYPE = [
  { name: '@context', type: 'string[]' },
  { name: 'type', type: 'string[]' },
  { name: 'id', type: 'string' },
  { name: 'issuer', type: 'Issuer' },
  { name: 'credentialSubject', type: 'CredentialSubject' },
  { name: 'credentialSchema', type: 'CredentialSchema' },
  { name: 'issuanceDate', type: 'string' },
  { name: 'expirationDate', type: 'string' },
] as const

const CREDENTIAL_SCHEMA_EIP712_TYPE = [
  { name: 'id', type: 'string' },
  { name: 'type', type: 'string' },
] as const

const CREDENTIAL_SUBJECT_TYPE = [
  { name: 'app', type: 'string' },
  { name: 'id', type: 'string' },
] as const

const ISSUER_TYPE = [
  { name: 'id', type: 'string' },
  { name: 'ethereumAddress', type: 'string' },
] as const

const CREDENTIAL_TYPES = {
  EIP712Domain: DOMAIN_TYPE,
  VerifiableCredential: VERIFIABLE_CREDENTIAL_EIP712_TYPE,
  CredentialSchema: CREDENTIAL_SCHEMA_EIP712_TYPE,
  CredentialSubject: CREDENTIAL_SUBJECT_TYPE,
  Issuer: ISSUER_TYPE,
} as const

export interface CreateEIP712CredentialParams {
  walletClient: WalletClient
  chainId: number
  app: string
  connectId?: string
  expiresInDays?: number
}

/**
 * Create and sign an EIP-712 Verifiable Credential
 */
export async function createEIP712Credential(params: CreateEIP712CredentialParams) {
  const {
    walletClient,
    chainId,
    app,
    connectId,
    expiresInDays = 7,
  } = params

  if (!walletClient.account?.address) {
    throw new Error('Wallet not connected')
  }

  const address = walletClient.account.address
  const issuerId = `did:pkh:eip155:${chainId}:${address.toLowerCase()}`
  const credentialId = `urn:uuid:${uuidv4()}`
  const now = new Date()
  const expirationDate = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000)

  // Build the credential
  const credential = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'RenownCredential'],
    id: credentialId,
    issuer: {
      id: issuerId,
      ethereumAddress: address,
    },
    credentialSubject: {
      id: connectId || issuerId,
      app,
    },
    credentialSchema: {
      id: 'https://renown.id/schemas/renown-credential/v1',
      type: 'JsonSchemaValidator2018',
    },
    issuanceDate: now.toISOString(),
    expirationDate: expirationDate.toISOString(),
  }

  // EIP-712 domain
  const domain = {
    version: '1',
    chainId: BigInt(chainId),
  }

  // Sign with EIP-712
  const signature = await walletClient.signTypedData({
    account: walletClient.account,
    domain,
    types: CREDENTIAL_TYPES,
    primaryType: 'VerifiableCredential',
    message: credential as any,
  })

  return {
    credential,
    signature,
    domain,
  }
}
