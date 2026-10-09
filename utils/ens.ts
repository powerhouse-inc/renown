// Server-side ENS check behind the profile's "ENS verified" badge: the
// stored username is an ENS name that resolves to the profile's address.
import { createPublicClient, http, type PublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'

const TIMEOUT_MS = 2_000
const TTL_MS = 10 * 60_000
const cache = new Map<string, { verified: boolean; until: number }>()
let client: PublicClient | undefined

/** True when `name` (a .eth name) resolves to `address`. Never throws; false on any failure or timeout. */
export async function isEnsVerified(name: string | null | undefined, address: string | null | undefined): Promise<boolean> {
  if (!name || !address || !name.toLowerCase().endsWith('.eth')) return false
  const key = `${name.toLowerCase()} ${address.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return hit.verified

  let verified = false
  try {
    client ??= createPublicClient({ chain: mainnet, transport: http(process.env.ENS_RPC_URL || undefined) })
    const resolved = await Promise.race([
      client.getEnsAddress({ name: normalize(name) }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ])
    verified = !!resolved && resolved.toLowerCase() === address.toLowerCase()
  } catch {
    verified = false
  }
  cache.set(key, { verified, until: Date.now() + TTL_MS })
  return verified
}
