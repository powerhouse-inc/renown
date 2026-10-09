import type { ReactNode } from 'react'
import { cx } from '../../../utils/cx'

/** A short sentence-case label above a heading, marked with the signal dot. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('text-primary-ink mb-4 inline-flex items-center gap-2 text-sm font-semibold', className)}>
      <span aria-hidden="true" className="bg-signal h-1.5 w-1.5 rounded-full shadow-[0_0_10px_var(--signal)]" />
      {children}
    </p>
  )
}
