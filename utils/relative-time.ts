// Human dates for /me: "in 6 days" / "3 hours ago" plus an absolute form.

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "in 5 minutes", "3 hours ago", "tomorrow", "in 6 days", "2 months ago", "in 1 year". */
export function formatRelative(iso: string, now: Date): string {
  const diff = Date.parse(iso) - now.getTime()
  const abs = Math.abs(diff)
  if (Number.isNaN(diff)) return ''
  if (abs < 45_000) return 'just now'
  if (abs < HOUR) return RELATIVE.format(Math.round(diff / MINUTE), 'minute')
  if (abs < DAY) return RELATIVE.format(Math.round(diff / HOUR), 'hour')
  if (abs < 30 * DAY) return RELATIVE.format(Math.round(diff / DAY), 'day')
  if (abs < 365 * DAY) return RELATIVE.format(Math.round(diff / (30 * DAY)), 'month')
  return RELATIVE.format(Math.round(diff / (365 * DAY)), 'year')
}

/** "Oct 9, 2026, 2:03 PM" in the viewer's time zone (or `timeZone`). */
export function formatAbsolute(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone })
}
