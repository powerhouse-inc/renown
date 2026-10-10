import Link from 'next/link'
import type { RenownAppProfile } from '../../services/app-profiles'
import type { RenownProfileLink } from '../../services/switchboard'
import type { AppStatGroup } from '../../utils/stat-format'
import { AppLogo } from '../app/app-logo'
import { AppTile } from '../app/app-tile'
import { MarkdownLite } from '../app/markdown-lite'
import { LinkChips } from '../identity/link-chip'
import { MetricCard } from '../identity/metric-card'
import { PageSection } from '../identity/page-section'

/** Bio (markdown subset, safe links only) and links (http(s) only, filtered by the page); nothing when there is neither. */
export function ProfileAbout({ bio, links }: { bio: string | null; links: RenownProfileLink[] }) {
  const text = bio?.trim()
  if (!text && links.length === 0) return null
  return (
    <PageSection id="profile-about" title="About">
      {text && <MarkdownLite text={text} headingBase={3} className="max-w-[68ch] text-[1.0625rem] leading-7" />}
      {links.length > 0 && (
        <div className={text ? 'mt-5' : undefined}>
          <LinkChips links={links} />
        </div>
      )}
    </PageSection>
  )
}

/** The apps this wallet publishes, as directory tiles. */
export function ProfileApps({ apps }: { apps: RenownAppProfile[] }) {
  if (apps.length === 0) return null
  return (
    <PageSection id="apps-published" title="Apps published">
      <ul className="grid gap-5 sm:grid-cols-2">
        {apps.map((app) => (
          <li key={app.appDid}>
            <AppTile app={app} />
          </li>
        ))}
      </ul>
    </PageSection>
  )
}

/** Public stats across apps, one group per app in the app's own words. */
export function ProfileActivity({ groups }: { groups: AppStatGroup[] }) {
  if (groups.length === 0) return null
  return (
    <PageSection id="profile-activity" title="Activity">
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.appDid} data-app-did={group.appDid}>
            <Link href={`/app/${group.appDid}`} className="group inline-flex max-w-full min-w-0 items-center gap-3">
              <AppLogo
                documentId={group.appDocumentId}
                logoRef={group.appHasLogo ? group.appLogoRef : null}
                legacyLogo={group.appLogo}
                name={group.appName}
                className="h-8 w-8 rounded-[10px] text-sm shadow-none"
              />
              <span className="text-ink truncate font-semibold group-hover:underline">{group.appName}</span>
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {group.entries.map((entry) => (
                <MetricCard key={entry.metric} metricKey={entry.metric} value={entry.value} unit={entry.unit} label={entry.label ?? entry.metric} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageSection>
  )
}

/** Shown instead of an empty column when a profile has no bio, links, apps or activity yet. */
export function ProfileEmpty({ name }: { name: string }) {
  return (
    <div className="border-hairline rounded-card border border-dashed px-6 py-10 text-center">
      <p className="text-ink font-semibold">Nothing public yet</p>
      <p className="text-ink-muted mx-auto mt-2 max-w-[44ch] text-sm leading-6">
        A bio, links, published apps and activity appear here once {name} adds them or starts using apps on Renown.
      </p>
    </div>
  )
}
