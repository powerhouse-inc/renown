import Link from 'next/link'
import { useRouter } from 'next/router'
import { cx } from '../../utils/cx'
import RenownLogo from '../ui/renown-logo'
import ThemeToggle from '../ui/theme-toggle'
import { AuthSlot } from './auth-slot'
import { MobileNav } from './mobile-nav'
import { isActivePath, SITE_NAV } from './nav'
import { Container } from './primitives'
import { useSiteAuth } from './use-site-auth'

/** Sticky, translucent site header: logo, primary nav, theme toggle, auth (drawer below 768 px). */
export function SiteHeader() {
  const { pathname } = useRouter()
  const auth = useSiteAuth()
  return (
    <header className="border-hairline bg-header sticky top-0 z-40 border-b backdrop-blur-xl backdrop-saturate-150">
      <Container className="flex h-16 items-center gap-6">
        <Link href="/" aria-label="Renown home" className="text-ink -ml-1 flex shrink-0 items-center rounded-md p-1">
          <RenownLogo aria-hidden="true" className="h-7 w-auto md:h-8" />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {SITE_NAV.map((link) => {
              const active = isActivePath(pathname, link.href)
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'rounded-full px-3 py-2 text-sm font-medium transition-colors',
                      active ? 'text-ink bg-surface-2' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden md:block">
            <AuthSlot auth={auth} />
          </div>
          <MobileNav auth={auth} />
        </div>
      </Container>
    </header>
  )
}
