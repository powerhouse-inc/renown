import { useCallback, useEffect, useMemo, useState } from 'react'
import { groupConnections, profileCandidates, type GroupedConnections, type IssuedCredential } from '../../lib/me/connections'
import { RevokeError, revokeConnection, type RevokeDeps, type RevokeFailure } from '../../lib/me/revoke'
import type { RenownAppProfile } from '../../services/app-profiles'
import { fetchAppProfilesFor, fetchIssuedCredentials, sendRevoke } from '../../services/renown-connections'
import { CLIENT_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'

interface Snapshot {
  address: string
  credentials: IssuedCredential[]
  profiles: Record<string, RenownAppProfile | null>
}

export interface Connections {
  status: 'loading' | 'ready' | 'error'
  credentials: IssuedCredential[]
  grouped: GroupedConnections
  /** Reloads after a failed read. */
  retry: () => void
  /** Revokes optimistically: the row disappears at once and comes back if the revoke fails. */
  revoke: (credentialId: string) => Promise<{ ok: true } | { ok: false; reason: RevokeFailure }>
}

/** Each read is bounded, so a hung switchboard ends in the error state instead of loading forever. */
async function load(address: string): Promise<Snapshot> {
  const credentials = await withTimeout(fetchIssuedCredentials(address), CLIENT_DATA_TIMEOUT_MS)
  // Without app profiles every subject still lists, as a session: degrade, don't fail.
  const profiles = await withTimeout(fetchAppProfilesFor(profileCandidates(credentials)), CLIENT_DATA_TIMEOUT_MS).catch((error: unknown) => {
    console.warn('App profiles for /me unavailable:', error)
    return {}
  })
  return { address, credentials, profiles }
}

/** The approvals `address` has issued, with optimistic revoke and a refetch after each one. */
export function useConnections(address: string, auth: Pick<RevokeDeps, 'getBearer' | 'signMessage'>): Connections {
  const [attempt, setAttempt] = useState(0)
  const [snapshot, setSnapshot] = useState<(Snapshot & { attempt: number }) | null>(null)
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null)
  // Revoked here or being revoked: hidden even if a refetch still lists them (the read model can lag).
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    load(address)
      .then((next) => {
        if (!cancelled) setSnapshot({ ...next, attempt })
      })
      .catch((error: unknown) => {
        console.warn('Approvals unavailable:', error)
        if (!cancelled) setFailedAttempt(attempt)
      })
    return () => {
      cancelled = true
    }
  }, [address, attempt])

  const current = snapshot && snapshot.address === address ? snapshot : null
  const status: Connections['status'] =
    current && current.attempt === attempt ? 'ready' : failedAttempt === attempt ? 'error' : 'loading'

  const grouped = useMemo(
    () => groupConnections(current?.credentials ?? [], current?.profiles ?? {}, hidden),
    [current, hidden],
  )

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // Refetch quietly: the list stays on screen (revoked rows stay hidden).
  const refresh = useCallback(() => {
    load(address)
      .then((next) => setSnapshot((prev) => (prev && prev.address === address ? { ...next, attempt: prev.attempt } : prev)))
      .catch((error: unknown) => console.warn('Approvals refetch failed:', error))
  }, [address])

  const { getBearer, signMessage } = auth
  const revoke = useCallback(
    async (credentialId: string): Promise<{ ok: true } | { ok: false; reason: RevokeFailure }> => {
      setHidden((set) => new Set(set).add(credentialId))
      try {
        await revokeConnection(credentialId, { getBearer, signMessage, send: sendRevoke })
      } catch (error) {
        setHidden((set) => {
          const next = new Set(set)
          next.delete(credentialId)
          return next
        })
        const reason = error instanceof RevokeError ? error.reason : 'UNKNOWN'
        if (reason === 'NOT_FOUND') refresh()
        return { ok: false, reason }
      }
      refresh()
      return { ok: true }
    },
    [getBearer, signMessage, refresh],
  )

  return { status, credentials: current?.credentials ?? [], grouped, retry, revoke }
}
