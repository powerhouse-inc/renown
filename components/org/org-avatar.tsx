import { ProfileAvatar } from '../profile/profile-avatar'

/** An organisation's avatar (/media/<orgId>/avatar), else an identicon seeded by its id. */
export function OrgAvatar({ org, className = 'h-12 w-12' }: { org: { id: string; avatar: string | null }; className?: string }) {
  return <ProfileAvatar documentId={org.id} avatar={org.avatar} seed={org.id} alt="" className={className} />
}
