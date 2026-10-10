// How a public profile names and identifies its owner. Pure.
import type { RenownProfile } from '../services/switchboard'

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Legacy usernames that are only a shortened address ("0x2BbE...3aC6") say nothing a name should. */
function isAddressLike(value: string): boolean {
  return /^0x[0-9a-f]{3,}(\.\.\.|…)[0-9a-f]{3,}$/i.test(value) || ADDRESS_RE.test(value)
}

/**
 * The name a profile is shown under: display name, then handle, then the
 * username (an ENS name or a legacy name, unless it is just an address), then
 * the short address, then the document id.
 */
export function profileDisplayName(profile: Pick<RenownProfile, 'displayName' | 'handle' | 'username' | 'ethAddress' | 'documentId'>): string {
  const username = profile.username?.trim()
  return (
    profile.displayName?.trim() ||
    profile.handle ||
    (username && !isAddressLike(username) ? username : '') ||
    (profile.ethAddress && ADDRESS_RE.test(profile.ethAddress) ? shortAddress(profile.ethAddress) : '') ||
    profile.documentId
  )
}

/** The wallet's Renown DID (did:pkh on Ethereum mainnet, lowercase address). */
export function walletDid(address: string): string {
  return `did:pkh:eip155:1:${address.toLowerCase()}`
}

/** "June 2026" (UTC, same text on server and client); null without a valid date. */
export function memberSince(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
