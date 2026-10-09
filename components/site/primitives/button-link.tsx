import Link from 'next/link'
import type { ReactNode } from 'react'
import { cx } from '../../../utils/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-60'
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary-strong text-primary-foreground shadow-glow hover:brightness-110',
  secondary: 'border border-hairline-strong bg-surface-1 text-ink hover:border-primary/50 hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
}
const SIZE: Record<ButtonSize, string> = {
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
}

/** Class names of a site button, for <button> elements. */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string): string {
  return cx(BASE, VARIANT[variant], SIZE[size], className)
}

export interface ButtonLinkProps {
  href: string
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

/** A link styled as a button; absolute http(s) URLs open as plain external links. */
export function ButtonLink({ href, children, variant = 'primary', size = 'md', className }: ButtonLinkProps) {
  const classes = buttonClasses(variant, size, className)
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={classes} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  )
}
