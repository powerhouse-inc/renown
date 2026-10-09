import type { RenownProfileLink } from '../../services/switchboard'

function hostOf(url: string): string | null {
  try {
    const { protocol, host } = new URL(url)
    return protocol === 'https:' || protocol === 'http:' ? host.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

/** A profile's links as pills; anything that is not an http(s) URL is never rendered as a link. */
export function ProfileLinks({ links, align = 'center' }: { links: RenownProfileLink[]; align?: 'center' | 'start' }) {
  const safe = links.flatMap((link) => {
    const host = hostOf(link.url)
    return host ? [{ ...link, host }] : []
  })
  if (safe.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-2 ${align === 'start' ? 'justify-start' : 'justify-center'}`} aria-label="Links">
      {safe.map((link) => (
        <li key={link.id}>
          <a
            href={link.url}
            target="_blank"
            rel="me noopener noreferrer nofollow"
            className="bg-secondary text-foreground hover:bg-foreground/10 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors"
          >
            <span className="font-medium">{link.label}</span>
            <span className="text-muted-foreground text-xs">{link.host}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
