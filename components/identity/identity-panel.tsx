import type { ReactNode } from 'react'

/** "Check this identity": the raw identifiers with copy buttons and how to verify them. */
export function IdentityPanel({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  const id = `panel-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <section aria-labelledby={id} className="border-hairline bg-surface-1 rounded-card border p-5">
      <h2 id={id} className="text-ink text-base font-semibold">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
      <div className="text-ink-muted border-hairline mt-1 border-t pt-3 text-xs leading-5">{footer}</div>
    </section>
  )
}
