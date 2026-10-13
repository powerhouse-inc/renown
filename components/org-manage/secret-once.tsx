import { useState, type ReactNode } from 'react'
import { buttonClasses } from '../site/primitives'

/** A secret Renown shows only once: kept in component state only, with a copy button. Never log or track it. */
export function SecretOnce({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <div role="region" aria-label={label} className="border-primary/30 bg-primary/[0.05] rounded-card mt-5 border p-4">
      <p className="text-ink text-sm font-semibold">Copy it now: Renown shows it only once.</p>
      <p className="text-ink mt-2 font-mono text-[13px] break-all">{value}</p>
      <button
        type="button"
        onClick={() => {
          Promise.resolve()
            .then(() => navigator.clipboard.writeText(value))
            .then(
              () => setCopied(true),
              () => setCopied(false),
            )
        }}
        className={buttonClasses('secondary', 'md', 'mt-3')}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {children}
    </div>
  )
}
