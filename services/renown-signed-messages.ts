// Canonical messages a Renown issuer signs (EIP-191 personal_sign) to authorize
// a write on the switchboard's renown-auth subgraph. The functions below are
// copied verbatim from renown-package subgraphs/renown-auth/core/signed-message.ts
// (the server verifies against its own copy); e2e/renown-signed-messages.spec.ts
// pins both against the server's vectors. Replace with the @renown/sdk export
// once a release ships it.

// Signed actions (revoke, profile update) must carry a timestamp within this
// window of the server's clock, in either direction. Signing a fresh message
// and replaying an old one both fail outside this bound.
export const SIGNATURE_WINDOW_MS = 600_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

/** Canonical message a caller signs to authorize revoking `credentialId`. */
export function revokeMessage(credentialId: string, timestamp: string): string {
  return `Revoke Renown credential ${credentialId} at ${timestamp}`;
}

/** A profile link as signed and stored. */
export interface ProfileLink {
  id: string;
  label: string;
  url: string;
}

/** Every field a signed profile upsert may carry. Absent and null mean "unchanged". */
export interface ProfileFields {
  username?: string | null;
  userImage?: string | null;
  displayName?: string | null;
  handle?: string | null;
  bio?: string | null;
  links?: readonly ProfileLink[] | null;
  avatar?: string | null;
}

/**
 * The JSON a profile signature hashes. Legacy writes (username/userImage
 * only) keep the exact two-key payload older clients sign. As soon as any
 * identity field is present, all seven keys are hashed in this fixed order,
 * and each link is reduced to `{id, label, url}` in that key order, so the
 * client and the server serialize the same bytes.
 */
export function profilePayload(profile: ProfileFields): string {
  const legacy = { username: profile.username ?? null, userImage: profile.userImage ?? null };
  const identity = [profile.displayName, profile.handle, profile.bio, profile.links, profile.avatar];
  if (identity.every((value) => value === undefined || value === null)) {
    return JSON.stringify(legacy);
  }
  return JSON.stringify({
    ...legacy,
    displayName: profile.displayName ?? null,
    handle: profile.handle ?? null,
    bio: profile.bio ?? null,
    links: profile.links ? profile.links.map(({ id, label, url }) => ({ id, label, url })) : null,
    avatar: profile.avatar ?? null,
  });
}

/**
 * Canonical message a caller signs to authorize a profile upsert. The payload
 * is hashed (rather than embedded raw) so the signed message has a fixed
 * shape regardless of field content.
 */
export async function profileMessage(
  address: string,
  profile: ProfileFields,
  timestamp: string,
): Promise<string> {
  const hash = await sha256hex(profilePayload(profile));
  return `Update Renown profile ${address.toLowerCase()} ${hash} at ${timestamp}`;
}

// Full date + time + an explicit zone (`Z` or `±HH:MM`), no bare local-time
// strings. `Date.parse` alone accepts zone-less and date-only strings too
// (interpreting them ambiguously as local time), which a signed-timestamp
// freshness check must not.
const STRICT_ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** True when `timestamp` (strict ISO-8601, zone required) is within `SIGNATURE_WINDOW_MS` of `now`. */
export function isFreshTimestamp(timestamp: string, now: Date): boolean {
  if (!STRICT_ISO_8601_RE.test(timestamp)) return false;
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return false;
  return Math.abs(now.getTime() - t) <= SIGNATURE_WINDOW_MS;
}
