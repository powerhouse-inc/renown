import Link from 'next/link'
import { identityAccent } from '../../lib/identity-art'
import { profileDisplayName } from '../../lib/profile-identity'
import type { Person } from '../../services/people'
import { markdownPlainText } from '../../utils/markdown-lite'
import { profilePath } from '../../utils/profile-url'
import { ProfileAvatar } from '../profile/profile-avatar'

/** A search result: avatar ringed in the person's identity colour, name, handle and the start of the bio. */
export function PersonCard({ person }: { person: Person }) {
  const seed = person.ethAddress ?? person.documentId
  const accent = identityAccent(seed)
  const name = profileDisplayName(person)
  const bio = person.bio ? markdownPlainText(person.bio, 140) : ''
  return (
    <Link
      href={profilePath(person)}
      className="group border-hairline bg-surface-1 shadow-card rounded-card hover:border-primary/40 relative flex h-full flex-col overflow-hidden border p-5 transition-[border-color,box-shadow] duration-300"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-center gap-4">
        <span className="shrink-0 rounded-full p-[2px]" style={{ background: accent }}>
          <ProfileAvatar
            documentId={person.documentId}
            avatar={person.avatar}
            userImage={person.userImage}
            seed={seed}
            alt=""
            className="ring-background h-14 w-14 ring-2"
          />
        </span>
        <div className="min-w-0">
          <h2 className="text-ink truncate text-[17px] leading-6 font-semibold group-hover:underline group-hover:underline-offset-4">
            {name}
          </h2>
          {person.handle && <p className="text-ink-muted truncate text-sm">@{person.handle}</p>}
        </div>
      </div>
      {bio && <p className="text-ink-muted mt-4 line-clamp-2 text-sm leading-6">{bio}</p>}
    </Link>
  )
}
