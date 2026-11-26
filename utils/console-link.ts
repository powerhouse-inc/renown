/** The longest session label a console link may carry. */
export const MAX_SESSION_LABEL_LENGTH = 64

type QueryValue = string | string[] | null | undefined

function first(raw: QueryValue): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : undefined
}

/**
 * A console link's session label (`app`): what the credential names the
 * session, and what the console shows. Absent: `null`. A DID is no label
 * either: `ph login` sends its own did:key as `app`, and its credential keeps
 * the console's `renown-app`. Present but not showable (empty, too long,
 * control characters): `undefined`, and the link is refused rather than
 * signed under another name.
 */
export function parseSessionLabel(raw: QueryValue): string | null | undefined {
  const value = first(raw)
  if (value === undefined) return null
  const label = value.trim()
  if (label.startsWith('did:')) return null
  if (label === '' || label.length > MAX_SESSION_LABEL_LENGTH) return undefined
  if (/[\u0000-\u001f\u007f-\u009f]/.test(label)) return undefined
  return label
}

/**
 * The host a console link asks a session for (`host`): its URL without query,
 * fragment or trailing slash. Absent: `null`. Not an http(s) URL, or one with
 * user info: `undefined`, and the link is refused.
 */
export function parseSessionHost(raw: QueryValue): string | null | undefined {
  const value = first(raw)
  if (value === undefined) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (url.username || url.password) return undefined
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}`
}
