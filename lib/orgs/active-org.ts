// The organisation the visitor last managed (spec 5: localStorage
// "renown.activeOrg"): listed first in the account menu. Storage may be
// unavailable; then nothing is remembered.

export const ACTIVE_ORG_KEY = 'renown.activeOrg'

export function readActiveOrg(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_ORG_KEY)
  } catch {
    return null
  }
}

export function writeActiveOrg(orgId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_ORG_KEY, orgId)
  } catch {
    // storage blocked: the menu keeps its default order
  }
}

/** `items` with the active organisation first, the rest in their order. */
export function activeFirst<T extends { org: { id: string } }>(
  items: T[],
  active: string | null,
): T[] {
  if (!active) return items
  return [
    ...items.filter((item) => item.org.id === active),
    ...items.filter((item) => item.org.id !== active),
  ]
}
