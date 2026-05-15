import { mainnet, sepolia, polygon, optimism, arbitrum, base } from 'wagmi/chains'
import { wagmiModule } from '../../auth-providers/wagmi'
import { privyModule } from '../../auth-providers/privy'
import type { AuthProviderModule } from './module'
import { AdapterRegistry } from './registry'
import { AuthOrchestrator } from './orchestrator'
import { RenownApi } from './renown-api'
import { SignatureVerifier } from './signature-verifier'

// Static catalog of every provider that exists. NOT a gating decision —
// each module's `enabled` flag is the single source of truth for whether
// the provider is active.
const allModules: AuthProviderModule[] = [wagmiModule, privyModule]

const active = allModules
  .filter(m => m.enabled)
  .map(m => ({ module: m, adapter: m.createAdapter() }))

export const registry = new AdapterRegistry()
for (const { adapter } of active) registry.register(adapter)

export const renownApi = new RenownApi()
export const signatureVerifier = new SignatureVerifier([
  mainnet,
  sepolia,
  polygon,
  optimism,
  arbitrum,
  base,
])

export const orchestrator = new AuthOrchestrator(registry, renownApi, signatureVerifier)

/** Consumed by <AuthRootProvider> to nest the React providers for active modules. */
export const activeProviderTree = active
