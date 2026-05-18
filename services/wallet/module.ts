import type { ComponentType, ReactNode } from 'react'
import type { WalletAdapter } from './adapter'

/**
 * Self-describing provider module. The single source of truth for whether
 * a provider is active is `enabled` — `setup.ts` and `AuthRootProvider`
 * both derive from it, so the gating decision lives in one place.
 */
export interface AuthProviderModule {
  /** Stable identifier matching the adapter's {@link WalletAdapter.name}. */
  name: string
  /** When `false`, `setup.ts` skips registration and the provider is omitted from the React tree. */
  enabled: boolean
  /** Factory for the singleton adapter instance registered at startup. */
  createAdapter(): WalletAdapter
  /**
   * React wrapper that mounts the underlying SDK's provider tree (wagmi,
   * Privy, …), side-loads a bridge that wires the SDK to `adapter` via
   * effects, and renders `children` inside.
   */
  Provider: ComponentType<{ adapter: WalletAdapter; children: ReactNode }>
}
