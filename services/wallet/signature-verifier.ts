import {
  createPublicClient,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type TypedDataDomain,
  type TypedDataParameter,
} from 'viem'
import { AccountType } from './types'

export interface VerifyTypedDataInput {
  domain: TypedDataDomain
  types: Record<string, readonly TypedDataParameter[]>
  primaryType: string
  message: Record<string, unknown>
}

export class SignatureVerifier {
  private readonly chains: Map<number, Chain>
  private readonly clients = new Map<number, PublicClient>()

  constructor(chains: readonly Chain[]) {
    this.chains = new Map(chains.map(c => [c.id, c]))
  }

  private client(chainId: number): PublicClient {
    const cached = this.clients.get(chainId)
    if (cached) return cached
    const chain = this.chains.get(chainId)
    if (!chain) {
      throw new Error(`SignatureVerifier has no chain registered for id ${chainId}`)
    }
    const client = createPublicClient({ chain, transport: http() })
    this.clients.set(chainId, client)
    return client
  }

  async verifyMessage(
    address: Hex,
    message: string,
    signature: Hex,
    chainId: number,
  ): Promise<boolean> {
    return this.client(chainId).verifyMessage({ address, message, signature })
  }

  async verifyTypedData(
    address: Hex,
    data: VerifyTypedDataInput,
    signature: Hex,
    chainId: number,
  ): Promise<boolean> {
    return this.client(chainId).verifyTypedData({
      address,
      // viem's TypedData type is stricter than ours; the generic accepts our shape at runtime.
      domain: data.domain,
      types: data.types as never,
      primaryType: data.primaryType as never,
      message: data.message as never,
      signature,
    })
  }

  async resolveAccountType(address: Hex, chainId: number): Promise<AccountType> {
    const code = await this.client(chainId).getCode({ address })
    return code && code !== '0x' ? AccountType.SMART_ACCOUNT : AccountType.EOA
  }
}
