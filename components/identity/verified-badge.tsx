import Link from 'next/link'
import type { ReactNode } from 'react'
import { cx } from '../../utils/cx'
import { usePopover } from './use-popover'

export interface VerifiedBadgeProps {
  /** "Verified Renown identity" / "Verified app identity". */
  label: string
  /** Two sentences on what exactly is verified. */
  children: ReactNode
  /** Where to read more ("/trust", "/developers") and the link text. */
  learnMore: { href: string; label: string }
  /** Which side the panel is anchored to (keep it inside the viewport). */
  align?: 'start' | 'end'
}

/** A "verified" pill that discloses what was verified, and how, on click. */
export function VerifiedBadge({ label, children, learnMore, align = 'start' }: VerifiedBadgeProps) {
  const { open, rootRef, buttonProps, panelId } = usePopover()
  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        {...buttonProps}
        className="border-signal/30 bg-signal/10 text-signal hover:bg-signal/15 inline-flex h-7 items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-xs font-semibold transition-colors"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z" />
          <path d="m8.8 12.2 2.2 2.2 4.4-4.6" />
        </svg>
        {label}
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={cx('transition-transform', open && 'rotate-180')}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={label}
          className={cx(
            // Below 640 px a sheet pinned to the bottom of the screen: anchored to the badge it would overflow.
            'border-hairline-strong bg-background shadow-card rounded-card z-30 border p-4 text-left max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 sm:absolute sm:top-full sm:mt-2 sm:w-80',
            align === 'end' ? 'sm:right-0' : 'sm:left-0',
          )}
        >
          <div className="text-ink-muted space-y-2 text-sm leading-6">{children}</div>
          <Link href={learnMore.href} className="text-primary-ink mt-3 inline-block text-sm font-semibold hover:underline">
            {learnMore.label}
          </Link>
        </div>
      )}
    </div>
  )
}
