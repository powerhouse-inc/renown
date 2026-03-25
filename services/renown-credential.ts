import { request, gql } from 'graphql-request'

const SWITCHBOARD_URL =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown.vetra.io/graphql'

const CREATE_EMPTY_DOCUMENT = gql`
  mutation CreateEmptyDocument($documentType: String!, $parentIdentifier: String) {
    createEmptyDocument(documentType: $documentType, parentIdentifier: $parentIdentifier) {
      id
    }
  }
`

const MUTATE_DOCUMENT = gql`
  mutation MutateDocument($documentIdentifier: String!, $actions: [ActionInput!]!) {
    mutateDocument(documentIdentifier: $documentIdentifier, actions: $actions) {
      id
    }
  }
`

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

/**
 * Create and initialize a new RenownCredential document with EIP-712 credential
 */
export async function storeCredential(params: {
  driveId?: string
  credential: EIP712Credential
  signature: string
  domain: EIP712Domain
  ethAddress: string
}): Promise<{ success: boolean; credentialId?: string }> {
  try {
    const { credential, signature, domain, ethAddress } = params

    // Create a new RenownCredential document
    const createResult = (await request(SWITCHBOARD_URL, CREATE_EMPTY_DOCUMENT, {
      documentType: 'powerhouse/renown-credential',
    })) as { createEmptyDocument: { id: string } }

    const credentialId = createResult.createEmptyDocument.id

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
    await request(SWITCHBOARD_URL, MUTATE_DOCUMENT, {
      documentIdentifier: credentialId,
      actions: [{ type: 'INIT', input: initInput }],
    })

    return {
      success: true,
      credentialId,
    }
  } catch (error) {
    console.error('Failed to store credential:', error)
    throw error
  }
}

/**
 * Revoke an existing credential
 */
export async function revokeCredential(params: {
  credentialId: string
  reason?: string
  revokedAt?: string
}): Promise<boolean> {
  try {
    await request(SWITCHBOARD_URL, MUTATE_DOCUMENT, {
      documentIdentifier: params.credentialId,
      actions: [{
        type: 'REVOKE',
        input: {
          revokedAt: params.revokedAt || new Date().toISOString(),
          reason: params.reason || null,
        },
      }],
    })

    return true
  } catch (error) {
    console.error('Failed to revoke credential:', error)
    throw error
  }
}
