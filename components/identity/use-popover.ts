import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

export type PopoverPlacement = 'below' | 'above'

// Phones show popovers as bottom sheets (CSS, below 640 px): no placement to compute there.
const SHEET_QUERY = '(max-width: 639.98px)'
const GAP = 8

// useLayoutEffect warns on the server; popovers only open in the browser anyway.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * A button-anchored popover: toggled by its button, closed by Escape (focus
 * returns to the button) or a click/focus outside. Not modal: no focus trap.
 * On wider screens the panel opens below its button, or above it when only
 * there it fits the viewport (decided before paint, so it never jumps); if it
 * fits neither way the page scrolls just enough to show it. Every opening
 * starts from "below" again, however the panel was closed, and a resize while
 * open picks the side again (no scrolling then).
 */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<PopoverPlacement>('below')

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    setPlacement('below')
    if (restoreFocus) buttonRef.current?.focus()
  }, [])

  /** Picks the side the panel fits on; `scroll` lets it scroll the page when it fits neither. */
  const place = useCallback((scroll: boolean) => {
    const button = buttonRef.current
    const panel = panelRef.current
    if (!button || !panel || window.matchMedia(SHEET_QUERY).matches) return
    const anchor = button.getBoundingClientRect()
    const height = panel.offsetHeight
    // A sticky site header covers the top of the viewport.
    const top = Array.from(document.querySelectorAll('header'))
      .filter((el) => ['sticky', 'fixed'].includes(getComputedStyle(el).position))
      .reduce((max, el) => Math.max(max, el.getBoundingClientRect().bottom), 0)
    const fitsBelow = anchor.bottom + GAP + height <= window.innerHeight
    const fitsAbove = anchor.top - GAP - height >= Math.max(top, 0)
    setPlacement(!fitsBelow && fitsAbove ? 'above' : 'below')
    if (!fitsBelow && !fitsAbove && scroll) panel.scrollIntoView({ block: 'nearest' })
  }, [])

  useIsoLayoutEffect(() => {
    if (!open) return
    place(true)
    const onResize = () => place(false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, place])

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
      // Closing through the toggle resets the placement like every other way of closing.
      onClick: () => (open ? close(false) : setOpen(true)),
    },
    panelId: `${id}-panel`,
    panelRef,
    /** Where the panel sits on screens of 640 px and wider. */
    placement,
    close,
  }
}
