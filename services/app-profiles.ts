// App profiles from renown-stats (<switchboard>/graphql/renown-stats). Reads
// are public. Failures are logged and read as "no profile", like getProfile.
import { GraphQLClient } from 'graphql-request'
import { switchboardOrigin } from './media'

export interface RenownAppLink {
  id: string
  label: string
  url: string
}

export interface RenownAppProfile {
  appDid: string
  /** Its images are at /media/<documentId>/logo and /cover (when logoRef/coverRef are set). */
  documentId: string
  name: string | null
  tagline: string | null
  /** Legacy logo URL (https or raster data URL); prefer logoRef. */
  logo: string | null
  website: string | null
  publisherDid: string | null
  /** Markdown subset; render with <MarkdownLite>. */
  description: string | null
  category: string | null
  logoRef: string | null
  coverRef: string | null
  links: RenownAppLink[]
}

/** An app's Renown identity: did:key with a base58btc multibase key. */
export const APP_DID_RE = /^did:key:z[1-9A-HJ-NP-Za-km-z]{32,128}$/

const FIELDS = `appDid documentId name tagline logo website publisherDid description category logoRef coverRef links { id label url }`

function client(): GraphQLClient {
  return new GraphQLClient(`${switchboardOrigin()}/graphql/renown-stats`)
}

/** Like getAppProfile, but a failed read throws (null means the app does not exist). */
export async function fetchAppProfile(appDid: string): Promise<RenownAppProfile | null> {
  const data = await client().request<{ appProfile?: RenownAppProfile | null }>(
    `query AppProfile($appDid: String!) { appProfile(appDid: $appDid) { ${FIELDS} } }`,
    { appDid },
  )
  return data.appProfile ?? null
}

export async function getAppProfile(appDid: string): Promise<RenownAppProfile | null> {
  try {
    return await fetchAppProfile(appDid)
  } catch (error) {
    console.error('Failed to fetch app profile:', error)
    return null
  }
}

export interface AppProfilePage {
  items: RenownAppProfile[]
  /** Cursor for the next page; null on the last page. */
  next: string | null
}

/**
 * One page of every app profile, newest first (`limit` 1-50). A failed read
 * throws; callers decide whether that hides a section or shows an outage.
 */
export async function listAppProfiles({ limit, after }: { limit: number; after?: string | null }): Promise<AppProfilePage> {
  const data = await client().request<{ appProfiles: AppProfilePage }>(
    `query AppProfiles($limit: Int, $after: String) { appProfiles(limit: $limit, after: $after) { items { ${FIELDS} } next } }`,
    { limit, after: after ?? null },
  )
  return data.appProfiles
}

/** The app profiles a wallet publishes (oldest first). */
export async function getAppProfilesByPublisher(address: string): Promise<RenownAppProfile[]> {
  try {
    const data = await client().request<{ appProfilesByPublisher?: RenownAppProfile[] }>(
      `query AppProfilesByPublisher($publisherDid: String!) { appProfilesByPublisher(publisherDid: $publisherDid) { ${FIELDS} } }`,
      { publisherDid: address },
    )
    return data.appProfilesByPublisher ?? []
  } catch (error) {
    console.error('Failed to fetch published apps:', error)
    return []
  }
}
