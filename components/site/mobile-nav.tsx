import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cx } from '../../utils/cx'
import { accountLinks } from './account-links'
import { isActivePath, SITE_NAV } from './nav'
import { buttonClasses } from './primitives'
import type { SiteAuth } from './use-site-auth'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The < 768 px navigation: a toggle button and a modal drawer. Focus moves into
 * the drawer, Tab cycles inside it, Esc / a link / the close button close it and
 * focus returns to the toggle.
 */
export function MobileNav({ auth }: { auth: SiteAuth }) {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { pathname, events } = useRouter()

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onRoute = () => setOpen(false)
    events.on('routeChangeStart', onRoute)
    return () => {
      document.body.style.overflow = overflow
      events.off('routeChangeStart', onRoute)
    }
  }, [open, events])

  function close() {
    setOpen(false)
    toggleRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const linkClass = 'text-ink hover:bg-surface-2 block rounded-xl px-3 py-3 text-lg font-medium'

  return (
    <div className="md:hidden">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls="site-drawer"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="text-ink hover:bg-surface-2 flex h-10 w-10 items-center justify-center rounded-full"
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div aria-hidden="true" className="bg-background/70 absolute inset-0 backdrop-blur-sm" onClick={close} />
          <div
            id="site-drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onKeyDown={onKeyDown}
            className="border-hairline bg-background absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col border-l p-4 shadow-modal motion-safe:animate-[drawer-in_280ms_var(--ease-out-expo)]"
          >
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                aria-label="Close menu"
                onClick={close}
                className="text-ink hover:bg-surface-2 flex h-10 w-10 items-center justify-center rounded-full"
              >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <nav aria-label="Main">
              <ul className="space-y-1">
                {SITE_NAV.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={isActivePath(pathname, link.href) ? 'page' : undefined}
                      className={cx(linkClass, isActivePath(pathname, link.href) && 'text-primary-ink')}
                      onClick={() => setOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="border-hairline mt-auto border-t pt-4">
              {auth.state === 'signed-out' && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    auth.login()
                  }}
                  className={buttonClasses('primary', 'lg', 'w-full')}
                >
                  Sign in
                </button>
              )}
              {auth.state === 'signed-in' && (
                <ul className="space-y-1">
                  {accountLinks(auth.address, auth.profile).map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className={linkClass} onClick={() => setOpen(false)}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      className={cx(linkClass, 'text-destructive w-full text-left')}
                      onClick={() => {
                        setOpen(false)
                        auth.logout()
                      }}
                    >
                      Sign out
                    </button>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
