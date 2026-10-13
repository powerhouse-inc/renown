import { useRenown } from '@powerhousedao/reactor-browser/renown'
import { useCallback } from 'react'

// Playwright runs the dev server with NEXT_PUBLIC_E2E_AUTH=1: the bearer then
// comes from window.__renownE2eBearer when set. Inert in every other build.
const E2E_AUTH = process.env.NEXT_PUBLIC_E2E_AUTH === '1'

/** A stable function returning the signed-in visitor's Renown bearer (for reads about them), or null. */
export function useRenownBearer(): (options?: { fresh?: boolean }) => Promise<string | null> {
  const renown = useRenown()
  return useCallback(
    async (options?: { fresh?: boolean }) => {
      if (E2E_AUTH) {
        const injected = (window as { __renownE2eBearer?: string }).__renownE2eBearer
        if (injected) return injected
      }
      if (!renown?.user) return null
      try {
        return await renown.getBearerToken({ expiresIn: 600 }, options?.fresh === true)
      } catch (error) {
        // Only the name: the error can carry token material.
        console.warn('Renown bearer unavailable:', error instanceof Error ? error.name : 'error')
        return null
      }
    },
    [renown],
  )
}
