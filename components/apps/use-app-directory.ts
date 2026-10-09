import { useCallback, useEffect, useRef, useState } from 'react'
import { listAppProfiles, type AppProfilePage, type RenownAppProfile } from '../../services/app-profiles'
import { APPS_PAGE_SIZE, appendApps, sameCategory } from '../../utils/app-directory'

export interface AppDirectoryState {
  /** The category `items` belong to (null = all apps). */
  category: string | null
  items: RenownAppProfile[]
  next: string | null
  /** The list itself: shown, being replaced, or unavailable. */
  status: 'ready' | 'loading' | 'error'
  /** The "Load more" request. */
  more: 'idle' | 'loading' | 'error'
}

export interface AppDirectory {
  state: AppDirectoryState
  loadMore: () => void
  retry: () => void
}

/** The last answer for a category's list. */
interface Loaded {
  category: string | null
  items: RenownAppProfile[]
  next: string | null
  failed: boolean
  more: AppDirectoryState['more']
}

function fromPage(category: string | null, page: AppProfilePage | null): Loaded {
  return page
    ? { category, items: page.items, next: page.next, failed: false, more: 'idle' }
    : { category, items: [], next: null, failed: true, more: 'idle' }
}

/**
 * The directory list for the category in the URL. Starts from the server's
 * first page; when the category changes (chip, back/forward) it fetches that
 * category's first page, keeping the current cards on screen until it arrives.
 * Answers to superseded requests are dropped.
 */
export function useAppDirectory(
  initial: { category: string | null; page: AppProfilePage | null },
  category: string | null,
): AppDirectory {
  const [loaded, setLoaded] = useState<Loaded>(() => fromPage(initial.category, initial.page))
  const [retrying, setRetrying] = useState(false)
  const request = useRef(0)

  const fetchFirst = useCallback((target: string | null) => {
    const id = ++request.current
    listAppProfiles({ limit: APPS_PAGE_SIZE, category: target })
      .then((page) => {
        if (id === request.current) setLoaded(fromPage(target, page))
      })
      .catch((error: unknown) => {
        console.warn('Apps directory unavailable:', error)
        if (id === request.current) setLoaded(fromPage(target, null))
      })
      .finally(() => {
        if (id === request.current) setRetrying(false)
      })
  }, [])

  useEffect(() => {
    if (!sameCategory(category, loaded.category)) fetchFirst(category)
    // Back on the category already shown: an answer still in flight for another one is stale.
    else request.current++
  }, [category, loaded.category, fetchFirst])

  const busy = retrying || !sameCategory(category, loaded.category)

  const loadMore = useCallback(() => {
    if (!loaded.next || loaded.more === 'loading' || busy) return
    const id = request.current
    const { category: target, next } = loaded
    setLoaded((l) => ({ ...l, more: 'loading' }))
    listAppProfiles({ limit: APPS_PAGE_SIZE, after: next, category: target })
      .then((page) => {
        if (id !== request.current) return
        setLoaded((l) => ({ ...l, items: appendApps(l.items, page.items), next: page.next, more: 'idle' }))
      })
      .catch((error: unknown) => {
        console.warn('Apps directory: next page unavailable:', error)
        if (id === request.current) setLoaded((l) => ({ ...l, more: 'error' }))
      })
  }, [loaded, busy])

  const retry = useCallback(() => {
    setRetrying(true)
    fetchFirst(loaded.category)
  }, [fetchFirst, loaded.category])

  return {
    state: {
      category: loaded.category,
      items: loaded.items,
      next: loaded.next,
      status: busy ? 'loading' : loaded.failed ? 'error' : 'ready',
      more: loaded.more,
    },
    loadMore,
    retry,
  }
}
