import { useEffect, useState } from 'react'

/** A labelled value (DID, address) with a copy button that confirms in a live region. */
export function CopyField({ label, value }: { label: string; value: string }) {
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
    <div className="border-hairline flex items-center gap-3 border-t py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-ink-muted text-xs">{label}</p>
        <p className="text-ink truncate font-mono text-[13px]" title={value}>
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className="text-primary-ink hover:bg-surface-2 shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
      >
        Copy<span className="sr-only"> {label.toLowerCase()}</span>
      </button>
      <span role="status" className="sr-only">
        {copied ? `${label} copied` : ''}
      </span>
    </div>
  )
}
