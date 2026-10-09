// Network-wide counts from renown-stats `renownNetworkStats` (public read,
// cached for 300 s by the backend).
import { GraphQLClient } from 'graphql-request'
import type { NetworkPulse } from '../components/home/types'
import { switchboardOrigin } from './media'

/** The current counts; null when the switchboard has none. A failed read throws. */
export async function fetchNetworkStats(): Promise<NetworkPulse | null> {
  const data = await new GraphQLClient(`${switchboardOrigin()}/graphql/renown-stats`).request<{
    renownNetworkStats?: NetworkPulse | null
  }>(`query RenownNetworkStats { renownNetworkStats { identities apps activeCredentials activeUsers30d updatedAt } }`)
  return data.renownNetworkStats ?? null
}
