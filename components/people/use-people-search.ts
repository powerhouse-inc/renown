import { useRouter } from 'next/router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { appendPeople, isSearchable, parsePeopleQuery, searchPeople, type PeoplePage, type Person } from '../../services/people'
import { CLIENT_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'

/** Typing pauses this long before a search is sent. */
export const SEARCH_DEBOUNCE_MS = 300

export type PeopleStatus = 'idle' | 'loading' | 'error' | 'empty' | 'results'

interface Loaded {
  /** The query `items` answer ('' before any search). */
  query: string
  items: Person[]
  next: string | null
  failed: boolean
  more: 'idle' | 'loading' | 'error'
  /** documentId of the first person added by the last Load more (focus target). */
  focusId: string | null
}

export interface PeopleSearch {
  /** What the search box shows. */
  text: string
  setText: (text: string) => void
  /** Searches now (Enter), skipping the debounce. */
  submit: () => void
  status: PeopleStatus
  /** The query the results on screen answer. */
  query: string
  items: Person[]
  hasMore: boolean
  more: Loaded['more']
  /** documentId to focus after Load more added people. */
  focusId: string | null
  loadMore: () => void
  retry: () => void
}

function fromPage(query: string, page: PeoplePage | null): Loaded {
  return page
    ? { query, items: page.items, next: page.next, failed: false, more: 'idle', focusId: null }
    : { query, items: [], next: null, failed: isSearchable(query), more: 'idle', focusId: null }
}

/**
 * The /people search box and its results. Starts from the server's answer for
 * ?q=, searches as the visitor types (debounced), keeps ?q= in the URL in sync
 * (replace, so typing does not fill the history) and follows back/forward.
 * Answers to superseded requests are dropped.
 */
export function usePeopleSearch(initial: { query: string; page: PeoplePage | null }): PeopleSearch {
  const router = useRouter()
  const [text, setText] = useState(initial.query)
  const [loaded, setLoaded] = useState<Loaded>(() => fromPage(initial.query, initial.page))
  const [pending, setPending] = useState(false)
  const request = useRef(0)
  const requested = useRef(initial.query)

  const run = useCallback(
    (query: string) => {
      requested.current = query
      const id = ++request.current
      const urlQuery = parsePeopleQuery(router.query['q'])
      if (urlQuery !== (isSearchable(query) ? query : '')) {
        void router.replace({ pathname: '/people', query: isSearchable(query) ? { q: query } : {} }, undefined, {
          shallow: true,
          scroll: false,
        })
      }
      if (!isSearchable(query)) {
        setPending(false)
        setLoaded(fromPage(query, { items: [], next: null }))
        return
      }
      setPending(true)
      withTimeout(searchPeople(query), CLIENT_DATA_TIMEOUT_MS)
        .then((page) => {
          if (id === request.current) setLoaded(fromPage(query, page))
        })
        .catch((error: unknown) => {
          console.warn('People search unavailable:', error)
          if (id === request.current) setLoaded(fromPage(query, null))
        })
        .finally(() => {
          if (id === request.current) setPending(false)
        })
    },
    [router],
  )

  // Typing: search once the visitor pauses.
  useEffect(() => {
    const query = parsePeopleQuery(text)
    if (query === requested.current) return
    const timer = setTimeout(() => run(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, run])

  // Back/forward to another ?q=: show and search that query.
  const urlQuery = parsePeopleQuery(router.query['q'])
  useEffect(() => {
    if (!router.isReady || urlQuery === requested.current) return
    if (urlQuery === '' && !isSearchable(requested.current)) return
    setText(urlQuery)
    run(urlQuery)
  }, [urlQuery, router.isReady, run])

  const submit = useCallback(() => run(parsePeopleQuery(text)), [run, text])

  const loadMore = useCallback(() => {
    if (!loaded.next || loaded.more === 'loading' || pending) return
    const id = request.current
    const { query, next } = loaded
    setLoaded((l) => ({ ...l, more: 'loading' }))
    withTimeout(searchPeople(query, next), CLIENT_DATA_TIMEOUT_MS)
      .then((page) => {
        if (id !== request.current) return
        setLoaded((l) => {
          const items = appendPeople(l.items, page.items)
          return { ...l, items, next: page.next, more: 'idle', focusId: items[l.items.length]?.documentId ?? l.items.at(-1)?.documentId ?? null }
        })
      })
      .catch((error: unknown) => {
        console.warn('People search: next page unavailable:', error)
        if (id === request.current) setLoaded((l) => ({ ...l, more: 'error' }))
      })
  }, [loaded, pending])

  const retry = useCallback(() => run(loaded.query), [run, loaded.query])

  const status: PeopleStatus = pending
    ? 'loading'
    : !isSearchable(loaded.query)
      ? 'idle'
      : loaded.failed
        ? 'error'
        : loaded.items.length === 0
          ? 'empty'
          : 'results'

  return {
    text,
    setText,
    submit,
    status,
    query: loaded.query,
    items: loaded.items,
    hasMore: !!loaded.next,
    more: loaded.more,
    focusId: loaded.focusId,
    loadMore,
    retry,
  }
}
