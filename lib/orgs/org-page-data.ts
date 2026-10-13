// What the public organisation page shows, read on the server. The
// organisation itself is already known; stats, apps and members are secondary
// reads that drop their section on failure or after the SSR budget.
import { HERO_ART, identityArtSvgs, type IdentityArtSvgs } from '../identity-art'
import { qrCode, type QrCode } from '../qr'
import { listAppProfiles, type RenownAppProfile } from '../../services/app-profiles'
import {
  fetchOrganizationStats,
  organizationMembers,
  type Organization,
  type OrganizationStats,
  type OrgMember,
  type OrgServerRequest,
} from '../../services/orgs'
import { canonicalUrl } from '../../utils/seo'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'
import { orgPath } from './format'

export interface OrgPageData {
  org: Organization
  stats: OrganizationStats | null
  apps: RenownAppProfile[]
  /** The public member list (membersPublic, hidden members left out by the switchboard). */
  members: OrgMember[]
  canonicalUrl: string
  art: IdentityArtSvgs
  qr: QrCode
  /** True when a secondary read (stats, apps, members) failed or timed out: the page is shown without that section and never cached. */
  degraded: boolean
}

export const ORG_PAGE_APPS = 24

/** Cache-Control for an organisation page: a degraded page is never stored, so a passing outage is not served to the next visitor. */
export function orgPageCacheControl(degraded: boolean): string {
  return degraded ? 'no-store' : 'public, s-maxage=30, stale-while-revalidate=120'
}

/** `request` is the incoming SSR request: its visitor IP and the trusted-read token go with each renown-orgs read (D23). */
export async function loadOrgPageData(org: Organization, request?: OrgServerRequest | null): Promise<OrgPageData> {
  const url = canonicalUrl(orgPath(org.handle))
  const base = { org, canonicalUrl: url, art: identityArtSvgs(org.id, { ...HERO_ART, idPrefix: 'org' }), qr: qrCode(url) }
  if (org.takenDown) return { ...base, stats: null, apps: [], members: [], degraded: false }
  let degraded = false
  const optional = <T,>(promise: Promise<T>, fallback: T): Promise<T> =>
    withTimeout(promise, SSR_DATA_TIMEOUT_MS).catch(() => {
      degraded = true
      return fallback
    })
  const [stats, apps, members] = await Promise.all([
    optional(fetchOrganizationStats(org.id, request), null),
    org.apps.length > 0
      ? optional(listAppProfiles({ limit: ORG_PAGE_APPS, orgId: org.id }).then((page) => page.items), [])
      : Promise.resolve([]),
    org.membersPublic ? optional(organizationMembers(org.id, false, null, request), []) : Promise.resolve([]),
  ])
  return { ...base, stats, apps, members, degraded }
}
