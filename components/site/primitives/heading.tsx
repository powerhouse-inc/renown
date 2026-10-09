import type { ReactNode } from 'react'
import { cx } from '../../../utils/cx'

export type HeadingSize = 'display' | 'h1' | 'h2' | 'h3'

export interface HeadingProps {
  children: ReactNode
  /** Document outline level (h1-h3). */
  level: 1 | 2 | 3
  /** Visual size from the type scale; defaults to the level's own size. */
  size?: HeadingSize
  id?: string
  className?: string
}

const SIZE: Record<HeadingSize, string> = {
  display: 'text-display text-balance',
  h1: 'text-h1 text-balance',
  h2: 'text-h2 text-balance',
  h3: 'text-h3',
}

/** A heading on the site type scale; level and visual size are independent. */
export function Heading({ children, level, size, id, className }: HeadingProps) {
  const Tag = `h${level}` as const
  const visual = size ?? (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3')
  return (
    <Tag id={id} className={cx('text-ink', SIZE[visual], className)}>
      {children}
    </Tag>
  )
}

/** The paragraph under a section heading. */
export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-ink-muted text-lead mt-5 max-w-[62ch] text-pretty', className)}>{children}</p>
}
