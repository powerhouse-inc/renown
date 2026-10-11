import type { GetServerSideProps, NextPage } from 'next'
import { useEffect } from 'react'
import { NobodyMatches, PeopleIntro, PeopleOutage } from '../components/people/people-notices'
import { PersonCard } from '../components/people/person-card'
import { usePeopleSearch } from '../components/people/use-people-search'
import { PageMeta } from '../components/site/page-meta'
import { buttonClasses, Container, Heading, Lead } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'
import { isSearchable, parsePeopleQuery, PEOPLE_QUERY_MAX, searchPeople, type PeoplePage } from '../services/people'
import { peopleCacheControl } from '../utils/cache-control'
import { cx } from '../utils/cx'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../utils/with-timeout'

interface PeoplePageProps {
  /** The searched query ('' without one). */
  query: string
  /** Its first page; null without a query or when the search failed. */
  page: PeoplePage | null
}

const DESCRIPTION = 'Find people on Renown by name or handle. Only people who chose to be listed appear here.'

function countText(count: number, more: boolean): string {
  if (count === 1 && !more) return '1 person'
  return `${count}${more ? '+' : ''} people`
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

const PeoplePage: NextPage<PeoplePageProps> = ({ query: initialQuery, page }) => {
  const search = usePeopleSearch({ query: initialQuery, page })
  const { focusId } = search
  // After Load more, keyboard focus continues from the first new person.
  useEffect(() => {
    if (!focusId) return
    document.querySelector<HTMLElement>(`[data-person-id="${CSS.escape(focusId)}"]`)?.focus()
  }, [focusId])
  const busy = search.status === 'loading'
  const status =
    search.status === 'loading'
      ? 'Searching…'
      : search.status === 'results'
        ? `${countText(search.items.length, search.hasMore)} matching “${search.query}”`
        : search.status === 'empty'
          ? `Nobody matches “${search.query}”`
          : ''

  return (
    <SiteLayout>
      <PageMeta title="People" description={DESCRIPTION} path="/people" noindex={initialQuery !== ''} />
      <section aria-labelledby="people-title">
        <Container className="pt-14 pb-8 md:pt-20 md:pb-10">
          <Heading level={1} id="people-title">
            People on Renown
          </Heading>
          <Lead>{DESCRIPTION}</Lead>
          <form
            role="search"
            className="mt-10 max-w-[640px]"
            onSubmit={(event) => {
              event.preventDefault()
              search.submit()
            }}
          >
            <label htmlFor="people-q" className="sr-only">
              Search people by name or handle
            </label>
            <div className="border-hairline-strong bg-surface-1 shadow-card focus-within:border-primary/60 rounded-card flex items-center gap-3 border px-4 transition-colors">
              <span className="text-ink-muted">
                <SearchIcon />
              </span>
              <input
                id="people-q"
                type="search"
                name="q"
                value={search.text}
                onChange={(event) => search.setText(Array.from(event.target.value).slice(0, PEOPLE_QUERY_MAX).join(''))}
                autoComplete="off"
                spellCheck={false}
                placeholder="Name or handle"
                className="text-ink placeholder:text-ink-muted h-14 min-w-0 flex-1 bg-transparent text-[17px] outline-none"
              />
            </div>
            <p className="text-ink-muted mt-2 min-h-5 text-sm">
              {Array.from(search.text.trim()).length === 1 ? 'Type at least 2 characters.' : ''}
            </p>
          </form>
        </Container>
      </section>

      <Container className="pb-24 md:pb-32">
        <p role="status" className={cx('text-ink-muted min-h-6 text-sm', !status && 'sr-only')}>
          {status}
        </p>
        <div className="mt-4">
          {search.status === 'idle' ? (
            <PeopleIntro />
          ) : search.status === 'error' ? (
            <PeopleOutage onRetry={search.retry} />
          ) : search.status === 'empty' ? (
            <NobodyMatches query={search.query} />
          ) : search.items.length === 0 ? null : (
            <ul
              aria-busy={busy}
              aria-label="People"
              className={cx(
                'grid grid-cols-1 gap-5 motion-safe:transition-opacity motion-safe:duration-300 sm:grid-cols-2 lg:grid-cols-3',
                busy && 'pointer-events-none opacity-50',
              )}
            >
              {search.items.map((person) => (
                <li key={person.documentId}>
                  <PersonCard person={person} />
                </li>
              ))}
            </ul>
          )}
        </div>
        {search.status === 'results' && search.hasMore && (
          <div className="mt-12 flex flex-col items-center gap-3">
            <button type="button" aria-disabled={search.more === 'loading'} onClick={search.loadMore} className={buttonClasses('secondary', 'lg')}>
              {search.more === 'loading' ? 'Loading…' : 'Load more people'}
            </button>
            {search.more === 'error' && (
              <p role="alert" className="text-ink-muted text-sm">
                More people didn&apos;t load. Select the button to try again.
              </p>
            )}
          </div>
        )}
      </Container>
    </SiteLayout>
  )
}

export const getServerSideProps: GetServerSideProps<PeoplePageProps> = async ({ query, res }) => {
  const q = parsePeopleQuery(query['q'])
  if (!isSearchable(q)) {
    res.setHeader('Cache-Control', peopleCacheControl('', true))
    return { props: { query: '', page: null } }
  }
  const page = await withTimeout(searchPeople(q), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
    console.error('People search unavailable:', error)
    return null
  })
  res.setHeader('Cache-Control', peopleCacheControl(q, page !== null))
  return { props: { query: q, page } }
}

export default PeoplePage
