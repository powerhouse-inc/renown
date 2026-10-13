import Link from 'next/link'
import { manageHref } from '../../lib/orgs/format'
import type { ManageSectionMeta } from '../../lib/orgs/manage-sections'
import { cx } from '../../utils/cx'

/** The sections the viewer may open: a row that scrolls sideways on phones, a column from lg. */
export function ManageNav({
  handle,
  sections,
  current,
}: {
  handle: string
  sections: ManageSectionMeta[]
  current: string
}) {
  return (
    <nav aria-label="Organisation settings" className="-mx-4 min-w-0 lg:mx-0">
      <ul className="flex gap-1 overflow-x-auto px-4 pb-2 lg:flex-col lg:overflow-visible lg:px-0">
        {sections.map((section) => (
          <li key={section.key} className="shrink-0">
            <Link
              href={manageHref(handle, section.key)}
              aria-current={section.key === current ? 'page' : undefined}
              className={cx(
                'block rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors lg:rounded-xl',
                section.key === current ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
