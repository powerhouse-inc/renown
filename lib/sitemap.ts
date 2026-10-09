import type { AppProfilePage } from '../services/app-profiles'

/** Public, indexable site paths (pages Phase B/C add are listed here too). */
export const STATIC_PATHS = ['/', '/apps', '/developers', '/trust', '/ecosystem']

/** Most app profile URLs listed in the sitemap. */
export const SITEMAP_APP_CAP = 1000
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

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** sitemap.xml for the static paths and the given app DIDs. */
export function renderSitemap(origin: string, appDids: string[]): string {
  const urls = [...STATIC_PATHS.map((path) => `${origin}${path === '/' ? '' : path}`), ...appDids.map((did) => `${origin}/app/${did}`)]
  const body = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

/** robots.txt: everything public except the API (link previews stay crawlable), the editor and the sign-in screens. */
export function renderRobots(origin: string): string {
  return ['User-agent: *', 'Allow: /', 'Allow: /api/og', 'Disallow: /api/', 'Disallow: /profile/edit', 'Disallow: /console', 'Disallow: /oidc/', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n')
}
