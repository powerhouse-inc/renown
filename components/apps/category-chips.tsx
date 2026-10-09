import Link from 'next/link'
import type { AppProfileCategory } from '../../services/app-profiles'
import { cx } from '../../utils/cx'
import { appsHref, sameCategory } from '../../utils/app-directory'

const CHIP =
  'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors'
const IDLE = 'border-hairline-strong bg-surface-1 text-ink hover:border-primary/50 hover:bg-surface-2'
const ACTIVE = 'border-transparent bg-primary-strong text-primary-foreground'

/**
 * "All" plus one chip per category with its count. Chips are links (they work
 * without JavaScript); with it, they route shallowly and the page fetches the
 * category client-side. One line that scrolls sideways on phones, wrapping from md.
 */
export function CategoryChips({ categories, selected }: { categories: AppProfileCategory[]; selected: string | null }) {
  if (categories.length === 0) return null
  const chips = [{ category: null, count: null }, ...categories] as { category: string | null; count: number | null }[]
  return (
    <nav aria-label="App categories" className="-mx-4 md:mx-0">
      <ul className="flex gap-2 overflow-x-auto px-4 pt-1 pb-3 md:flex-wrap md:overflow-visible md:px-0">
        {chips.map(({ category, count }) => {
          const active = category === null ? selected === null : sameCategory(category, selected)
          return (
            <li key={category ?? '*'}>
              <Link
                href={appsHref(category)}
                shallow
                scroll={false}
                aria-current={active ? 'page' : undefined}
                aria-label={count === null ? undefined : `${category}, ${count === 1 ? '1 app' : `${count} apps`}`}
                className={cx(CHIP, active ? ACTIVE : IDLE)}
              >
                {category ?? 'All'}
                {count !== null && (
                  <span aria-hidden="true" className={cx('tabular-nums', active ? 'opacity-80' : 'text-ink-muted')}>
                    {count}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
