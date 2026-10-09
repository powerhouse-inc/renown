import { useEffect, useState } from 'react'
import { cx } from '../../utils/cx'

export interface TocItem {
  id: string
  label: string
}

/** Sticky in-page table of contents; marks the section in view with aria-current. */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -65% 0px' },
    )
    for (const item of items) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  return (
    <nav aria-label="On this page" className="sticky top-24">
      <p className="text-ink mb-3 text-sm font-semibold">On this page</p>
      <ul className="border-hairline space-y-1 border-l">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? 'true' : undefined}
              className={cx(
                '-ml-px block border-l py-1.5 pl-4 text-sm transition-colors',
                active === item.id ? 'border-primary text-ink font-medium' : 'text-ink-muted hover:text-ink border-transparent',
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
