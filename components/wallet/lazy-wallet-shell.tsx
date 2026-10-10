import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'

/** What a wallet route shows while the wallet stack loads, or when it failed to load. */
export interface WalletFallbackProps {
  /** Set when the wallet code could not be downloaded (e.g. offline, or a deploy replaced the chunks). */
  error: Error | null
}

/**
 * `Body` rendered inside the wallet providers, in the browser only. The wallet
 * stack and `Body` download in parallel (one round trip, no waterfall), so the
 * page that uses this carries no wallet code in its own chunk. `Fallback`
 * renders on the server, during hydration and until both have loaded.
 *
 * Call it at module scope of a page, with an inline `import()`:
 *   const MeBody = withLazyWalletShell(() => import('../components/me/me-page-body').then((m) => m.MePageBody), MeFallback)
 */
export function withLazyWalletShell<P extends object>(
  loadBody: () => Promise<ComponentType<P>>,
  Fallback: ComponentType<WalletFallbackProps>,
): ComponentType<P> {
  return dynamic<P>(
    () =>
      Promise.all([import('./wallet-shell'), loadBody()]).then(([{ WalletShell }, Body]) => {
        function WalletBody(props: P) {
          return (
            <WalletShell>
              <Body {...props} />
            </WalletShell>
          )
        }
        return WalletBody
      }),
    { ssr: false, loading: ({ error }) => <Fallback error={error ?? null} /> },
  )
}
