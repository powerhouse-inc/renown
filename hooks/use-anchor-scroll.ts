import { useEffect } from 'react'

/**
 * Scrolls to the element the page's #fragment names once `ready`: for targets that
 * render after the browser's one-time fragment scroll (lazy shells, loaded lists).
 * `accepts` limits which fragments this caller handles (keep it stable: module scope).
 */
export function useAnchorScroll(
  ready: boolean,
  accepts: (id: string) => boolean,
  block: ScrollLogicalPosition = 'center',
): void {
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return
    let id: string
    try {
      id = decodeURIComponent(window.location.hash.slice(1))
    } catch {
      return
    }
    if (!id || !accepts(id)) return
    const target = document.getElementById(id)
    if (!target) return
    target.scrollIntoView({ block })
    target.focus({ preventScroll: true })
  }, [ready, accepts, block])
}
