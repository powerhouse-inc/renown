// URL state and paging helpers for the /apps directory (pure; shared by the
// page's getServerSideProps and its client-side updates).
import type { RenownAppProfile } from '../services/app-profiles'

/** Apps per page (first SSR page and every "Load more"). */
export const APPS_PAGE_SIZE = 24

/** The longest category an app profile can carry; anything longer matches nothing. */
export const CATEGORY_MAX_LENGTH = 40

/**
 * The `?category=` value as the directory uses it: the first value, trimmed;
 * blank, absent or longer than a stored category can be means "all apps".
 */
export function parseCategory(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim() ?? ''
  if (!trimmed || trimmed.length > CATEGORY_MAX_LENGTH) return null
  return trimmed
}

/** Whether two categories are the same filter (the backend matches case-insensitively). */
export function sameCategory(a: string | null, b: string | null): boolean {
  return (a ?? '').toLowerCase() === (b ?? '').toLowerCase()
}

/** The directory URL for a category (null = all apps). */
export function appsHref(category: string | null): string {
  return category ? `/apps?category=${encodeURIComponent(category)}` : '/apps'
}

/** `existing` followed by the apps of `incoming` it does not already hold (a page can shift while paging). */
export function appendApps(existing: RenownAppProfile[], incoming: RenownAppProfile[]): RenownAppProfile[] {
  const seen = new Set(existing.map((app) => app.appDid))
  return [...existing, ...incoming.filter((app) => !seen.has(app.appDid))]
}
