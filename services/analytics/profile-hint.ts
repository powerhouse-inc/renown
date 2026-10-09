// Wallet (public address) persisted on login so `<Analytics />` can seed
// `<OpenPanelComponent profileId>` and attribute a returning user's first
// pageview. Read from document.cookie in the browser only: never put it in
// server-rendered HTML, which is cached publicly.
export const OP_PROFILE_COOKIE = 'op_profile'

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function writeProfileHint(profileId: string): void {
  if (typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${OP_PROFILE_COOKIE}=${encodeURIComponent(profileId)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`
}

export function clearProfileHint(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${OP_PROFILE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}

/** Parses the profile hint out of a cookie string (document.cookie). */
export function readProfileHint(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== OP_PROFILE_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    if (!value) return undefined
    try {
      return decodeURIComponent(value)
    } catch {
      return undefined
    }
  }
  return undefined
}
