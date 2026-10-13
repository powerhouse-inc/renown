// Organisation handles: the same rule as user handles (one namespace, A1
// ruling 8). The switchboard decides; these only guide the form. Pure.

export const ORG_HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/

/** Words no organisation may take (renown-package A1 ruling 8); people's reserved words are checked by the switchboard. */
export const ORG_RESERVED_HANDLES = ['org', 'orgs', 'new', 'invite', 'invites', 'notifications', 'me', 'verify', 'people', 'search'] as const

export function normalizeOrgHandle(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase()
}

/** Why `handle` (already normalised) cannot be used, or null. */
export function orgHandleProblem(handle: string): string | null {
  if (!handle) return 'Choose a handle.'
  if (!ORG_HANDLE_RE.test(handle)) {
    return 'Use 3 to 30 lowercase letters, digits or hyphens, starting and ending with a letter or digit.'
  }
  if ((ORG_RESERVED_HANDLES as readonly string[]).includes(handle)) return 'This handle is reserved.'
  return null
}

/** A handle suggested from a display name ("Acme Inc. — Zürich" → "acme-inc-zurich"); '' when none fits. */
export function handleFromName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '')
  return ORG_HANDLE_RE.test(slug) ? slug : ''
}

/** A route segment as an organisation lookup: a handle when it looks like one, else an id. */
export function orgRef(ref: string): { id: string } | { handle: string } {
  const lower = ref.trim().toLowerCase()
  return ORG_HANDLE_RE.test(lower) ? { handle: lower } : { id: ref.trim() }
}
