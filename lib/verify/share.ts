// Shareable /verify links. The paste travels in the URL fragment (#…), which
// browsers never send to a server, so a shared link does not leak it to
// renown.id's logs or to analytics. Pure.

export interface SharedInput {
  text: string
  documentId: string
  branch: string
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/** Longest share fragment built or read; a longer paste is not shareable by link. */
export const MAX_SHARE_FRAGMENT_LENGTH = 16_384

/** "#v=<base64url JSON>": the fragment of a share link. */
export function shareFragment(input: SharedInput): string | null {
  const payload: Record<string, string> = { t: input.text }
  if (input.documentId) payload.d = input.documentId
  if (input.branch && input.branch !== 'main') payload.b = input.branch
  const fragment = `#v=${toBase64Url(JSON.stringify(payload))}`
  return fragment.length > MAX_SHARE_FRAGMENT_LENGTH ? null : fragment
}

/** The input a share link carries, or null for any other fragment. */
export function readShareFragment(hash: string): SharedInput | null {
  if (hash.length > MAX_SHARE_FRAGMENT_LENGTH) return null
  const match = /^#v=([A-Za-z0-9_-]+)$/.exec(hash)
  if (!match) return null
  const json = fromBase64Url(match[1])
  if (json === null) return null
  try {
    const value = JSON.parse(json) as { t?: unknown; d?: unknown; b?: unknown }
    if (typeof value.t !== 'string') return null
    return {
      text: value.t,
      documentId: typeof value.d === 'string' ? value.d : '',
      branch: typeof value.b === 'string' && value.b ? value.b : 'main',
    }
  } catch {
    return null
  }
}
