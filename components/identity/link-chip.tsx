import type { RenownProfileLink } from '../../services/switchboard'
import { linkTarget } from '../../utils/link-service'
import { ServiceIcon } from './service-icon'

/**
 * Links as chips with the service's icon, the label and the hostname. Links
 * that are not http(s) URLs are dropped (never rendered as links).
 */
export function LinkChips({ links, label = 'Links' }: { links: readonly RenownProfileLink[]; label?: string }) {
  const safe = links.flatMap((link) => {
    const target = linkTarget(link.url)
    return target ? [{ ...link, ...target }] : []
  })
  if (safe.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2" aria-label={label}>
      {safe.map((link) => (
        <li key={link.id} className="min-w-0 max-w-full">
          <a
            href={link.url}
            target="_blank"
            rel="me noopener noreferrer nofollow"
            className="border-hairline bg-surface-1 text-ink hover:border-primary/50 hover:bg-surface-2 inline-flex max-w-full items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-3 text-sm transition-colors"
          >
            <ServiceIcon service={link.service} className="text-ink-muted h-4 w-4 shrink-0" />
            <span className="truncate font-medium">{link.label || link.host}</span>
            {link.label && <span className="text-ink-muted truncate text-xs">{link.host}</span>}
          </a>
        </li>
      ))}
    </ul>
  )
}
