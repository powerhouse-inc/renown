import type { GetServerSideProps, NextPage } from 'next'
import { useRouter } from 'next/router'
import { AppTile } from '../components/app/app-tile'
import { OrgFilterChip } from '../components/apps/org-filter-chip'
import { CategoryChips } from '../components/apps/category-chips'
import { DirectoryOutage, EmptyDirectory } from '../components/apps/directory-notice'
import { useAppDirectory } from '../components/apps/use-app-directory'
import { PageMeta } from '../components/site/page-meta'
import { buttonClasses, Container, Heading, Lead } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'
import {
  listAppCategories,
  listAppProfiles,
  type AppProfileCategory,
  type AppProfilePage,
} from '../services/app-profiles'
import { coverImageUrl } from '../services/media'
import { fetchOrganization } from '../services/orgs'
import { APPS_PAGE_SIZE, parseCategory, parseOrgParam, sameCategory } from '../utils/app-directory'
import { listingCacheControl } from '../utils/cache-control'
import { cx } from '../utils/cx'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../utils/with-timeout'

interface AppsPageProps {
  /** The category the server rendered (null = all apps). */
  category: string | null
  /** First page for that category; null when the directory could not be read. */
  page: AppProfilePage | null
  /** Category chips; empty when there are none or they could not be read. */
  categories: AppProfileCategory[]
  /** The ?org= filter: its handle, and the organisation's id and name (null when no organisation has the handle). */
  org: { handle: string; id: string | null; name: string | null } | null
}

const DESCRIPTION =
  'Browse the apps that sign you in with Renown. Every one has a public Renown identity you can inspect before you approve it.'

function countLine(categories: AppProfileCategory[], selected: string | null): string | null {
  if (!selected) return null
  const match = categories.find((c) => sameCategory(c.category, selected))
  if (!match) return null
  return `${match.count === 1 ? '1 app' : `${match.count} apps`} in ${match.category}`
}

/** Placeholder cards while a category loads with nothing on screen yet (keeps the frame steady). */
function TileSkeletons() {
  return (
    <ul aria-hidden="true" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((key) => (
        <li key={key} className="border-hairline bg-surface-1 rounded-card overflow-hidden border">
          <div className="bg-surface-2 aspect-[3/1] motion-safe:animate-pulse" />
          <div className="space-y-3 px-5 pt-10 pb-6">
            <div className="bg-surface-2 h-5 w-2/3 rounded motion-safe:animate-pulse" />
            <div className="bg-surface-2 h-4 w-full rounded motion-safe:animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Tiles in the first row at desktop (and the first card on mobile): the LCP candidates, loaded eagerly. */
const EAGER_TILES = 3

const AppsPage: NextPage<AppsPageProps> = ({ category: initialCategory, page, categories, org }) => {
  const router = useRouter()
  const category = parseCategory(router.query['category'])
  const { state, loadMore, retry } = useAppDirectory({ category: initialCategory, page }, category, org?.id ?? null)
  const busy = state.status === 'loading'
  const summary = countLine(categories, state.category)

  return (
    <SiteLayout>
      <PageMeta title="Apps" description={DESCRIPTION} path="/apps" noindex={org !== null} preloadImage={coverImageUrl(page?.items[0])} />
      <section aria-labelledby="apps-title">
        <Container className="pt-14 pb-10 md:pt-20 md:pb-12">
          <Heading level={1} id="apps-title">
            Apps on Renown
          </Heading>
          <Lead>{DESCRIPTION}</Lead>
        </Container>
      </section>

      <Container className="pb-24 md:pb-32">
        {org ? <OrgFilterChip handle={org.handle} name={org.name} /> : <CategoryChips categories={categories} selected={category} />}
        <p role="status" className={cx('text-ink-muted mt-3 min-h-6 text-sm', !summary && 'sr-only')}>
          {busy ? 'Loading apps…' : (summary ?? '')}
        </p>

        <div className="mt-6">
          {state.status === 'error' ? (
            <DirectoryOutage onRetry={retry} />
          ) : state.items.length === 0 && busy ? (
            <TileSkeletons />
          ) : org && !org.id ? (
            <p role="status" className="text-ink-muted border-hairline-strong rounded-panel border border-dashed px-6 py-16 text-center">
              No organisation has the handle @{org.handle}.
            </p>
          ) : state.items.length === 0 ? (
            <EmptyDirectory filtered={state.category !== null || org !== null} />
          ) : (
            <ul
              aria-busy={busy}
              aria-label={state.category ? `${categories.find((c) => sameCategory(c.category, state.category))?.category ?? state.category} apps` : 'All apps'}
              className={cx(
                'grid gap-5 motion-safe:transition-opacity motion-safe:duration-300 sm:grid-cols-2 lg:grid-cols-3',
                busy && 'pointer-events-none opacity-50',
              )}
            >
              {state.items.map((app, index) => (
                <li key={app.appDid}>
                  <AppTile app={app} headingLevel={2} priority={index < EAGER_TILES} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {state.status === 'ready' && state.next && (
          <div className="mt-12 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={loadMore}
              disabled={state.more === 'loading'}
              className={buttonClasses('secondary', 'lg')}
            >
              {state.more === 'loading' ? 'Loading…' : 'Load more apps'}
            </button>
            {state.more === 'error' && (
              <p role="alert" className="text-ink-muted text-sm">
                More apps didn&apos;t load. Select the button to try again.
              </p>
            )}
          </div>
        )}
      </Container>
    </SiteLayout>
  )
}

export const getServerSideProps: GetServerSideProps<AppsPageProps> = async ({ query, req, res }) => {
  const category = parseCategory(query['category'])
  const orgHandle = parseOrgParam(query['org'])
  let org: AppsPageProps['org'] = null
  let orgFailed = false
  if (orgHandle) {
    // D23: the incoming request carries the visitor's address; a RATE_LIMITED answer is an outage, not "no such organisation".
    const found = await withTimeout(fetchOrganization({ handle: orgHandle }, null, req), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
      console.error('Apps directory: organisation unavailable:', error instanceof Error ? error.message : error)
      orgFailed = true
      return null
    })
    org = { handle: orgHandle, id: found?.id ?? null, name: found?.name ?? null }
  }
  const pageRead: Promise<AppProfilePage> = !orgHandle
    ? listAppProfiles({ limit: APPS_PAGE_SIZE, category })
    : org?.id
      ? listAppProfiles({ limit: APPS_PAGE_SIZE, category, orgId: org.id })
      : orgFailed
        ? Promise.reject(new Error('organisation unavailable'))
        : Promise.resolve({ items: [], next: null })
  let categoriesFailed = false
  const [page, categories] = await Promise.all([
    withTimeout(pageRead, SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
      console.error('Apps directory unavailable:', error)
      return null
    }),
    withTimeout(listAppCategories(), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
      console.error('Apps directory: categories unavailable:', error)
      categoriesFailed = true
      return []
    }),
  ])
  if (orgFailed) {
    res.statusCode = 503
    res.setHeader('Retry-After', '30')
  }
  // An outage (or a page missing its chips) must not be cached at the edge: the next visitor retries.
  res.setHeader('Cache-Control', listingCacheControl(page !== null && !categoriesFailed && !orgFailed))
  return { props: { category, page, categories, org } }
}

export default AppsPage
