import type { ReactNode } from 'react'
import { ButtonLink, buttonClasses } from '../site/primitives'
import { VETRA_URL } from '../site/nav'

function NoticeFrame({ children, role }: { children: ReactNode; role?: 'alert' }) {
  return (
    <div
      role={role}
      className="border-hairline-strong rounded-panel flex flex-col items-center border border-dashed px-6 py-16 text-center md:py-20"
    >
      {children}
    </div>
  )
}

/** No apps for this filter: an invitation to list one. */
export function EmptyDirectory({ filtered }: { filtered: boolean }) {
  return (
    <NoticeFrame>
      <h2 className="text-ink text-h3">No apps here yet</h2>
      <p className="text-ink-muted mt-3 max-w-[46ch]">
        Apps appear here once their publisher gives them a Renown identity and a public profile on Vetra.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href={VETRA_URL}>List your app on Vetra</ButtonLink>
        {filtered && (
          <ButtonLink href="/apps" variant="secondary">
            Show all apps
          </ButtonLink>
        )}
      </div>
    </NoticeFrame>
  )
}

/** The directory could not be read: say so and offer a retry (the page itself still answers 200). */
export function DirectoryOutage({ onRetry }: { onRetry: () => void }) {
  return (
    <NoticeFrame role="alert">
      <h2 className="text-ink text-h3">The app directory is unavailable</h2>
      <p className="text-ink-muted mt-3 max-w-[46ch]">
        Renown didn&apos;t answer in time. Your apps and approvals are not affected. Try again in a moment.
      </p>
      <button type="button" onClick={onRetry} className={buttonClasses('primary', 'md', 'mt-8')}>
        Try again
      </button>
    </NoticeFrame>
  )
}
