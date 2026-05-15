import { useMemo, useSyncExternalStore } from 'react'
import { orchestrator } from '../services/wallet/setup'
import type { LoginMethod, Session } from '../services/wallet/types'

export function useSession(): Session | null {
  return useSyncExternalStore<Session | null>(
    cb => orchestrator.subscribe(cb),
    () => orchestrator.getSession(),
    () => null,
  )
}

export function useOrchestrator() {
  return orchestrator
}

export function useSupportedLoginMethods(): LoginMethod[] {
  const orchestrator = useOrchestrator()

  const supportedMethods = useMemo(() => {
    return orchestrator.getSupportedMethods()
  }, [orchestrator])

  return supportedMethods
}

/**
 * True while any adapter has work in flight that the UI should reflect — e.g.
 * Privy is authenticated but the embedded wallet is still being provisioned.
 */
export function useAuthBusy(): boolean {
  return useSyncExternalStore<boolean>(
    cb => orchestrator.subscribeBusy(() => cb()),
    () => orchestrator.isBusy(),
    () => false,
  )
}
