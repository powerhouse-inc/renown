import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { buttonClasses } from '../site/primitives'

/** What a confirmation says and does. */
export interface ConfirmRequest {
  title: string
  body: string
  /** A sharper line, shown highlighted (e.g. it ends the viewer's own ownership). */
  warning?: string | null
  /** The confirm button's text; it names the action and what it acts on. */
  confirm: string
  onConfirm: () => void
}

/**
 * Asks before a high-impact action. A native modal <dialog>: the page behind
 * is inert, focus starts on Cancel (the safe choice), Esc or the backdrop
 * cancels and focus returns to the button that opened it.
 */
export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | null
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (request && !el.open) el.showModal()
    if (!request && el.open) el.close()
  }, [request])

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onClose={() => request && onClose()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="bg-background text-ink rounded-panel border-hairline-strong shadow-card m-auto w-[calc(100%-2rem)] max-w-md border p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {request && (
        <div className="p-6 md:p-7">
          <h2 id={`${id}-title`} className="text-ink text-h3 break-words">
            {request.title}
          </h2>
          <p id={`${id}-body`} className="text-ink-muted mt-3 leading-6 break-words">
            {request.body}
          </p>
          {request.warning && (
            <p
              role="alert"
              className="border-danger-ink/40 bg-danger-ink/[0.07] text-ink rounded-card mt-4 border px-3 py-2 text-sm leading-6"
            >
              {request.warning}
            </p>
          )}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {/* First in DOM order, so showModal() focuses Cancel. */}
            <button type="button" onClick={onClose} className={buttonClasses('secondary')}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                dialog.current?.close()
                onClose()
                request.onConfirm()
              }}
              className="bg-danger text-primary-foreground inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-[filter] hover:brightness-110"
            >
              {request.confirm}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}

/** One confirmation dialog per panel: `ask` opens it, `dialog` renders it. */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const close = useCallback(() => setRequest(null), [])
  return { ask: setRequest, dialog: <ConfirmDialog request={request} onClose={close} /> }
}
