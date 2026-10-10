import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { QrCode } from '../../lib/qr'
import { cx } from '../../utils/cx'
import { buttonClasses } from '../site/primitives'
import { usePopover } from './use-popover'

export interface ShareMenuProps {
  /** Absolute canonical URL to share. */
  url: string
  /** Title passed to the system share sheet. */
  title: string
  /** QR code of `url`, computed on the server (lib/qr.ts); omitted when null. */
  qr: QrCode | null
  /** What the QR code opens, for its caption ("this profile", "this app"). */
  subject: string
  align?: 'start' | 'end'
}

const noSubscribe = () => () => {}

/** "Share": copy the link (announced), a QR code, and the system share sheet where there is one. */
export function ShareMenu({ url, title, qr, subject, align = 'end' }: ShareMenuProps) {
  const { open, rootRef, buttonProps, panelId, panelRef, placement } = usePopover()
  const [copied, setCopied] = useState(false)
  // The system share sheet exists only in some browsers; false on the server and during hydration.
  const canShare = useSyncExternalStore(noSubscribe, () => typeof navigator.share === 'function', () => false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  async function share() {
    try {
      await navigator.share({ title, url })
    } catch {
      // Dismissed by the user, or blocked: nothing to do.
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button {...buttonProps} className={buttonClasses('secondary', 'md')}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
        Share
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label="Share"
          className={cx(
            // Below 640 px a sheet pinned to the bottom of the screen, like the verified badge's.
            'border-hairline-strong bg-background shadow-card rounded-card z-30 border p-4 max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 sm:absolute sm:w-72',
            align === 'end' ? 'sm:right-0' : 'sm:left-0',
            placement === 'above' ? 'sm:bottom-full sm:mb-2' : 'sm:top-full sm:mt-2',
          )}
        >
          <p className="text-ink-muted truncate font-mono text-xs" title={url}>
            {url.replace(/^https?:\/\//, '')}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void copy()} className={buttonClasses('primary', 'md', 'flex-1')}>
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            {canShare && (
              <button type="button" onClick={() => void share()} className={buttonClasses('secondary', 'md')}>
                More options
              </button>
            )}
          </div>
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? 'Link copied' : ''}
          </span>
          {qr && (
            <figure className="mt-4 flex flex-col items-center gap-2">
              {/* White quiet zone in both themes: scanners need dark modules on light. */}
              <svg
                role="img"
                aria-label={`QR code for ${url}`}
                viewBox={`0 0 ${qr.size + 8} ${qr.size + 8}`}
                shapeRendering="crispEdges"
                className="h-40 w-40 rounded-lg bg-white"
              >
                <path d={qr.path} transform="translate(4 4)" fill="#0B1220" />
              </svg>
              <figcaption className="text-ink-muted text-xs">Scan to open {subject}</figcaption>
            </figure>
          )}
        </div>
      )}
    </div>
  )
}
