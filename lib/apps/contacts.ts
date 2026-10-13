// App support and security contacts (renown-package A3 ruling 9): an email
// address or an https URL, at most 200 characters. Anything else is not shown. Pure.

const EMAIL_RE = /^[^\s@<>()"]+@[^\s@<>()"]+\.[^\s@<>()"]+$/

export function contactLink(value: string | null | undefined): { href: string; label: string } | null {
  const text = value?.trim()
  if (!text || text.length > 200) return null
  const bare = text.replace(/^mailto:/i, '')
  if (EMAIL_RE.test(bare)) return { href: `mailto:${bare}`, label: bare }
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return { href: url.toString(), label: `${url.host}${url.pathname === '/' ? '' : url.pathname}` }
  } catch {
    return null
  }
}
