import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * A button-anchored popover: toggled by its button, closed by Escape (focus
 * returns to the button) or a click/focus outside. Not modal: no focus trap.
 */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close(true)
    }
    function onOutside(event: Event) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('focusin', onOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('focusin', onOutside)
    }
  }, [open, close])

  return {
    open,
    rootRef,
    buttonProps: {
      ref: buttonRef,
      type: 'button' as const,
      'aria-expanded': open,
      'aria-controls': `${id}-panel`,
      onClick: () => setOpen((value) => !value),
    },
    panelId: `${id}-panel`,
    close,
  }
}
