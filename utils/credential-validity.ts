/** Validity of a delegation credential when the requesting link does not ask for one. */
export const DEFAULT_CREDENTIAL_VALIDITY_DAYS = 7

/** Longest validity a link may request; longer requests are clamped to it. */
export const MAX_CREDENTIAL_VALIDITY_DAYS = 365

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Parse the `expiresInDays` query parameter of the app and console flows.
 * Positive integers (plain digits) are accepted and clamped to
 * {@link MAX_CREDENTIAL_VALIDITY_DAYS}; anything else, including an absent
 * value, gives {@link DEFAULT_CREDENTIAL_VALIDITY_DAYS}.
 */
export function parseExpiresInDays(raw: string | string[] | null | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !/^\d+$/.test(value)) return DEFAULT_CREDENTIAL_VALIDITY_DAYS
  const days = Number(value)
  if (days < 1) return DEFAULT_CREDENTIAL_VALIDITY_DAYS
  return Math.min(days, MAX_CREDENTIAL_VALIDITY_DAYS)
}

export function isDefaultCredentialValidity(days: number): boolean {
  return days === DEFAULT_CREDENTIAL_VALIDITY_DAYS
}

/** When a credential issued at `now` with this validity expires. */
export function credentialExpiryDate(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * DAY_MS)
}

/** "Valid for 365 days, until October 2, 2027", for the authorization screens. */
export function describeCredentialValidity(
  days: number,
  now: Date = new Date(),
  locale?: string,
  timeZone?: string,
): string {
  const until = credentialExpiryDate(days, now).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone,
  })
  return `Valid for ${days} ${days === 1 ? 'day' : 'days'}, until ${until}`
}
