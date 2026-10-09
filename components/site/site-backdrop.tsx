/**
 * The site's ambient background: a primary/signal aurora at the top of the
 * page, fading out below the first screen. Pure
 * CSS (no image requests), decorative only.
 */
export function SiteBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1100px] overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 78% 8%, color-mix(in oklab, var(--grad-to) 22%, transparent), transparent 70%),' +
            'radial-gradient(40% 35% at 12% 0%, color-mix(in oklab, var(--grad-from) 12%, transparent), transparent 70%)',
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-[var(--background)]" />
    </div>
  )
}
