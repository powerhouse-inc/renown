import { useEffect, useRef } from 'react'
import { buttonClasses } from '../site/primitives'

export interface RevokeTarget {
  credentialId: string
  /** The app or session name the dialog names. */
  name: string
  /** Element to focus once the row is gone (its section heading). */
  sectionId: string
}

/**
 * Confirms a revoke. A native modal <dialog>: the page behind is inert, focus
 * starts on Cancel (the safe choice), Esc cancels and focus returns to the
 * button that opened it.
 */
export function RevokeDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: RevokeTarget | null
  onCancel: () => void
  onConfirm: (target: RevokeTarget) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (target && !el.open) el.showModal()
    if (!target && el.open) el.close()
  }, [target])

  return (
    <dialog
      ref={dialog}
      aria-labelledby="revoke-title"
      aria-describedby="revoke-body"
      onClose={() => target && onCancel()}
      onClick={(event) => {
        // A click on the backdrop (the dialog box itself, outside its panel) cancels.
        if (event.target === event.currentTarget) onCancel()
      }}
      className="bg-background text-ink rounded-panel border-hairline-strong shadow-card m-auto w-[calc(100%-2rem)] max-w-md border p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {target && (
        <div className="p-6 md:p-7">
          <h2 id="revoke-title" className="text-ink text-h3">
            Revoke {target.name}?
          </h2>
          <p id="revoke-body" className="text-ink-muted mt-3 leading-6">
            {target.name} will no longer be able to act for you. To use it again, you approve it again.
          </p>
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {/* First in DOM order, so showModal() focuses Cancel. */}
            <button type="button" onClick={onCancel} className={buttonClasses('secondary')}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                // Close first: the dialog hands focus back to the opener now,
                // so onConfirm can move it elsewhere once the row is gone.
                dialog.current?.close()
                onConfirm(target)
              }}
              className="bg-danger text-primary-foreground inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition-[filter] hover:brightness-110"
            >
              Revoke
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
