import Link from 'next/link'
import { useRenownBearer } from './use-renown-bearer'
import { useUnreadCount } from './use-unread-count'

/** The header's inbox link with the unread count. */
export function NotificationsBell({ address }: { address: string }) {
  const getBearer = useRenownBearer()
  const count = useUnreadCount(address, getBearer)
  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      className="text-ink-muted hover:text-ink hover:bg-surface-2 relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="bg-primary-strong text-primary-foreground absolute top-0.5 right-0.5 min-w-[18px] rounded-full px-1 text-center text-[11px] leading-[18px] font-semibold tabular-nums"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
