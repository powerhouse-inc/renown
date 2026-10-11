// Who signed and for which app: the identity and app cards of a report, and
// the delegation check tokens and operations share. Pure apart from the
// injected lookups.
import { formatDay } from './format'
import type { AppParty, Check, SignerParty, StoredCredential, VerifyLookups } from './types'

/** Clock skew tolerated between a signer's clock and a credential's issuance time. */
export const SKEW_MS = 5 * 60 * 1000

export async function signerParty(lookups: VerifyLookups, address: string, chainId: number | null): Promise<SignerParty> {
  const found = await lookups.profileByAddress(address.toLowerCase())
  return { address: address.toLowerCase(), chainId, profile: found.ok ? found.value : null, looked: found.ok }
}

export async function appParty(
  lookups: VerifyLookups,
  did: string,
  claimedName: string | null,
  session = false,
): Promise<AppParty> {
  if (session || !did.startsWith('did:key:')) {
    return { did, claimedName, profile: null, looked: true, session: true }
  }
  const found = await lookups.appProfile(did)
  return { did, claimedName, profile: found.ok ? found.value : null, looked: found.ok, session: false }
}

function isoOrNull(value: string | null): number | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : t
}

export type DelegationOutcome = 'authorised' | 'revoked' | 'expired' | 'none' | 'unavailable'

export interface Delegation {
  outcome: DelegationOutcome
  check: Check
  /** The credential that authorised the key, when one did. */
  credential: StoredCredential | null
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/**
 * Whether a stored Renown credential of `address` delegates to `appDid`.
 * Issuance and expiry are judged at `at` (now for a token, the signing time
 * the operation states for an operation), with SKEW_MS for issuance. A
 * revocation counts whenever it happened: an operation's signing time is the
 * signer's own claim, so it cannot show the signature came before it.
 */
export async function checkDelegation(
  lookups: VerifyLookups,
  appDid: string,
  address: string,
  at: Date,
  when: 'now' | 'signed',
): Promise<Delegation> {
  const id = 'delegation'
  const label = 'Authorised by the user'
  const found = await lookups.credentialsFor(appDid, address.toLowerCase())
  if (!found.ok) {
    return {
      outcome: 'unavailable',
      credential: null,
      check: { id, label, status: 'unknown', detail: 'Renown could not be reached to look up the credential that authorises this key.' },
    }
  }
  const t = at.getTime()
  const issuedBy = found.value.filter((c) => (isoOrNull(c.issuanceDate) ?? Infinity) <= t + SKEW_MS)
  const live = issuedBy.filter((c) => {
    const expires = isoOrNull(c.expirationDate)
    return expires === null || expires > t
  })
  const valid = live.find((c) => !c.revoked)
  const atText = when === 'now' ? '' : ' at the signing time the operation states'
  if (valid) {
    return {
      outcome: 'authorised',
      credential: valid,
      check: {
        id,
        label,
        status: 'pass',
        detail: `A Renown credential from ${short(address)} authorised this app key${atText}.`,
      },
    }
  }
  if (live.length > 0) {
    const revokedAt = live[0].revokedAt && isoOrNull(live[0].revokedAt) !== null ? ` on ${formatDay(live[0].revokedAt)}` : ''
    return {
      outcome: 'revoked',
      credential: live[0],
      check: { id, label, status: 'fail', detail: `${short(address)} revoked the credential that authorised this app key${revokedAt}.` },
    }
  }
  if (issuedBy.length > 0) {
    return {
      outcome: 'expired',
      credential: issuedBy[0],
      check: {
        id,
        label,
        status: 'fail',
        detail: `The credential that authorised this app key had expired${when === 'now' ? '' : ' by the signing time the operation states'}.`,
      },
    }
  }
  return {
    outcome: 'none',
    credential: null,
    check: {
      id,
      label,
      status: 'fail',
      detail: `No Renown credential from ${short(address)} authorises this app key${atText}, so the signature does not show that ${short(address)} made it.`,
    },
  }
}
