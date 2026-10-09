import type { RenownProfileLink } from '../../services/switchboard'
import { ProfileAvatar } from './profile-avatar'
import { ProfileLinks } from './profile-links'

export interface ProfileSummaryData {
  documentId?: string | null
  address: string
  displayName?: string | null
  username?: string | null
  handle?: string | null
  bio?: string | null
  links?: RenownProfileLink[]
  /** attachment://v1:<sha256> of the uploaded avatar. */
  avatar?: string | null
  userImage?: string | null
  previewUrl?: string | null
  ensVerified?: boolean
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** The name a profile is shown under: display name, then username, then the short address. */
export function profileName(p: Pick<ProfileSummaryData, 'displayName' | 'username' | 'address'>): string {
  return p.displayName || p.username || shortAddress(p.address)
}

/** Avatar, name, @handle, badges, bio and links — the public face of a profile (also the editor preview). */
export function ProfileSummary({ profile }: { profile: ProfileSummaryData }) {
  const name = profileName(profile)
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <ProfileAvatar
        documentId={profile.documentId}
        avatar={profile.avatar}
        userImage={profile.userImage}
        previewUrl={profile.previewUrl}
        seed={profile.address}
        alt={name}
        className="h-32 w-32 border-4 border-white shadow-lg dark:border-white/20"
      />
      <div className="space-y-1">
        <h1 className="text-foreground text-3xl font-bold [overflow-wrap:anywhere]">{name}</h1>
        {profile.handle && <p className="text-muted-foreground font-medium">@{profile.handle}</p>}
      </div>
      {profile.ensVerified && profile.username && (
        <span
          className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
          title={`${profile.username} resolves to this address`}
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          ENS verified · {profile.username}
        </span>
      )}
      {profile.bio && (
        <p className="text-foreground/90 max-w-prose whitespace-pre-line [overflow-wrap:anywhere]">{profile.bio}</p>
      )}
      <ProfileLinks links={profile.links ?? []} />
    </div>
  )
}
