// "Download my data": the profile and approvals exactly as /me shows them. Pure.
import type { RenownProfile } from '../../services/switchboard'
import { isExpired, type GroupedConnections } from './connections'

export interface MyDataInput {
  address: string
  did: string
  profile: RenownProfile | null
  connections: GroupedConnections
  now: Date
}

/** Pretty-printed JSON of the user's profile fields and approvals. */
export function myDataJson({ address, did, profile, connections, now }: MyDataInput): string {
  const groups = [...connections.apps, ...connections.sessions]
  return JSON.stringify(
    {
      exportedAt: now.toISOString(),
      address: address.toLowerCase(),
      did,
      profile: profile && {
        documentId: profile.documentId,
        displayName: profile.displayName ?? null,
        handle: profile.handle ?? null,
        bio: profile.bio ?? null,
        links: (profile.links ?? []).map(({ label, url }) => ({ label, url })),
        avatar: profile.avatar ?? null,
        userImage: profile.userImage ?? null,
        username: profile.username ?? null,
        createdAt: profile.createdAt ?? null,
        updatedAt: profile.updatedAt ?? null,
      },
      approvals: groups.map((group) => ({
        subject: group.subject,
        kind: group.kind,
        name: group.name,
        credentials: group.connections.map((c) => ({
          credentialId: c.credentialId,
          issuedAt: c.issuedAt,
          expiresAt: c.expiresAt,
          expired: isExpired(c.expiresAt, now),
        })),
      })),
    },
    null,
    2,
  )
}

export function myDataFileName(address: string): string {
  return `renown-${address.toLowerCase()}.json`
}
