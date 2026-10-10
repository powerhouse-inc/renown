import { useEffect, useState } from 'react'

export interface CopyRowProps {
  label: string
  value: string
  /** Optional link shown under the value (e.g. a block explorer). */
  link?: { href: string; label: string }
}

/** A labelled value (DID, address) shown in full, with a copy button confirmed in a live region. */
export function CopyRow({ label, value, link }: CopyRowProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="border-hairline border-t py-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-ink-muted text-xs font-medium">{label}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-primary-ink hover:bg-surface-2 -my-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
          <span className="sr-only"> {label.toLowerCase()}</span>
        </button>
      </div>
      <p className="text-ink mt-1 font-mono text-[13px] leading-5 break-all">{value}</p>
      {link && (
        <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-primary-ink mt-1.5 inline-block text-xs font-semibold hover:underline">
          {link.label}
        </a>
      )}
      <span role="status" className="sr-only">
        {copied ? `${label} copied` : ''}
      </span>
    </div>
  )
}
