// Organisation domains (renown-package A2 ruling 7). Pure.
import { formatDay } from '../verify/format'
import type { OrgDomain } from '../../services/org-security'

/** The switchboard's rule: lowercase labels, at least two, a top-level label starting with a letter. */
export const ORG_DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/

/** What people paste ("https://Acme.com/about", "acme.com.") as a bare lowercase domain. */
export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
}

/**
 * True when `website` is on one of the organisation's own verified domains or a
 * subdomain of one. Proven ownership is what lets the link drop `nofollow`.
 */
export function isVerifiedWebsite(website: string, verifiedDomains: string[]): boolean {
  let host: string
  try {
    const url = new URL(website)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    host = normalizeDomain(url.hostname)
  } catch {
    return false
  }
  return verifiedDomains.map(normalizeDomain).some((domain) => domain !== '' && (host === domain || host.endsWith(`.${domain}`)))
}

export function domainProblem(domain: string): string | null {
  return ORG_DOMAIN_RE.test(domain) ? null : 'Enter a domain such as acme.com.'
}

export function domainStatusText(domain: OrgDomain): string {
  if (domain.status === 'VERIFIED') return domain.verifiedAt ? `Verified since ${formatDay(domain.verifiedAt)}` : 'Verified'
  if (domain.status === 'LAPSED') return 'Lapsed: the proof was missing on three daily checks'
  return 'Waiting for proof'
}
