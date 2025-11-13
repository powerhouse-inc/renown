import { request, gql } from 'graphql-request'

const SWITCHBOARD_URL =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown-staging.vetra.io/graphql'

const CREATE_CREDENTIAL_MUTATION = gql`
  mutation RenownCredential_createDocument($name: String!, $driveId: String) {
    RenownCredential_createDocument(name: $name, driveId: $driveId)
  }
`

const INIT_CREDENTIAL_MUTATION = gql`
  mutation RenownCredential_init($docId: PHID!, $input: RenownCredential_InitInput!) {
    RenownCredential_init(docId: $docId, input: $input)
  }
`

const REVOKE_CREDENTIAL_MUTATION = gql`
  mutation RenownCredential_revoke($docId: PHID!, $input: RenownCredential_RevokeInput!) {
    RenownCredential_revoke(docId: $docId, input: $input)
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
    const createResult = (await request(SWITCHBOARD_URL, CREATE_CREDENTIAL_MUTATION, {
      name: `Credential for ${ethAddress.slice(0, 8)}...`,
      driveId: params.driveId,
    })) as { RenownCredential_createDocument: string }

    const credentialId = createResult.RenownCredential_createDocument

    if (!credentialId) {
      throw new Error('Failed to create credential document')
    }

    // Construct the InitInput for EIP-712 credential
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
    const initResult = (await request(SWITCHBOARD_URL, INIT_CREDENTIAL_MUTATION, {
      docId: credentialId,
      input: initInput,
    })) as { RenownCredential_init: number }

    if (initResult.RenownCredential_init === 0) {
      throw new Error('Failed to initialize credential')
    }

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
    const result = (await request(SWITCHBOARD_URL, REVOKE_CREDENTIAL_MUTATION, {
      docId: params.credentialId,
      input: {
        revokedAt: params.revokedAt || new Date().toISOString(),
        reason: params.reason || null,
      },
    })) as { RenownCredential_revoke: number }

    return result.RenownCredential_revoke > 0
  } catch (error) {
    console.error('Failed to revoke credential:', error)
    throw error
  }
}
