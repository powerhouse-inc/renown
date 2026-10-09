import type { RenownAppProfile } from '../../services/app-profiles'
import { AppTile } from '../app/app-tile'
import { ButtonLink, Heading, Lead, Section } from '../site/primitives'

/** Fewer than this many apps hides the section. */
export const FEATURED_APPS_MIN = 3

export function FeaturedApps({ apps }: { apps: RenownAppProfile[] }) {
  if (apps.length < FEATURED_APPS_MIN) return null
  return (
    <Section labelledBy="featured-apps-title">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="max-w-[640px]">
          <Heading level={2} id="featured-apps-title">
            Apps that sign you in with Renown
          </Heading>
          <Lead>Each one has a public Renown identity you can inspect before you approve it.</Lead>
        </div>
        <ButtonLink href="/apps" variant="secondary" className="self-start md:self-auto">
          Browse all apps
        </ButtonLink>
      </div>
      <ul
        tabIndex={0}
        aria-label="Featured apps"
        className="-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 md:mt-12 md:grid md:snap-none md:grid-cols-2 md:gap-5 md:overflow-visible md:pb-0 lg:grid-cols-3"
      >
        {apps.slice(0, 6).map((app) => (
          <li key={app.appDid} className="w-[80%] shrink-0 snap-start sm:w-[46%] md:w-auto">
            <AppTile app={app} />
          </li>
        ))}
      </ul>
    </Section>
  )
}
