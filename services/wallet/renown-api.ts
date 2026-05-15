import type { Hex } from 'viem'
import type { SignedVc } from './credentials'

export interface PostCredentialBody {
  credential: SignedVc['credential']
  signature: Hex
  domain: { version: string; chainId: number }
  username?: string
  userImage?: string | null
  driveId?: string
  docId?: string
}

export interface PostCredentialResponse {
  credentialId?: string
  userDocumentId?: string
  [key: string]: unknown
}

export interface DeleteCredentialBody {
  credentialId: string
  address: Hex
  reason?: string
}

export interface FetchCredentialResponse {
  credential?: { id: string; [key: string]: unknown }
  userDocumentId?: string
  [key: string]: unknown
}

export class RenownApi {
  constructor(private readonly baseUrl: string = '') {}

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }

  async postCredential(body: PostCredentialBody): Promise<PostCredentialResponse> {
    const response = await fetch(this.url('/api/credential/renown'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(errorData.error || `Failed to store credential (${response.status})`)
    }

    return response.json()
  }

  async deleteCredential(body: DeleteCredentialBody): Promise<void> {
    const response = await fetch(this.url('/api/credential/renown'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const responseData = await response.json().catch(() => ({}))
      throw new Error(responseData.error || `Failed to revoke credential (${response.status})`)
    }
  }

  async fetchCredential(params: {
    address: Hex
    appId?: string
    includeRevoked?: boolean
  }): Promise<FetchCredentialResponse | null> {
    const search = new URLSearchParams({
      address: params.address,
      includeRevoked: params.includeRevoked ? 'true' : 'false',
    })
    if (params.appId) search.set('appId', params.appId)

    const response = await fetch(this.url(`/api/auth/credential?${search.toString()}`))
    if (!response.ok) return null
    return response.json()
  }
}
