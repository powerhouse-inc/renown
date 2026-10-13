// The renown-orgs error codes (renown-package API contract, "Calling
// conventions"), the HTTP status /api/org answers for each, and what the site
// tells people. Pure.

export const ORG_ERROR_CODES = [
  'BAD_USER_INPUT',
  'FORBIDDEN',
  'NOT_FOUND',
  'HANDLE_TAKEN',
  'HANDLE_RESERVED',
  'LAST_OWNER',
  'LIMIT_REACHED',
  'DOMAIN_TAKEN',
  'DOMAIN_PROOF_MISSING',
  'ORG_HAS_APPS',
  'APP_FROZEN',
  'PROPOSAL_NOT_EXECUTABLE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
] as const
export type OrgErrorCode = (typeof ORG_ERROR_CODES)[number]

/** Failures around the switchboard: a declined signature, no wallet for the session, no usable answer. */
export type OrgClientCode = 'DECLINED' | 'NO_WALLET' | 'NETWORK'
export type OrgFailureCode = OrgErrorCode | OrgClientCode

export function isOrgErrorCode(value: unknown): value is OrgErrorCode {
  return typeof value === 'string' && (ORG_ERROR_CODES as readonly string[]).includes(value)
}

const STATUS: Record<OrgErrorCode, number> = {
  BAD_USER_INPUT: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  HANDLE_TAKEN: 409,
  HANDLE_RESERVED: 409,
  LAST_OWNER: 409,
  LIMIT_REACHED: 429,
  DOMAIN_TAKEN: 409,
  DOMAIN_PROOF_MISSING: 409,
  ORG_HAS_APPS: 409,
  APP_FROZEN: 409,
  PROPOSAL_NOT_EXECUTABLE: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
}

/** The status /api/org/<mutation> answers for a refusal; 502 when the switchboard gave no usable answer. */
export function statusForOrgError(code: OrgFailureCode): number {
  return isOrgErrorCode(code) ? STATUS[code] : 502
}

const TEXT: Record<OrgFailureCode, string> = {
  BAD_USER_INPUT: 'Renown did not accept this value.',
  FORBIDDEN:
    'You are not allowed to do this, or Renown did not accept the signature. Check that your device clock is right and try again.',
  NOT_FOUND: 'This no longer exists. Reload the page.',
  HANDLE_TAKEN: 'This handle is taken.',
  HANDLE_RESERVED: 'This handle is reserved.',
  LAST_OWNER: 'An organisation always needs an owner. Add another owner first.',
  LIMIT_REACHED: 'A limit was reached, so nothing was changed.',
  DOMAIN_TAKEN: 'Another organisation has already verified this domain.',
  DOMAIN_PROOF_MISSING: 'Renown could not find the proof yet. DNS changes can take a while; check again later.',
  ORG_HAS_APPS: 'Transfer every app away before deleting the organisation.',
  APP_FROZEN: 'This app is frozen by its organisation.',
  PROPOSAL_NOT_EXECUTABLE: 'This proposal cannot run yet.',
  RATE_LIMITED: 'Too many changes in a short time. Wait a minute and try again.',
  SERVICE_UNAVAILABLE: 'Renown is unavailable right now. Try again in a moment.',
  DECLINED: 'Signature declined. Nothing was changed.',
  NO_WALLET: 'Connect the wallet you signed in with to make changes.',
  NETWORK: 'Renown did not answer. Nothing was changed; try again.',
}

/** What to tell someone about a failed organisation request. Input errors carry the server's own sentence. */
export function orgErrorText(code: OrgFailureCode, serverMessage?: string | null): string {
  if (code === 'BAD_USER_INPUT' && serverMessage?.trim()) return serverMessage.trim()
  if (code === 'FORBIDDEN') {
    const message = (serverMessage ?? '').toLowerCase()
    if (message.includes('signature already used')) return 'This request was already sent. Reload to see the result.'
    if (message.includes('archived or taken down')) return 'This organisation can no longer be changed.'
  }
  return TEXT[code]
}
