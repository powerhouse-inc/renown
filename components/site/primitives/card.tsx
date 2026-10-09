import type { ElementType, ReactNode } from 'react'
import { cx } from '../../../utils/cx'

export interface CardProps {
  children: ReactNode
  className?: string
  as?: ElementType
  /** Adds hover lift + primary hairline, for cards that are links. */
  interactive?: boolean
}

/** A raised surface: hairline border, card radius, soft shadow. */
export function Card({ children, className, as: Tag = 'div', interactive = false }: CardProps) {
  return (
    <Tag
      className={cx(
        'border-hairline bg-surface-1 shadow-card rounded-card relative border backdrop-blur-sm',
        interactive &&
          'hover:border-primary/40 transition-[border-color,transform,box-shadow] duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-glow motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
