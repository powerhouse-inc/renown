import type { GetServerSideProps, NextPage } from 'next'
import { useRouter } from 'next/router'
import { AppTile } from '../components/app/app-tile'
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
import { APPS_PAGE_SIZE, parseCategory, sameCategory } from '../utils/app-directory'
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

const AppsPage: NextPage<AppsPageProps> = ({ category: initialCategory, page, categories }) => {
  const router = useRouter()
  const category = parseCategory(router.query['category'])
  const { state, loadMore, retry } = useAppDirectory({ category: initialCategory, page }, category)
  const busy = state.status === 'loading'
  const summary = countLine(categories, state.category)

  return (
    <SiteLayout>
      <PageMeta title="Apps" description={DESCRIPTION} path="/apps" />
      <section aria-labelledby="apps-title">
        <Container className="pt-14 pb-10 md:pt-20 md:pb-12">
          <Heading level={1} id="apps-title">
            Apps on Renown
          </Heading>
          <Lead>{DESCRIPTION}</Lead>
        </Container>
      </section>

      <Container className="pb-24 md:pb-32">
        <CategoryChips categories={categories} selected={category} />
        <p role="status" className={cx('text-ink-muted mt-3 min-h-6 text-sm', !summary && 'sr-only')}>
          {busy ? 'Loading apps…' : (summary ?? '')}
        </p>

        <div className="mt-6">
          {state.status === 'error' ? (
            <DirectoryOutage onRetry={retry} />
          ) : state.items.length === 0 && busy ? (
            <TileSkeletons />
          ) : state.items.length === 0 ? (
            <EmptyDirectory filtered={state.category !== null} />
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

export const getServerSideProps: GetServerSideProps<AppsPageProps> = async ({ query, res }) => {
  const category = parseCategory(query['category'])
  let categoriesFailed = false
  const [page, categories] = await Promise.all([
    withTimeout(listAppProfiles({ limit: APPS_PAGE_SIZE, category }), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
      console.error('Apps directory unavailable:', error)
      return null
    }),
    withTimeout(listAppCategories(), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
      console.error('Apps directory: categories unavailable:', error)
      categoriesFailed = true
      return []
    }),
  ])
  // An outage (or a page missing its chips) must not be cached at the edge: the next visitor retries.
  res.setHeader('Cache-Control', listingCacheControl(page !== null && !categoriesFailed))
  return { props: { category, page, categories } }
}

export default AppsPage
