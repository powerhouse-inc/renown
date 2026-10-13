import { useCallback, useState } from 'react'
import { searchOrganizations, type OrgCard, type OrgSearchPage } from '../../services/orgs'
import { CLIENT_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'

/** `items` followed by the organisations of `more` it does not already hold. */
export function appendOrgs(items: OrgCard[], more: OrgCard[]): OrgCard[] {
  const seen = new Set(items.map((org) => org.id))
  return [...items, ...more.filter((org) => !seen.has(org.id))]
}

/** The directory list for one query (the page keys it by query): the server's first page, then "Load more". */
export function useOrgDirectory(query: string, initial: OrgSearchPage) {
  const [items, setItems] = useState(initial.items)
  const [next, setNext] = useState(initial.next)
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle')

  const loadMore = useCallback(() => {
    if (!next || more === 'loading') return
    setMore('loading')
    withTimeout(searchOrganizations(query, next), CLIENT_DATA_TIMEOUT_MS).then(
      (page) => {
        setItems((current) => appendOrgs(current, page.items))
        setNext(page.next)
        setMore('idle')
      },
      (error: unknown) => {
        console.warn('Organisation directory: next page unavailable:', error instanceof Error ? error.name : 'error')
        setMore('error')
      },
    )
  }, [query, next, more])

  return { items, next, more, loadMore }
}
