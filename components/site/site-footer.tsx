import Link from 'next/link'
import RenownLogo from '../ui/renown-logo'
import { FOOTER_COLUMNS, isExternal, X_URL, type NavLink } from './nav'
import { Container } from './primitives'

function FooterLink({ link }: { link: NavLink }) {
  const className = 'text-ink-muted hover:text-ink text-sm transition-colors'
  if (isExternal(link.href)) {
    return (
      <a href={link.href} className={className} target="_blank" rel="noopener noreferrer">
        {link.label}
      </a>
    )
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  )
}

/** Site footer: product, developer, ecosystem and legal columns; copyright and X. */
export function SiteFooter() {
  return (
    <footer className="border-hairline relative border-t">
      <Container className="grid grid-cols-2 gap-x-6 gap-y-10 py-14 md:grid-cols-[1.4fr_repeat(4,1fr)] md:py-16">
        <div className="col-span-2 max-w-xs md:col-span-1">
          <RenownLogo aria-hidden="true" className="text-ink h-8 w-auto" />
          <p className="text-ink-muted mt-4 text-sm leading-6">The identity layer of the Powerhouse network.</p>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-ink text-sm font-semibold">{column.title}</h2>
            <ul className="mt-4 space-y-3">
              {column.links.map((link) => (
                <li key={link.href}>
                  <FooterLink link={link} />
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <Container className="border-hairline flex flex-col items-start justify-between gap-4 border-t py-6 sm:flex-row sm:items-center">
        <p className="text-ink-muted text-sm">© {new Date().getFullYear()} Powerhouse</p>
        <a
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Powerhouse on X"
          className="text-ink-muted hover:text-ink flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      </Container>
    </footer>
  )
}
