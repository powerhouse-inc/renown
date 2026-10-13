import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useNow } from '../../hooks/use-now'
import { notificationHref, notificationText } from '../../lib/orgs/notifications'
import {
  markNotificationsRead,
  myNotifications,
  withBearer,
  type OrgNotification,
} from '../../services/orgs'
import { cx } from '../../utils/cx'
import { formatRelative } from '../../utils/relative-time'
import { buttonClasses } from '../site/primitives'
import { useRenownBearer } from '../site/use-renown-bearer'
import { NOTIFICATIONS_CHANGED } from '../site/use-unread-count'
import { useSiteAuth } from '../site/use-site-auth'

type Filter = 'all' | 'unread'

interface ListState {
  key: string
  items: OrgNotification[]
  next: string | null
  status: 'ready' | 'error'
  more: 'idle' | 'loading' | 'error'
}

function InboxList({ address }: { address: string }) {
  const getBearer = useRenownBearer()
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('all')
  const [attempt, setAttempt] = useState(0)
  const [list, setList] = useState<ListState | null>(null)
  const key = `${address}:${filter}:${attempt}`

  useEffect(() => {
    let cancelled = false
    withBearer(getBearer, (bearer) =>
      myNotifications({ unreadOnly: filter === 'unread', after: null }, bearer),
    ).then(
      (page) => {
        if (!cancelled)
          setList({ key, items: page.items, next: page.next, status: 'ready', more: 'idle' })
      },
      () => {
        if (!cancelled) setList({ key, items: [], next: null, status: 'error', more: 'idle' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, filter, getBearer])

  const current = list && list.key === key ? list : null

  const loadMore = useCallback(async () => {
    if (!current?.next || current.more === 'loading') return
    const after = current.next
    setList((l) => (l ? { ...l, more: 'loading' } : l))
    try {
      const page = await withBearer(getBearer, (bearer) =>
        myNotifications({ unreadOnly: filter === 'unread', after }, bearer),
      )
      setList((l) =>
        l && l.key === key
          ? {
              ...l,
              items: [...l.items, ...page.items.filter((n) => !l.items.some((o) => o.id === n.id))],
              next: page.next,
              more: 'idle',
            }
          : l,
      )
    } catch {
      setList((l) => (l ? { ...l, more: 'error' } : l))
    }
  }, [current, filter, getBearer, key])

  async function markRead(target: { ids: string[] } | { all: true }) {
    try {
      await withBearer(getBearer, (bearer) => markNotificationsRead(target, bearer))
    } catch {
      return
    }
    const at = new Date().toISOString()
    setList((l) =>
      l
        ? {
            ...l,
            items: l.items.map((n) =>
              !n.readAt && ('all' in target || target.ids.includes(n.id))
                ? { ...n, readAt: at }
                : n,
            ),
          }
        : l,
    )
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
  }

  const unread = current?.items.filter((n) => !n.readAt).length ?? 0

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-ink text-h1">Notifications</h1>
          <p className="text-ink-muted mt-2">
            Invites, approvals and changes in your organisations. Kept for 90 days.
          </p>
        </div>
        <button
          type="button"
          disabled={!current || unread === 0}
          onClick={() => void markRead({ all: true })}
          className={buttonClasses('secondary', 'md')}
        >
          Mark all as read
        </button>
      </div>
      <div className="mt-6 flex gap-2">
        {(['all', 'unread'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cx(
              'h-9 rounded-full border px-4 text-sm font-medium transition-colors',
              filter === value
                ? 'bg-primary-strong text-primary-foreground border-transparent'
                : 'border-hairline-strong bg-surface-1 text-ink',
            )}
          >
            {value === 'all' ? 'All' : 'Unread'}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {current === null ? (
          <p role="status" className="text-ink-muted text-sm">
            Loading notifications…
          </p>
        ) : current.status === 'error' ? (
          <div
            role="alert"
            className="border-hairline-strong rounded-panel border border-dashed px-6 py-10 text-center"
          >
            <p className="text-ink">Your notifications did not load.</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className={buttonClasses('primary', 'md', 'mt-4')}
            >
              Try again
            </button>
          </div>
        ) : current.items.length === 0 ? (
          <p className="text-ink-muted border-hairline-strong rounded-panel border border-dashed px-6 py-10 text-center">
            {filter === 'unread' ? 'Nothing unread.' : 'No notifications yet.'}
          </p>
        ) : (
          <ul
            aria-label="Notifications"
            className="border-hairline bg-surface-1 rounded-card divide-hairline divide-y border"
          >
            {current.items.map((n) => (
              <li key={n.id}>
                <Link
                  href={notificationHref(n)}
                  onClick={() => {
                    if (!n.readAt) void markRead({ ids: [n.id] })
                  }}
                  className="hover:bg-surface-2 flex items-start gap-3 px-4 py-4 transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'mt-2 h-2 w-2 shrink-0 rounded-full',
                      n.readAt ? 'bg-transparent' : 'bg-primary',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cx(
                        'block text-sm leading-6 break-words',
                        n.readAt ? 'text-ink-muted' : 'text-ink font-medium',
                      )}
                    >
                      {notificationText(n)}
                    </span>
                    <time dateTime={n.createdAt} className="text-ink-muted text-xs">
                      {formatRelative(n.createdAt, now)}
                    </time>
                  </span>
                  {!n.readAt && <span className="sr-only">Unread</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {current?.next && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            aria-disabled={current.more === 'loading'}
            onClick={() => void loadMore()}
            className={buttonClasses('secondary', 'md')}
          >
            {current.more === 'loading' ? 'Loading…' : 'Load more'}
          </button>
          {current.more === 'error' && (
            <p role="alert" className="text-ink-muted text-sm">
              More notifications didn&apos;t load. Select the button to try again.
            </p>
          )}
        </div>
      )}
    </>
  )
}

/** /notifications: the signed-in visitor's organisation inbox (bearer reads, no wallet). */
export function Inbox() {
  const auth = useSiteAuth()
  if (auth.state === 'loading') {
    return (
      <p role="status" className="text-ink-muted py-24 text-center">
        Loading…
      </p>
    )
  }
  if (auth.state === 'signed-out') {
    return (
      <div className="border-hairline bg-surface-1 shadow-card rounded-panel mx-auto max-w-lg border px-6 py-12 text-center">
        <h1 className="text-ink text-h2">Notifications</h1>
        <p className="text-ink-muted mt-4 leading-7">
          Sign in to see invites and changes in your organisations.
        </p>
        <button
          type="button"
          onClick={auth.login}
          className={buttonClasses('primary', 'lg', 'mt-8')}
        >
          Sign in
        </button>
      </div>
    )
  }
  return <InboxList key={auth.address} address={auth.address} />
}
