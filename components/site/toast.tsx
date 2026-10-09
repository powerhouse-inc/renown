import { useCallback, useEffect, useRef, useState } from 'react'
import { cx } from '../../utils/cx'

export interface Toast {
  id: number
  tone: 'success' | 'error'
  text: string
}

const LIFETIME_MS = { success: 5000, error: 9000 }

/** A small queue of toasts; each one dismisses itself after a few seconds. */
export function useToasts(): { toasts: Toast[]; show: (tone: Toast['tone'], text: string) => void; dismiss: (id: number) => void } {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (tone: Toast['tone'], text: string) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-2), { id, tone, text }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), LIFETIME_MS[tone]),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => clearTimeout(timer))
  }, [])

  return { toasts, show, dismiss }
}

/**
 * Where toasts appear (bottom centre). The polite live region is always in the
 * page so screen readers hear success messages; errors are role="alert".
 */
export function ToastRegion({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={cx(
            'shadow-card rounded-panel pointer-events-auto flex w-full max-w-md items-start gap-3 border px-4 py-3 text-sm',
            'bg-background text-ink',
            toast.tone === 'error' ? 'border-danger/50' : 'border-signal/40',
          )}
        >
          <span
            aria-hidden="true"
            className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', toast.tone === 'error' ? 'bg-danger' : 'bg-signal')}
          />
          <p className="flex-1 leading-6">{toast.text}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="text-ink-muted hover:text-ink -mr-1 rounded px-1 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}
