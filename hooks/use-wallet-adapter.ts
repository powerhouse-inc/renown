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
