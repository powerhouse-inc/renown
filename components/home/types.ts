import type { HighlightedCode } from '../../lib/highlight'
import type { RenownAppProfile } from '../../services/app-profiles'

/** Network-wide counts from renown-stats `renownNetworkStats` (filled in by Phase B). */
export interface NetworkPulse {
  identities: number
  apps: number
  activeCredentials: number
  activeUsers30d: number
  /** ISO timestamp of the cached snapshot. */
  updatedAt: string
}

/** Props of the marketing homepage (pages/index.tsx without an auth query). */
export interface HomePageData {
  /** Up to 6 newest app profiles; the section hides below 3. */
  featuredApps: RenownAppProfile[]
  /** Phase B: network stats; null/undefined renders nothing. */
  pulse?: NetworkPulse | null
  /** The developers-teaser code sample, highlighted server-side. */
  teaser: HighlightedCode
}
