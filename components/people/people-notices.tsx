import type { ReactNode } from 'react'
import { buttonClasses, ButtonLink } from '../site/primitives'
import { useSiteAuth } from '../site/use-site-auth'

function Frame({ children, role }: { children: ReactNode; role?: 'alert' }) {
  return (
    <div role={role} className="border-hairline-strong rounded-panel flex flex-col items-start border border-dashed px-6 py-10 md:px-10 md:py-12">
      {children}
    </div>
  )
}

/**
 * "List yourself": the editor when signed in, else sign-in. While the session
 * is restoring, an invisible stand-in keeps the button's height (no layout shift).
 */
function ListYourself({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const auth = useSiteAuth()
  if (auth.state === 'signed-in') {
    return (
      <ButtonLink href="/profile/edit" variant={variant}>
        List yourself
      </ButtonLink>
    )
  }
  if (auth.state === 'signed-out') {
    return (
      <button type="button" onClick={auth.login} className={buttonClasses(variant)}>
        Sign in to list yourself
      </button>
    )
  }
  return (
    <span aria-hidden="true" className={buttonClasses(variant, 'md', 'invisible')}>
      Sign in to list yourself
    </span>
  )
}

/** Before a search: what this directory is, and how to join it. */
export function PeopleIntro() {
  return (
    <Frame>
      <h2 className="text-ink text-h3">Nobody is listed by default</h2>
      <p className="text-ink-muted mt-3 max-w-[56ch] leading-7">
        People appear here only after they turn on “List me in people search” in their profile editor. Turning it off
        removes them straight away. Profile pages stay public either way.
      </p>
      <div className="mt-8">
        <ListYourself variant="secondary" />
      </div>
    </Frame>
  )
}

export function NobodyMatches({ query }: { query: string }) {
  return (
    <Frame>
      <h2 className="text-ink text-h3">Nobody matches yet</h2>
      <p className="text-ink-muted mt-3 max-w-[56ch] leading-7">
        No listed name or handle starts with “{query}”. Only people who chose to be listed can be found here.
      </p>
      <div className="mt-8">
        <ListYourself />
      </div>
    </Frame>
  )
}

export function PeopleOutage({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame role="alert">
      <h2 className="text-ink text-h3">People search is unavailable</h2>
      <p className="text-ink-muted mt-3 max-w-[56ch] leading-7">Renown didn&apos;t answer in time. Try again in a moment.</p>
      <button type="button" onClick={onRetry} className={buttonClasses('primary', 'md', 'mt-8')}>
        Try again
      </button>
    </Frame>
  )
}
