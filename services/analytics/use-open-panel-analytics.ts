import { useCallback } from 'react'
import { useOpenPanel } from '@openpanel/nextjs'
import type { AnalyticsEvent } from './events'

/** Identity payload for {@link Analytics.identify}. profileId is required. */
export interface AnalyticsIdentity {
  profileId: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
  properties?: Record<string, unknown>
}

export interface Analytics {
  track: (event: AnalyticsEvent, properties?: Record<string, unknown>) => void
  identify: (payload: AnalyticsIdentity) => void
  clear: () => void
}

/**
 * Thin, fail-safe wrapper over OpenPanel's {@link useOpenPanel} hook.
 *
 * Call sites use this — never the SDK directly — so the event taxonomy stays
 * centralized (see {@link AnalyticsEvent}) and the SDK can be swapped without
 * touching feature code. Every call is wrapped in try/catch: analytics must
 * never break the app. When the client ID is unset the SDK's `window.op` proxy
 * simply queues calls that are never flushed, so this remains safe to call.
 */
export function useOpenPanelAnalytics(): Analytics {
  const op = useOpenPanel()

  const track = useCallback<Analytics['track']>(
    (event, properties) => {
      try {
        op.track(event, properties)
      } catch (e) {
        console.warn('[analytics] track failed', e)
      }
    },
    [op],
  )

  const identify = useCallback<Analytics['identify']>(
    payload => {
      try {
        op.identify(payload)
      } catch (e) {
        console.warn('[analytics] identify failed', e)
      }
    },
    [op],
  )

  const clear = useCallback<Analytics['clear']>(() => {
    try {
      op.clear()
    } catch (e) {
      console.warn('[analytics] clear failed', e)
    }
  }, [op])

  return { track, identify, clear }
}
