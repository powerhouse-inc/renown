import { createEmptyDocument, makeAction, mutateDocument } from './switchboard'

interface EIP712Domain {
  version: string
  chainId: bigint | number
}

interface EIP712Credential {
  '@context': string[]
  type: string[]
  id: string
  issuer: {
    id: string
    ethereumAddress: string
  }
  credentialSubject: {
    id: string
    app: string
  }
  credentialSchema: {
    id: string
    type: string
  }
  issuanceDate: string
  expirationDate: string
}

// Create and initialize a new RenownCredential document with EIP-712 credential
export async function storeCredential(params: {
  driveId?: string
  credential: EIP712Credential
  signature: string
  domain: EIP712Domain
  ethAddress: string
}): Promise<{ success: boolean; credentialId?: string }> {
  try {
    const { credential, signature, domain } = params

    // Create a new RenownCredential document
    const credentialId = await createEmptyDocument('powerhouse/renown-credential')

    if (!credentialId) {
      throw new Error('Failed to create credential document')
    }

    // Construct the INIT action input
    const initInput = {
      id: credential.id,
      context: credential['@context'],
      type: credential.type,
      issuer: {
        id: credential.issuer.id,
        ethereumAddress: credential.issuer.ethereumAddress,
      },
      credentialSubject: {
        id: credential.credentialSubject.id,
        app: credential.credentialSubject.app,
      },
      credentialSchema: {
        id: credential.credentialSchema.id,
        type: credential.credentialSchema.type,
      },
      issuanceDate: credential.issuanceDate,
      expirationDate: credential.expirationDate || undefined,
      proof: {
        type: 'EthereumEip712Signature2021',
        created: credential.issuanceDate,
        verificationMethod: credential.issuer.id,
        proofPurpose: 'assertionMethod',
        proofValue: signature,
        ethereumAddress: credential.issuer.ethereumAddress,
        eip712: {
          domain: {
            version: domain.version,
            chainId: typeof domain.chainId === 'bigint' ? Number(domain.chainId) : domain.chainId,
          },
          primaryType: 'VerifiableCredential',
        },
      },
    }

    // Initialize the credential with EIP-712 data
    await mutateDocument(credentialId, [makeAction('INIT', initInput)])

    return {
      success: true,
      credentialId,
    }
  } catch (error) {
    console.error('Failed to store credential:', error)
    throw error
  }
}

// Revoke an existing credential
export async function revokeCredential(params: {
  credentialId: string
  reason?: string
  revokedAt?: string
}): Promise<boolean> {
  try {
    await mutateDocument(params.credentialId, [
      makeAction('REVOKE', {
        revokedAt: params.revokedAt || new Date().toISOString(),
        reason: params.reason || null,
      }),
    ])

    return true
  } catch (error) {
    console.error('Failed to revoke credential:', error)
    throw error
  }
}
