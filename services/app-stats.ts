// App stats from renown-stats (<switchboard>/graphql/renown-stats). Public
// reads; failures are logged and read as "no stats", like getAppProfile.
import { GraphQLClient } from 'graphql-request'
import { switchboardOrigin } from './media'

export type MetricAggregation = 'SUM' | 'MAX' | 'AVG' | 'COUNT_USERS'

export interface MetricContributor {
  userDid: string
  value: number
  /** The wallet behind a did:pkh user; null for did:key users. */
  address: string | null
  handle: string | null
  displayName: string | null
  /** Renown profile document (avatar at /media/<documentId>/avatar when hasAvatar). */
  documentId: string | null
  hasAvatar: boolean
  userImage: string | null
}

export interface AppMetricStat {
  key: string
  label: string
  unit: string | null
  description: string | null
  aggregation: MetricAggregation
  value: number
  users: number
  top: MetricContributor[]
}

export interface AppStats {
  appDid: string
  activeUsers30d: number
  totalUsers: number
  metrics: AppMetricStat[]
  updatedAt: string | null
}

export interface UserStatEntry {
  appDid: string
  metric: string
  value: number
  updatedAt: string
  appName: string | null
  appDocumentId: string | null
  appHasLogo: boolean
  appLogo: string | null
  /** Set when the app declares the metric public. */
  label: string | null
  unit: string | null
}

const STATS_FIELDS = `appDid activeUsers30d totalUsers updatedAt metrics { key label unit description aggregation value users top { userDid value address handle displayName documentId hasAvatar userImage } }`
const USER_STAT_FIELDS = `appDid metric value updatedAt appName appDocumentId appHasLogo appLogo label unit`

function client(): GraphQLClient {
  return new GraphQLClient(`${switchboardOrigin()}/graphql/renown-stats`)
}

export async function getAppStats(appDid: string): Promise<AppStats | null> {
  try {
    const data = await client().request<{ appStats?: AppStats | null }>(
      `query AppStats($appDid: String!) { appStats(appDid: $appDid) { ${STATS_FIELDS} } }`,
      { appDid },
    )
    return data.appStats ?? null
  } catch (error) {
    console.error('Failed to fetch app stats:', error)
    return null
  }
}

/** A wallet's stats across apps (Renown folds every chain of a did:pkh into one). */
export async function getUserStats(address: string): Promise<UserStatEntry[]> {
  try {
    const data = await client().request<{ userStats?: UserStatEntry[] }>(
      `query UserStats($userDid: String!) { userStats(userDid: $userDid) { ${USER_STAT_FIELDS} } }`,
      { userDid: `did:pkh:eip155:1:${address.toLowerCase()}` },
    )
    return data.userStats ?? []
  } catch (error) {
    console.error('Failed to fetch user stats:', error)
    return []
  }
}
