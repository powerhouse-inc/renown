import type { ReactNode } from 'react'
import { cx } from '../../utils/cx'

/** A titled block of a profile or app page (h2 + content), with the pages' shared rhythm. */
export function PageSection({ id, title, aside, children, className }: { id: string; title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cx('min-w-0', className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="text-ink text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
