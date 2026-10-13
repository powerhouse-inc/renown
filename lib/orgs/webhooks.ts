// Organisation webhooks (renown-package A3 rulings 4 and 5). Pure.

export const ORG_WEBHOOK_EVENTS = [
  'member.invited',
  'member.joined',
  'member.left',
  'member.removed',
  'member.role_changed',
  'team.changed',
  'app.transferred_in',
  'app.transferred_out',
  'app.frozen',
  'app.unfrozen',
  'credential.suspended',
  'proposal.created',
  'proposal.approved',
  'proposal.cancelled',
  'proposal.executed',
  'domain.verified',
  'domain.lapsed',
  'release.attested',
  'org.updated',
] as const

export const MAX_WEBHOOKS = 10

export function webhookUrlProblem(url: string): string | null {
  const text = url.trim()
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return 'Enter a full https:// address.'
  }
  if (parsed.protocol !== 'https:') return 'Use an https:// address.'
  if (parsed.username || parsed.password) return 'Leave user names and passwords out of the address.'
  if (parsed.port !== '' && parsed.port !== '443' && parsed.port !== '8443') return 'Use port 443 or 8443.'
  if (text.length > 2048) return 'Use at most 2048 characters.'
  return null
}
