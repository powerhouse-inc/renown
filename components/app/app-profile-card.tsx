import Link from 'next/link'
import type { RenownAppProfile } from '../../services/app-profiles'
import { AppLogo } from './app-logo'

/** One app in a list: logo, name, tagline and category, linking to its page. */
export function AppProfileCard({ app }: { app: RenownAppProfile }) {
  const name = app.name || 'Untitled app'
  return (
    <Link
      href={`/app/${app.appDid}`}
      className="bg-secondary/60 hover:bg-secondary flex items-center gap-4 rounded-2xl p-4 text-left transition-colors"
    >
      <AppLogo documentId={app.documentId} logoRef={app.logoRef} legacyLogo={app.logo} name={name} className="h-12 w-12 text-lg ring-2" />
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate font-semibold">{name}</span>
        {app.tagline && <span className="text-muted-foreground block truncate text-sm">{app.tagline}</span>}
      </span>
      {app.category && (
        <span className="bg-primary/10 text-primary hidden shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline">
          {app.category}
        </span>
      )}
    </Link>
  )
}
