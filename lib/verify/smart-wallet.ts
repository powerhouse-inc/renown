// Smart-wallet signatures (ERC-1271, and ERC-6492 for a wallet not deployed
// yet): offline ecrecover cannot check them, so the chain is asked with a
// read-only eth_call, like the switchboard does (renown-package
// subgraphs/renown-auth/core/smart-wallet.ts). Only reached after the offline
// check failed; viem's chain client is loaded only then.
import { CLIENT_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'
import type { ContractSignature, ContractSignatureArgs } from './types'

/** The parts of a viem PublicClient this needs (a fake in tests). */
export interface ChainReader {
  getCode(args: { address: `0x${string}` }): Promise<`0x${string}` | undefined>
  verifyTypedData(args: Record<string, unknown>): Promise<boolean>
}

/** Suffix of an ERC-6492 signature (a wallet that is not deployed yet). */
const ERC6492_SUFFIX = '6492649264926492649264926492649264926492649264926492649264926492'

const INFURA: Record<number, string> = {
  1: 'mainnet',
  11155111: 'sepolia',
  137: 'polygon-mainnet',
  10: 'optimism-mainnet',
  42161: 'arbitrum-mainnet',
  8453: 'base-mainnet',
}
const PUBLIC_MAINNET_RPC = 'https://ethereum-rpc.publicnode.com'
/** Per RPC request; the whole check is also held to CLIENT_DATA_TIMEOUT_MS, like the lookups. */
const RPC_TIMEOUT_MS = 4000

/** The RPC for `chainId`: Infura when configured (the wallet stack's own config), else a public node for mainnet. */
export function rpcUrl(chainId: number, infuraProjectId = process.env.NEXT_PUBLIC_VITE_INFURA_PROJECT_ID): string | null {
  const subdomain = INFURA[chainId]
  if (subdomain && infuraProjectId) return `https://${subdomain}.infura.io/v3/${infuraProjectId}`
  return chainId === 1 ? PUBLIC_MAINNET_RPC : null
}

/**
 * Asks `reader` whether `args.address` made the signature. An address with no
 * code and a signature without the ERC-6492 wrapper is a plain wallet whose
 * offline check already failed: 'not-contract', with no further call. Past
 * `deadlineMs` the answer is 'unavailable'.
 */
export async function checkContractSignature(
  reader: ChainReader,
  args: ContractSignatureArgs,
  deadlineMs = CLIENT_DATA_TIMEOUT_MS,
): Promise<ContractSignature> {
  const address = args.address as `0x${string}`
  const ask = async (): Promise<ContractSignature> => {
    const code = await reader.getCode({ address })
    const deployed = !!code && code !== '0x'
    if (!deployed && !args.signature.toLowerCase().endsWith(ERC6492_SUFFIX)) return 'not-contract'
    const valid = await reader.verifyTypedData({ ...args.typedData, address, signature: args.signature as `0x${string}` })
    return valid ? 'valid' : 'invalid'
  }
  try {
    return await withTimeout(ask(), deadlineMs)
  } catch {
    return 'unavailable'
  }
}

/** checkContractSignature against the chain itself (viem loaded on demand). */
export async function contractSignatureOnChain(args: ContractSignatureArgs): Promise<ContractSignature> {
  const url = rpcUrl(args.chainId)
  if (!url) return 'unavailable'
  const { createPublicClient, http } = await import('viem')
  const client = createPublicClient({ transport: http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }) })
  return checkContractSignature(client as unknown as ChainReader, args)
}
