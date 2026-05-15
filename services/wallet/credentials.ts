import type { Hex } from 'viem'
import { v4 as uuidv4 } from 'uuid'
import type { Signer } from './types'

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

export const CREDENTIAL_TYPES = {
  EIP712Domain: DOMAIN_TYPE,
  VerifiableCredential: VERIFIABLE_CREDENTIAL_EIP712_TYPE,
  CredentialSchema: CREDENTIAL_SCHEMA_EIP712_TYPE,
  CredentialSubject: CREDENTIAL_SUBJECT_TYPE,
  Issuer: ISSUER_TYPE,
} as const

export interface BuildAndSignVcParams {
  signer: Signer
  address: Hex
  chainId: number
  app: string
  appId?: string
  expiresInDays?: number
}

export interface SignedVc {
  credential: {
    '@context': string[]
    type: string[]
    id: string
    issuer: { id: string; ethereumAddress: Hex }
    credentialSubject: { id: string; app: string }
    credentialSchema: { id: string; type: string }
    issuanceDate: string
    expirationDate: string
  }
  signature: Hex
  domain: { version: string; chainId: number }
}

export async function buildAndSignEip712Vc(params: BuildAndSignVcParams): Promise<SignedVc> {
  const { signer, address, chainId, app, appId, expiresInDays = 7 } = params

  const issuerId = `did:pkh:eip155:${chainId}:${address.toLowerCase()}`
  const credentialId = `urn:uuid:${uuidv4()}`
  const now = new Date()
  const expirationDate = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000)

  const credential: SignedVc['credential'] = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'RenownCredential'],
    id: credentialId,
    issuer: {
      id: issuerId,
      ethereumAddress: address,
    },
    credentialSubject: {
      id: appId || issuerId,
      app,
    },
    credentialSchema: {
      id: 'https://renown.id/schemas/renown-credential/v1',
      type: 'JsonSchemaValidator2018',
    },
    issuanceDate: now.toISOString(),
    expirationDate: expirationDate.toISOString(),
  }

  const domain = {
    version: '1',
    chainId,
  }

  const signature = await signer.signTypedData({
    domain,
    types: CREDENTIAL_TYPES,
    primaryType: 'VerifiableCredential',
    message: credential as unknown as Record<string, unknown>,
  })

  return { credential, signature, domain }
}
