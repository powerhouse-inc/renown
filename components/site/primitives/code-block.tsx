import { useEffect, useRef, useState } from 'react'
import { cx } from '../../../utils/cx'

export interface CodeBlockProps {
  /** Plain source, copied to the clipboard. */
  code: string
  /** Pre-highlighted HTML from lib/highlight.ts (server-side only); plain code is shown when absent. */
  html?: string | null
  /** Caption in the block's top bar, e.g. a file name or "Terminal". */
  label?: string
  className?: string
}

/** A code sample with a copy button; "Copied" is announced through a live region. */
export function CodeBlock({ code, html, label, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <figure
      className={cx(
        'border-hairline bg-code rounded-card group relative overflow-hidden border text-left shadow-card',
        className,
      )}
    >
      <div className="border-hairline flex h-11 items-center justify-between gap-3 border-b pr-2 pl-4">
        <figcaption className="text-ink-muted truncate font-mono text-xs">{label ?? ''}</figcaption>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-ink-muted hover:text-ink hover:bg-surface-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {copied ? (
              <path d="M20 6 9 17l-5-5" />
            ) : (
              <>
                <rect x="9" y="9" width="12" height="12" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </>
            )}
          </svg>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? 'Copied' : ''}
        </span>
      </div>
      {html ? (
        <div
          className="overflow-x-auto p-4 font-mono text-[13px] leading-6"
          // Trusted: produced at build/SSR time by lib/highlight.ts from literals in this repo.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre tabIndex={0} className="text-ink overflow-x-auto p-4 font-mono text-[13px] leading-6">
          <code>{code}</code>
        </pre>
      )}
    </figure>
  )
}
