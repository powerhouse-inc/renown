import type { AppProfilePage } from '../services/app-profiles'
import type { OrgHandlePage } from '../services/orgs'
import { orgPath } from './orgs/format'

/** Public, indexable site paths (pages Phase B/C add are listed here too). */
export const STATIC_PATHS = ['/', '/apps', '/people', '/orgs', '/verify', '/developers', '/trust', '/ecosystem']

/** Most app profile URLs listed in the sitemap. */
export const SITEMAP_APP_CAP = 1000
/** Most organisation URLs listed in the sitemap. */
export const SITEMAP_ORG_CAP = 1000
const PAGE_SIZE = 50

/**
 * App DIDs from every appProfiles page, newest first, up to `cap`. A failing
 * page ends the walk with what was collected so far.
 */
export async function collectAppDids(
  fetchPage: (args: { limit: number; after?: string | null }) => Promise<AppProfilePage>,
  cap = SITEMAP_APP_CAP,
): Promise<string[]> {
  const dids: string[] = []
  let after: string | null = null
  while (dids.length < cap) {
    let page: AppProfilePage
    try {
      page = await fetchPage({ limit: Math.min(PAGE_SIZE, cap - dids.length), after })
    } catch (error) {
      console.error('sitemap: app profiles unavailable:', error)
      break
    }
    dids.push(...page.items.map((item) => item.appDid))
    if (!page.next || page.items.length === 0) break
    after = page.next
  }
  return dids.slice(0, cap)
}

/**
 * Handles of listed organisations, skipping archived (noindex) and taken-down
 * ones, up to `cap`. A failing page ends the walk with what was collected so far.
 */
export async function collectOrgHandles(
  fetchPage: (args: { limit: number; after?: string | null }) => Promise<OrgHandlePage>,
  cap = SITEMAP_ORG_CAP,
): Promise<string[]> {
  const handles: string[] = []
  let after: string | null = null
  while (handles.length < cap) {
    let page: OrgHandlePage
    try {
      page = await fetchPage({ limit: PAGE_SIZE, after })
    } catch (error) {
      console.error('sitemap: organisations unavailable:', error)
      break
    }
    handles.push(...page.items.filter((org) => !org.archived && !org.takenDown).map((org) => org.handle))
    if (!page.next || page.items.length === 0) break
    after = page.next
  }
  return handles.slice(0, cap)
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** sitemap.xml for the static paths, the given app DIDs and organisation handles. */
export function renderSitemap(origin: string, appDids: string[], orgHandles: string[] = []): string {
  const urls = [
    ...STATIC_PATHS.map((path) => `${origin}${path === '/' ? '' : path}`),
    ...appDids.map((did) => `${origin}/app/${did}`),
    ...orgHandles.map((handle) => `${origin}${orgPath(handle)}`),
  ]
  const body = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

/** robots.txt: everything public except the API (link previews stay crawlable), the editor and the sign-in screens. */
export function renderRobots(origin: string): string {
  return ['User-agent: *', 'Allow: /', 'Allow: /api/og', 'Disallow: /api/', 'Disallow: /profile/edit', 'Disallow: /console', 'Disallow: /oidc/', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n')
}
