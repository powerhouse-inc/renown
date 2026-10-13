import { useEffect, useState } from 'react'
import { myUnreadNotificationCount, withBearer } from '../../services/orgs'

export const UNREAD_POLL_MS = 60_000
/** Fired by the inbox after it marks notifications read, so the bell refreshes at once. */
export const NOTIFICATIONS_CHANGED = 'renown:notifications-changed'

/** Unread notifications of `address`: read now, every minute while the tab is visible, on return to the tab and after the inbox changes. */
export function useUnreadCount(
  address: string | null,
  getBearer: (options?: { fresh?: boolean }) => Promise<string | null>,
): number {
  const [answer, setAnswer] = useState<{ address: string; count: number } | null>(null)

  useEffect(() => {
    if (!address) return
    let cancelled = false
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      void withBearer(getBearer, (bearer) =>
        bearer ? myUnreadNotificationCount(bearer) : Promise.resolve(null),
      ).then(
        (count) => {
          if (!cancelled && count !== null) setAnswer({ address, count })
        },
        () => undefined,
      )
    }
    refresh()
    const timer = setInterval(refresh, UNREAD_POLL_MS)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh)
    }
  }, [address, getBearer])

  return answer && answer.address === address ? answer.count : 0
}
