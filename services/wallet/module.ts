import type { ComponentType, ReactNode } from 'react'
import type { WalletAdapter } from './adapter'

/**
 * Self-describing provider module. The single source of truth for whether
 * a provider is active is `enabled` — `setup.ts` and `AuthRootProvider`
 * both derive from it, so the gating decision lives in one place.
 */
export interface AuthProviderModule {
  name: string
  enabled: boolean
  createAdapter(): WalletAdapter
  Provider: ComponentType<{ adapter: WalletAdapter; children: ReactNode }>
}
