import dynamic from 'next/dynamic'
import { Component, type ComponentType, type ReactNode } from 'react'

/** What a wallet route shows while the wallet stack loads, or when it failed to load or to render. */
export interface WalletFallbackProps {
  /** Set when the wallet code could not be downloaded (e.g. offline, or a deploy replaced the chunks) or threw while rendering. */
  error: Error | null
}

interface BoundaryProps {
  fallback: (error: Error) => ReactNode
  children: ReactNode
}

/**
 * Catches errors thrown while the wallet shell or the route's body renders
 * (a provider that fails to initialise, a bug in the body) and shows the
 * route's fallback in their place, so the rest of the page stays.
 */
class WalletErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown): void {
    // Name and a short message, never the stack (wallet errors can carry session details at length).
    const summary = error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : 'non-error thrown'
    console.error(`Wallet code failed to render: ${summary}`)
  }

  render(): ReactNode {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children
  }
}

// Playwright runs the dev server with NEXT_PUBLIC_E2E_AUTH=1: a test can then
// make the body throw on render by setting window.__renownE2eWalletRenderError.
// Inert in every other build: the probe still ships, but never renders (the
// env var is unset there, so E2E_AUTH is false).
const E2E_AUTH = process.env.NEXT_PUBLIC_E2E_AUTH === '1'
function E2eRenderErrorProbe(): null {
  if ((window as { __renownE2eWalletRenderError?: boolean }).__renownE2eWalletRenderError) {
    throw new Error('E2E: wallet render error')
  }
  return null
}

/**
 * `Body` rendered inside the wallet providers, in the browser only. The wallet
 * stack and `Body` download in parallel (one round trip, no waterfall), so the
 * page that uses this carries no wallet code in its own chunk. `Fallback`
 * renders on the server, during hydration and until both have loaded; with an
 * error when either could not be downloaded or threw while rendering.
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
            <WalletErrorBoundary fallback={(error) => <Fallback error={error} />}>
              <WalletShell>
                {E2E_AUTH && <E2eRenderErrorProbe />}
                <Body {...props} />
              </WalletShell>
            </WalletErrorBoundary>
          )
        }
        return WalletBody
      }),
    { ssr: false, loading: ({ error }) => <Fallback error={error ?? null} /> },
  )
}
