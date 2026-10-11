// Wording helpers shared by the /verify checks. Pure.
import type { AppParty, SignerParty } from './types'

/** "11 October 2026, 14:05 UTC": the same text on the server, the client and in tests. */
export function formatInstant(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${day}, ${time} UTC`
}

/** "11 October 2026". */
export function formatDay(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** The text with its first letter capitalised (names like "an unnamed app" can open a sentence). */
export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** How a report names its signer: profile name, then @handle, then the short address. */
export function signerName(signer: SignerParty): string {
  const p = signer.profile
  return p?.displayName?.trim() || (p?.handle ? `@${p.handle}` : '') || shortAddress(signer.address)
}

/** How a report names its app: profile name, then the name its credential carries, then "an unnamed app". */
export function appName(app: AppParty): string {
  if (app.session) return 'a CLI or other session'
  return app.profile?.name?.trim() || app.claimedName?.trim() || 'an unnamed app'
}
