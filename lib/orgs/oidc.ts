// Organisation-owned sign-in (OIDC) clients (renown-package A3 ruling 6). Pure.
import { DEFAULT_OIDC_ISSUER } from '../../utils/oidc-issuer'

/** At most this many clients per organisation; disabled ones count (D4). */
export const MAX_OIDC_CLIENTS = 20

/** One redirect URI per line: trimmed, duplicates dropped; https, or http on localhost; no #fragment (D5). */
export function parseRedirectUris(text: string): { uris: string[] } | { problem: string } {
  const uris = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ]
  if (uris.length === 0) return { problem: 'Add at least one redirect URI.' }
  for (const uri of uris) {
    let parsed: URL
    try {
      parsed = new URL(uri)
    } catch {
      return { problem: `${uri}: not a full URL.` }
    }
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local))
      return { problem: `${uri}: use https:// (http:// only for localhost).` }
    if (uri.includes('#')) return { problem: `${uri}: remove the #fragment.` }
  }
  return { uris }
}

/** The issuer apps configure (the deployment's, else Renown's default). */
export function oidcIssuer(): string {
  return process.env.NEXT_PUBLIC_RENOWN_OIDC_ISSUER || DEFAULT_OIDC_ISSUER
}
