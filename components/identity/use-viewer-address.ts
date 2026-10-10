import { useRenownAuth } from '@powerhousedao/reactor-browser/renown'
import { useSyncExternalStore } from 'react'

// Playwright runs the dev server with NEXT_PUBLIC_E2E_AUTH=1: a test can then
// stand in for the Renown session on public pages by setting
// window.__renownE2eViewer to a wallet address. Inert in every other build.
const E2E_AUTH = process.env.NEXT_PUBLIC_E2E_AUTH === '1'
const noSubscribe = () => () => {}
const e2eViewer = () => (E2E_AUTH ? ((window as { __renownE2eViewer?: string }).__renownE2eViewer ?? null) : null)

/**
 * The signed-in visitor's wallet address (lowercase) from the Renown session,
 * or null. Null on the server and during hydration (the Renown session is
 * restored in the browser), so owner-only UI appears after mount and never
 * mismatches the server markup.
 */
export function useViewerAddress(): string | null {
  const { address } = useRenownAuth()
  const testViewer = useSyncExternalStore(noSubscribe, e2eViewer, () => null)
  const viewer = address ?? testViewer
  return viewer ? viewer.toLowerCase() : null
}
