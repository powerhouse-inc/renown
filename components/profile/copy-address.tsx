import { useState } from 'react'

/** The full address, with a copy button that confirms for two seconds. */
export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="border-border bg-secondary text-foreground hover:bg-foreground/10 flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
      aria-label="Copy address"
    >
      <span className="break-all font-mono text-xs">{address}</span>
      <span className="text-muted-foreground shrink-0 text-xs">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}
