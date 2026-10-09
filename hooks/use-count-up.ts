import { useEffect, type RefObject } from 'react'

const DURATION_MS = 1400

/** easeOutExpo, the site's motion curve. */
function ease(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

/**
 * Counts the text of `ref` up from 0 to `value` the first time it scrolls
 * into view. The server markup already shows the final number, so crawlers,
 * no-JS visitors and anything above the fold see it unchanged; only a number
 * still below the fold is reset to 0 (off screen, so nothing flashes). Writes
 * the DOM directly (no re-render per frame). Off under prefers-reduced-motion.
 */
export function useCountUp(ref: RefObject<HTMLElement | null>, value: number, format: (n: number) => string): void {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined' || value <= 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (el.getBoundingClientRect().top < window.innerHeight) return

    el.textContent = format(0)
    let frame = 0
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION_MS)
          el.textContent = format(Math.round(value * ease(t)))
          if (t < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      },
      { rootMargin: '0px 0px -15% 0px' },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      el.textContent = format(value)
    }
  }, [ref, value, format])
}
