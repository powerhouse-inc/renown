import type { GetServerSideProps, NextPage } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { OrgCardView } from '../components/orgs/org-card'
import { useOrgDirectory } from '../components/orgs/use-org-directory'
import { PageMeta } from '../components/site/page-meta'
import { ButtonLink, buttonClasses, Container, Heading, Lead } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'
import { isOrgRateLimited, isOrgSearchable, ORG_QUERY_MAX, parseOrgQuery, searchOrganizations, type OrgSearchPage } from '../services/orgs'
import { peopleCacheControl } from '../utils/cache-control'
import { cx } from '../utils/cx'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../utils/with-timeout'

interface OrgsPageProps {
  /** The searched query ('' lists every listed organisation). */
  query: string
  /** A one-character query was given and ignored. */
  tooShort: boolean
  /** The first page; null when the directory could not be read. */
  page: OrgSearchPage | null
}

const DESCRIPTION =
  'Teams, companies and communities that publish apps on Renown. Only organisations that chose to be listed appear here.'
const EMPTY: OrgSearchPage = { items: [], next: null }

function countText(count: number, more: boolean): string {
  if (count === 1 && !more) return '1 organisation'
  return `${count}${more ? '+' : ''} organisations`
}

function Notice({ title, children, alert = false }: { title: string; children: ReactNode; alert?: boolean }) {
  return (
    <div role={alert ? 'alert' : undefined} className="border-hairline-strong rounded-panel flex flex-col items-center border border-dashed px-6 py-16 text-center">
      <h2 className="text-ink text-h3">{title}</h2>
      <div className="text-ink-muted mt-3 max-w-[46ch]">{children}</div>
    </div>
  )
}

function DirectoryList({ query, page }: { query: string; page: OrgSearchPage | null }) {
  const directory = useOrgDirectory(query, page ?? EMPTY)
  if (page === null) {
    return (
      <Notice title="The organisation directory is unavailable" alert>
        <p>Renown did not answer. Nothing is wrong with your search; try again in a moment.</p>
        <a href={query ? `/orgs?q=${encodeURIComponent(query)}` : '/orgs'} className={buttonClasses('primary', 'md', 'mt-6')}>
          Try again
        </a>
      </Notice>
    )
  }
  const status = query
    ? directory.items.length > 0
      ? `${countText(directory.items.length, directory.next !== null)} matching “${query}”`
      : ''
    : ''
  return (
    <>
      <p role="status" className={cx('text-ink-muted min-h-6 text-sm', !status && 'sr-only')}>
        {status}
      </p>
      <div className="mt-4">
        {directory.items.length === 0 ? (
          query ? (
            <Notice title={`No organisation matches “${query}”`}>
              <p>Search looks at the start of handles and names, and finds only organisations that chose to be listed.</p>
              <Link href="/orgs" className={buttonClasses('secondary', 'md', 'mt-6')}>
                Show all organisations
              </Link>
            </Notice>
          ) : (
            <Notice title="No organisations are listed yet">
              <p>Organisations appear here once their admins choose to list them.</p>
            </Notice>
          )
        ) : (
          <ul aria-label="Organisations" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {directory.items.map((org) => (
              <li key={org.id}>
                <OrgCardView org={org} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {directory.next && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <button type="button" aria-disabled={directory.more === 'loading'} onClick={directory.loadMore} className={buttonClasses('secondary', 'lg')}>
            {directory.more === 'loading' ? 'Loading…' : 'Load more organisations'}
          </button>
          {directory.more === 'error' && (
            <p role="alert" className="text-ink-muted text-sm">
              More organisations didn&apos;t load. Select the button to try again.
            </p>
          )}
        </div>
      )}
    </>
  )
}

const OrgsPage: NextPage<OrgsPageProps> = ({ query, tooShort, page }) => (
  <SiteLayout>
    <PageMeta title="Organisations" description={DESCRIPTION} path="/orgs" noindex={query !== ''} />
    <section aria-labelledby="orgs-title">
      <Container className="pt-14 pb-8 md:pt-20 md:pb-10">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Heading level={1} id="orgs-title">
              Organisations on Renown
            </Heading>
            <Lead>{DESCRIPTION}</Lead>
          </div>
          <ButtonLink href="/org/new" variant="secondary" className="self-start md:self-auto">
            Create an organisation
          </ButtonLink>
        </div>
        <form role="search" action="/orgs" method="get" className="mt-10 flex max-w-[640px] gap-3">
          <label htmlFor="orgs-q" className="sr-only">
            Search organisations by name or handle
          </label>
          <input
            id="orgs-q"
            type="search"
            name="q"
            defaultValue={query}
            maxLength={ORG_QUERY_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder="Name or handle"
            className="border-hairline-strong bg-surface-1 text-ink placeholder:text-ink-muted focus:border-primary/60 rounded-card h-12 min-w-0 flex-1 border px-4 text-[17px] outline-none"
          />
          <button type="submit" className={buttonClasses('primary', 'lg', 'shrink-0')}>
            Search
          </button>
        </form>
        <p className="text-ink-muted mt-2 min-h-5 text-sm">{tooShort ? 'Type at least 2 characters.' : ''}</p>
      </Container>
    </section>
    <Container className="pb-24 md:pb-32">
      <DirectoryList key={query} query={query} page={page} />
    </Container>
  </SiteLayout>
)

export const getServerSideProps: GetServerSideProps<OrgsPageProps> = async ({ query, req, res }) => {
  const raw = parseOrgQuery(query['q'])
  const tooShort = !isOrgSearchable(raw)
  const q = tooShort ? '' : raw
  let rateLimited = false
  const page = await withTimeout(searchOrganizations(q, null, req), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
    console.error('Organisation directory unavailable:', error instanceof Error ? error.message : error)
    rateLimited = isOrgRateLimited(error)
    return null
  })
  if (rateLimited) {
    // RATE_LIMITED is an outage, never an empty cacheable listing (D23).
    res.statusCode = 503
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Retry-After', '30')
    return { props: { query: q, tooShort, page: null } }
  }
  // A result page is never stored (an organisation may unlist itself at any moment); the bare listing is cached like /apps.
  res.setHeader('Cache-Control', peopleCacheControl(q, page !== null))
  return { props: { query: q, tooShort, page } }
}

export default OrgsPage
