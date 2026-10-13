// Delegations for an organisation's apps count only under its rules
// (renown-package A2 ruling 11). /verify adds that as one more check. Pure
// apart from the injected lookup.
import { sentence, shortAddress } from './format'
import type { AppPublisherOrgRef, Check, OrgCredentialReason, OrgLookups, Report } from './types'

function reasonText(reason: OrgCredentialReason, issuer: string, org: string): string {
  switch (reason) {
    case 'ISSUER_NOT_MEMBER':
      return `${issuer} is no longer a member of ${org}`
    case 'ISSUER_NOT_PUBLISHER':
      return `${issuer} may no longer publish this app for ${org}`
    case 'SUSPENDED':
      return `${org} suspended this delegation`
    case 'APP_FROZEN':
      return `${org} froze this app`
  }
}

/**
 * The "Allowed by the organisation" check for a delegation credential; null when no
 * organisation publishes the app or no reads are available. `publisherOrg` is the app's
 * publishing organisation: null when Renown said none does (the rules are not asked, so a
 * renown-orgs outage never degrades a personal app's verdict), undefined when that read failed.
 */
export async function orgRulesCheck(orgs: OrgLookups | undefined, credentialId: string, issuer: string, publisherOrg: AppPublisherOrgRef | null | undefined): Promise<Check | null> {
  if (!orgs || publisherOrg === null) return null
  const orgName = publisherOrg?.name ?? null
  const id = 'org-rules'
  const label = 'Allowed by the organisation'
  const found = await orgs.credentialStatus(credentialId)
  if (!found.ok) return { id, label, status: 'unknown', detail: 'Renown could not be reached to check the rules of the organisation that publishes this app.' }
  const verdict = found.value
  if (!verdict || !verdict.orgId) return null
  const org = orgName ?? 'the organisation that publishes this app'
  const who = shortAddress(issuer.toLowerCase())
  if (verdict.counts) return { id, label, status: 'pass', detail: `${who} may act for this app under ${org}’s rules.` }
  const why = verdict.reason ? reasonText(verdict.reason, who, org) : `${org}’s rules no longer let it count`
  return { id, label, status: 'fail', detail: `${sentence(why)}, so this delegation no longer counts.` }
}

/** The report with the check added: a failure turns "genuine" into "revoked", a failed lookup into "could not check". */
export function withOrgRules(report: Report, check: Check | null): Report {
  if (!check) return report
  const checks = [...report.checks, check]
  if (report.verdict !== 'genuine') return { ...report, checks }
  if (check.status === 'fail') return { ...report, checks, verdict: 'revoked', summary: check.detail }
  if (check.status === 'unknown') {
    return {
      ...report,
      checks,
      verdict: 'unchecked',
      summary: 'It is genuinely signed, but Renown could not be reached to check the rules of the organisation that publishes the app. Try again in a moment.',
    }
  }
  return { ...report, checks }
}
