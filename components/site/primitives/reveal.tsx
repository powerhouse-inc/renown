import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'
import { cx } from '../../../utils/cx'

export interface RevealProps {
  children: ReactNode
  className?: string
  as?: ElementType
  /** Delay in ms once the element enters the viewport (for staggering siblings). */
  delay?: number
}

type Phase = 'static' | 'hidden' | 'shown'

/**
 * Fades and lifts its children in when they scroll into view. Server markup is
 * fully visible; only elements still below the fold are hidden after mount, so
 * nothing above the fold flashes and nothing is lost without JavaScript. Off
 * under prefers-reduced-motion.
 */
export function Reveal({ children, className, as: Tag = 'div', delay = 0 }: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  const [phase, setPhase] = useState<Phase>('static')

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (el.getBoundingClientRect().top < window.innerHeight) return
    setPhase('hidden')
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase('shown')
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      style={phase === 'shown' && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cx(
        phase !== 'static' && 'transition-[opacity,transform] duration-700 ease-out-expo',
        phase === 'hidden' && 'translate-y-4 opacity-0',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
