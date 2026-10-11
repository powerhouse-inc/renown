// People search (renownUserSearch on the switchboard's read model): only
// profiles whose owners opted in are ever returned. Public, no auth.
import { GraphQLClient } from 'graphql-request'
import { SWITCHBOARD_ENDPOINT } from './switchboard-endpoint'

export interface Person {
  documentId: string
  ethAddress: string | null
  handle: string | null
  displayName: string | null
  username: string | null
  bio: string | null
  avatar: string | null
  userImage: string | null
}

export interface PeoplePage {
  items: Person[]
  /** Cursor for the next page; null on the last one. */
  next: string | null
}

export const PEOPLE_PAGE_SIZE = 24
export const PEOPLE_QUERY_MIN = 2
export const PEOPLE_QUERY_MAX = 40

const SEARCH = `query People($q: String!, $after: String) {
  renownUserSearch(query: $q, limit: ${PEOPLE_PAGE_SIZE}, after: $after) {
    items { documentId ethAddress handle displayName username bio avatar userImage }
    next
  }
}`

/** The `q` query parameter as searched: the first value, trimmed, at most 40 characters (code points). */
export function parsePeopleQuery(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return Array.from((value ?? '').trim()).slice(0, PEOPLE_QUERY_MAX).join('').trim()
}

/** Long enough for the switchboard to search (2 characters, counted in code points). */
export function isSearchable(query: string): boolean {
  return Array.from(query).length >= PEOPLE_QUERY_MIN
}

/**
 * One page of listed people whose handle or display name starts with `query`.
 * A failed read throws; callers decide how to show it.
 */
export async function searchPeople(query: string, after: string | null = null): Promise<PeoplePage> {
  const data = await new GraphQLClient(SWITCHBOARD_ENDPOINT).request<{ renownUserSearch: PeoplePage }>(SEARCH, {
    q: query,
    after,
  })
  return data.renownUserSearch
}

/** `more` appended to `items`, skipping anyone already shown. */
export function appendPeople(items: Person[], more: Person[]): Person[] {
  const seen = new Set(items.map((p) => p.documentId))
  return [...items, ...more.filter((p) => !seen.has(p.documentId))]
}
