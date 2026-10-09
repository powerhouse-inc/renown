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

export async function getAppProfile(appDid: string): Promise<RenownAppProfile | null> {
  try {
    const data = await client().request<{ appProfile?: RenownAppProfile | null }>(
      `query AppProfile($appDid: String!) { appProfile(appDid: $appDid) { ${FIELDS} } }`,
      { appDid },
    )
    return data.appProfile ?? null
  } catch (error) {
    console.error('Failed to fetch app profile:', error)
    return null
  }
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
