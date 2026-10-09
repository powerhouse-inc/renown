// The signed-in user's approvals (renownCredentials issued by their address),
// grouped by the app or session they were issued to. Pure.
import type { RenownAppProfile } from '../../services/app-profiles'

/** The renownCredentials fields /me reads. */
export interface IssuedCredential {
  documentId: string
  /** The VC id (urn:uuid:…); what renown_revokeCredential takes. */
  credentialId: string
  issuerId: string
  issuanceDate: string
  expirationDate: string | null
  /** The DID the credential was issued to (app or CLI); null on old credentials. */
  credentialSubjectId: string | null
  /** The name the requesting app gave itself. */
  credentialSubjectApp: string
  revoked: boolean
}

/** One approval as a row. */
export interface Connection {
  credentialId: string
  issuedAt: string
  expiresAt: string | null
}

/** Every approval for one subject DID. */
export interface ConnectionGroup {
  subject: string
  /** app: the subject has a public app profile; session: a CLI or another unlisted client. */
  kind: 'app' | 'session'
  /** Display name: the app profile's name, else the name the client gave itself. */
  name: string
  app: RenownAppProfile | null
  connections: Connection[]
}

export interface GroupedConnections {
  apps: ConnectionGroup[]
  sessions: ConnectionGroup[]
}

/** The DID a credential was issued to (old credentials name only the issuer). */
export function subjectOf(credential: IssuedCredential): string {
  return credential.credentialSubjectId || credential.issuerId
}

/** Subject DIDs that can have an app profile (app identities are did:key), without duplicates. */
export function profileCandidates(credentials: IssuedCredential[]): string[] {
  return [...new Set(credentials.map(subjectOf))].filter((did) => did.startsWith('did:key:'))
}

/** True when `expiresAt` is set and not in the future. */
export function isExpired(expiresAt: string | null, now: Date): boolean {
  return expiresAt !== null && Date.parse(expiresAt) <= now.getTime()
}

/** did:key:z6MkhaXg…Rw3F — short enough for a row, still distinguishable. */
export function shortDid(did: string): string {
  return did.length <= 28 ? did : `${did.slice(0, 16)}…${did.slice(-4)}`
}

/**
 * Groups unrevoked credentials by subject: subjects with an app profile under
 * apps, the rest under sessions. Copies of one VC (several documents, same
 * credentialId) count once; ids in `hidden` (revoked here, read model not yet
 * caught up) are left out. Groups and rows are newest first.
 */
export function groupConnections(
  credentials: IssuedCredential[],
  profiles: Readonly<Record<string, RenownAppProfile | null>>,
  hidden: ReadonlySet<string> = new Set(),
): GroupedConnections {
  const seen = new Set<string>()
  const groups = new Map<string, ConnectionGroup>()
  const sorted = [...credentials].sort((a, b) => Date.parse(b.issuanceDate) - Date.parse(a.issuanceDate))
  for (const credential of sorted) {
    if (credential.revoked || hidden.has(credential.credentialId) || seen.has(credential.credentialId)) continue
    seen.add(credential.credentialId)
    const subject = subjectOf(credential)
    let group = groups.get(subject)
    if (!group) {
      const app = profiles[subject] ?? null
      group = {
        subject,
        kind: app ? 'app' : 'session',
        name: app?.name || credential.credentialSubjectApp || 'Unnamed client',
        app,
        connections: [],
      }
      groups.set(subject, group)
    }
    group.connections.push({
      credentialId: credential.credentialId,
      issuedAt: credential.issuanceDate,
      expiresAt: credential.expirationDate,
    })
  }
  const all = [...groups.values()]
  return { apps: all.filter((g) => g.kind === 'app'), sessions: all.filter((g) => g.kind === 'session') }
}

/** The user's DID: the issuer id their credentials carry, else did:pkh on Ethereum mainnet. */
export function identityDid(address: string, credentials: IssuedCredential[]): string {
  const lower = address.toLowerCase()
  return credentials.find((c) => c.issuerId.toLowerCase().endsWith(`:${lower}`))?.issuerId ?? `did:pkh:eip155:1:${lower}`
}
