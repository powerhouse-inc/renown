// Canonical messages a wallet personal_signs to authorise a renown-orgs write
// (organisations on the switchboard). The code below is copied verbatim from
// renown-package sdk/orgs.ts (exported as @powerhousedao/renown-package/orgs;
// the renown-orgs subgraph imports the same file), so the browser hashes
// exactly the bytes the switchboard hashes. e2e/org-client.spec.ts pins it
// against renown-package's vectors. Do not reformat.

/** Organisation roles, highest first. */
export const ORG_ROLES = ["OWNER", "ADMIN", "PUBLISHER", "MEMBER"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

const RANK: Record<OrgRole, number> = { MEMBER: 0, PUBLISHER: 1, ADMIN: 2, OWNER: 3 };

/** The role named by `value` (any case, trimmed), or null. */
export function parseOrgRole(value: string): OrgRole | null {
  const upper = value.trim().toUpperCase();
  return Object.hasOwn(RANK, upper) ? (upper as OrgRole) : null;
}

/** True when `role` is `min` or higher; unknown roles never qualify. */
export function roleAtLeast(role: string, min: string): boolean {
  const have = parseOrgRole(role);
  const need = parseOrgRole(min);
  return have !== null && need !== null && RANK[have] >= RANK[need];
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : sortKeys(item)));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) out[key] = sortKeys(record[key]);
    }
    return out;
  }
  return value;
}

/** JSON with object keys sorted recursively, no whitespace, undefined dropped and null kept. */
export function canonicalJson(value: unknown): string {
  const json = JSON.stringify(sortKeys(value)) as string | undefined;
  return json ?? "null";
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The message a wallet personal_signs to authorise a renown-orgs field
 * (mutation, or a query that needs a caller) without a bearer:
 *   Renown organization <field> <orgId or -> <sha256 hex of canonicalJson(args)> at <timestamp>
 * `args` are the field's arguments exactly as sent; `auth` and `orgId` are
 * dropped from them before hashing. `timestamp`: ISO-8601 with a zone,
 * within 10 minutes of the server's clock.
 */
export async function orgMessage(
  mutation: string,
  orgId: string | null | undefined,
  args: Record<string, unknown>,
  timestamp: string,
): Promise<string> {
  const { auth: _auth, orgId: _orgId, ...rest } = args;
  return `Renown organization ${mutation} ${orgId || "-"} ${await sha256Hex(canonicalJson(rest))} at ${timestamp}`;
}
