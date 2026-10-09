import { profilePath } from '../../utils/profile-url'
import type { NavLink } from './nav'

/** The signed-in user's destinations (header menu and mobile drawer). */
export function accountLinks(address: string, profile: { handle?: string | null; documentId: string } | null): NavLink[] {
  return [
    { label: 'Your Renown', href: '/me' },
    { label: 'Your profile', href: profile?.handle ? profilePath(profile) : `/profile/${address}` },
    { label: 'Edit profile', href: '/profile/edit' },
  ]
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
