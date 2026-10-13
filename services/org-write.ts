// Server side of /api/org/<mutation>: forwards a signed renown-orgs mutation to
// the switchboard. The switchboard verifies the signature itself (it hashes the
// arguments it receives), so nothing here may add, drop or change an argument.
import { mutationDocument, type OrgMutationName } from './org-mutations'
import { orgsRequest } from './orgs'

export interface OrgAuth {
  address: string
  signature: string
  timestamp: string
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const SIGNATURE_RE = /^0x[0-9a-fA-F]+$/

/** The `auth` of a request body, or null when it is missing or malformed. */
export function parseOrgAuth(value: unknown): OrgAuth | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { address, signature, timestamp } = value as Record<string, unknown>
  if (typeof address !== 'string' || !ADDRESS_RE.test(address)) return null
  if (typeof signature !== 'string' || !SIGNATURE_RE.test(signature) || signature.length > 20_000) return null
  if (typeof timestamp !== 'string' || timestamp.length > 40) return null
  return { address, signature, timestamp }
}

/** Runs the mutation with `auth`; resolves with its result field. Throws OrgApiError. */
export async function forwardOrgMutation(name: OrgMutationName, args: Record<string, unknown>, auth: OrgAuth): Promise<unknown> {
  const data = await orgsRequest<Record<string, unknown>>(mutationDocument(name), { ...args, auth })
  return data[name]
}
