import type { ElementType, ReactNode } from 'react'
import { cx } from '../../../utils/cx'

export interface ContainerProps {
  children: ReactNode
  className?: string
  /** Rendered element; defaults to div. */
  as?: ElementType
  /** Narrow reading width (760 px) for long-form pages. */
  narrow?: boolean
}

/** Horizontal frame: max 1200 px (760 px narrow), 16 px gutters on mobile, 24 px from md. */
export function Container({ children, className, as: Tag = 'div', narrow = false }: ContainerProps) {
  return (
    <Tag className={cx('mx-auto w-full px-4 md:px-6', narrow ? 'max-w-[760px]' : 'max-w-[1200px]', className)}>
      {children}
    </Tag>
  )
}
