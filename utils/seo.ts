/** Canonical origin of the public site (NEXT_PUBLIC_RENOWN_URL, else www.renown.id), without a trailing slash. */
export function publicOrigin(): string {
  return (process.env.NEXT_PUBLIC_RENOWN_URL || 'https://www.renown.id').replace(/\/+$/, '')
}

/** Absolute canonical URL of a site path ("/" or "/developers"). */
export function canonicalUrl(path: string): string {
  const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`
  return `${publicOrigin()}${clean}`
}

export type OgImageParams =
  | { variant: 'default' }
  /** A profile card, looked up by the wallet address of the profile. */
  | { variant: 'profile'; address: string }
  /** An app card, looked up by the app DID. */
  | { variant: 'app'; did: string }

/** Absolute URL of the generated link-preview image (pages/api/og.tsx). */
export function ogImageUrl(params: OgImageParams = { variant: 'default' }, origin = publicOrigin()): string {
  const query = new URLSearchParams({ variant: params.variant })
  if (params.variant === 'profile') query.set('address', params.address.toLowerCase())
  if (params.variant === 'app') query.set('did', params.did)
  return `${origin}/api/og?${query.toString()}`
}

export const SITE_NAME = 'Renown'
export const DEFAULT_DESCRIPTION =
  'Renown is the identity layer of the Powerhouse network: one wallet-backed ID to sign in to every app, sign your work, and revoke access whenever you choose.'
