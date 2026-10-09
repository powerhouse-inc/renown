import Link from 'next/link'
import { ECOSYSTEM } from '../ecosystem/ecosystem-data'
import { Section } from '../site/primitives'

export function EcosystemStrip() {
  return (
    <Section labelledBy="ecosystem-strip-title" spacing="sm">
      <div className="border-hairline bg-surface-1 rounded-panel flex flex-col gap-6 border p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div>
          <h2 id="ecosystem-strip-title" className="text-ink text-h3">
            Part of the Powerhouse ecosystem
          </h2>
          <p className="text-ink-muted mt-1 text-sm">One identity across every system in the network.</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {ECOSYSTEM.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/ecosystem#${entry.id}`}
                className="border-hairline-strong text-ink hover:border-primary/50 hover:bg-surface-2 inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors"
              >
                {entry.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
