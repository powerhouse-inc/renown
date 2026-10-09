// How complete a public profile is (avatar, handle, bio, a link). Pure.
import type { RenownProfile } from '../../services/switchboard'

export type CompletenessKey = 'avatar' | 'handle' | 'bio' | 'links'

export interface CompletenessItem {
  key: CompletenessKey
  label: string
  done: boolean
}

export interface Completeness {
  items: CompletenessItem[]
  done: number
  total: number
  /** 0-100, rounded. */
  percent: number
}

export function profileCompleteness(profile: RenownProfile | null): Completeness {
  const items: CompletenessItem[] = [
    { key: 'avatar', label: 'Add a profile picture', done: Boolean(profile?.avatar || profile?.userImage) },
    { key: 'handle', label: 'Claim your handle', done: Boolean(profile?.handle) },
    { key: 'bio', label: 'Write a short bio', done: Boolean(profile?.bio?.trim()) },
    { key: 'links', label: 'Add a link', done: (profile?.links?.length ?? 0) > 0 },
  ]
  const done = items.filter((item) => item.done).length
  return { items, done, total: items.length, percent: Math.round((done / items.length) * 100) }
}
