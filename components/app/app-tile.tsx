import Link from 'next/link'
import type { RenownAppProfile } from '../../services/app-profiles'
import { Badge } from '../site/primitives'
import { AppCover } from './app-cover'
import { AppLogo } from './app-logo'

export interface AppTileProps {
  app: RenownAppProfile
  /** Heading level of the app name inside its list (default 3). */
  headingLevel?: 2 | 3
}

/** A directory card for one app: cover, logo, name, tagline and category, linking to /app/[did]. */
export function AppTile({ app, headingLevel = 3 }: AppTileProps) {
  const name = app.name || 'Untitled app'
  const Title = `h${headingLevel}` as const
  return (
    <Link
      href={`/app/${app.appDid}`}
      className="group border-hairline bg-surface-1 shadow-card rounded-card hover:border-primary/40 hover:shadow-glow relative flex h-full flex-col overflow-hidden border transition-[border-color,box-shadow,transform] duration-300 ease-out-expo hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
    >
      <div className="relative overflow-hidden">
        <div className="transition-transform duration-700 ease-out-expo group-hover:scale-[1.03] motion-reduce:group-hover:scale-100">
          <AppCover documentId={app.documentId} coverRef={app.coverRef} seed={app.appDid} />
        </div>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="bg-surface-1 ring-surface-1 relative z-10 -mt-7 w-fit rounded-2xl ring-4">
          <AppLogo
            documentId={app.documentId}
            logoRef={app.logoRef}
            legacyLogo={app.logo}
            name={name}
            className="h-14 w-14 text-xl"
          />
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <Title className="text-ink text-h3 min-w-0 truncate">{name}</Title>
          {app.category && <Badge tone="primary" className="mt-0.5 shrink-0">{app.category}</Badge>}
        </div>
        {app.tagline && <p className="text-ink-muted mt-1.5 line-clamp-2 text-sm leading-6">{app.tagline}</p>}
      </div>
    </Link>
  )
}
