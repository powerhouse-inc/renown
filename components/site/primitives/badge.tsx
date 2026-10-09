import type { ReactNode } from 'react'
import { cx } from '../../../utils/cx'

export type BadgeTone = 'neutral' | 'primary' | 'signal'

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-muted border-hairline',
  primary: 'bg-primary/10 text-primary-ink border-primary/20',
  signal: 'bg-signal/10 text-signal border-signal/25',
}

/** A small pill label (category, status). */
export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', TONE[tone], className)}>
      {children}
    </span>
  )
}
