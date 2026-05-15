import type { ReactNode } from 'react'
import { activeProviderTree } from './setup'

/**
 * Nests the React providers for every active auth module. Adding a new
 * provider requires no changes here — register it in `setup.ts`'s
 * `allModules` and ensure its `module.enabled` is true.
 */
export function AuthRootProvider({ children }: { children: ReactNode }) {
  return activeProviderTree.reduceRight<ReactNode>(
    (acc, { module, adapter }) => (
      <module.Provider adapter={adapter}>{acc}</module.Provider>
    ),
    children,
  )
}
