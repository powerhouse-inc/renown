// The /developers connect-link builder, validated with the same parsers the
// sign-in flow (pages/index.tsx) applies to the link it receives.
import { APP_DID_RE } from '../services/app-profiles'
import { MAX_CREDENTIAL_VALIDITY_DAYS, parseExpiresInDays } from './credential-validity'
import { parseReturnUrl } from './return-url'

export interface ConnectLinkInput {
  /** Site origin the link points at, e.g. https://www.renown.id. */
  origin: string
  appDid: string
  /** Optional; must be an absolute http(s) URL to be honoured. */
  returnUrl: string
  /** Raw text of the expiry field (days). */
  expiresInDays: string
}

export interface ConnectLinkResult {
  /** The link, or null while a field is invalid. */
  url: string | null
  errors: Partial<Record<'appDid' | 'returnUrl' | 'expiresInDays', string>>
  /** Validity the flow will actually ask for (after defaulting/clamping). */
  effectiveDays: number
  /** Set when the requested expiry is clamped to the maximum. */
  clamped: boolean
}

export function buildConnectLink(input: ConnectLinkInput): ConnectLinkResult {
  const errors: ConnectLinkResult['errors'] = {}
  const appDid = input.appDid.trim()
  const returnUrl = input.returnUrl.trim()
  const days = input.expiresInDays.trim()

  if (!appDid) errors.appDid = 'Enter your app DID.'
  else if (!APP_DID_RE.test(appDid)) errors.appDid = 'An app DID looks like did:key:z6Mk… (base58btc).'

  if (returnUrl && !parseReturnUrl(returnUrl)) {
    errors.returnUrl = 'Use an absolute http(s) URL; the sign-in flow ignores anything else.'
  }

  if (days && (!/^\d+$/.test(days) || Number(days) < 1)) {
    errors.expiresInDays = `Use a whole number of days from 1 to ${MAX_CREDENTIAL_VALIDITY_DAYS}.`
  }

  const effectiveDays = parseExpiresInDays(days || undefined)
  const clamped = /^\d+$/.test(days) && Number(days) > MAX_CREDENTIAL_VALIDITY_DAYS
  if (Object.keys(errors).length > 0) return { url: null, errors, effectiveDays, clamped }

  const params = new URLSearchParams({ connect: appDid })
  if (returnUrl) params.set('returnUrl', returnUrl)
  if (days) params.set('expiresInDays', String(effectiveDays))
  return { url: `${input.origin.replace(/\/+$/, '')}/?${params.toString()}`, errors, effectiveDays, clamped }
}
