// Test-side helpers for driving e2e/support/stub-switchboard.mjs.

export const STUB_SWITCHBOARD_PORT = 4799
export const STUB_SWITCHBOARD_URL = `http://localhost:${STUB_SWITCHBOARD_PORT}`

export interface RecordedRequest {
  query: string
  variables: Record<string, unknown>
  headers: Record<string, string | undefined>
}

interface ScriptEntry {
  /** Substring the GraphQL query must contain. */
  match: string
  /** Optional substring the JSON-encoded variables must contain. */
  variables?: string
  status?: number
  response: unknown
}

export async function resetStub(): Promise<void> {
  await fetch(`${STUB_SWITCHBOARD_URL}/__stub/reset`, { method: 'POST' })
}

export async function scriptStub(entry: ScriptEntry): Promise<void> {
  await fetch(`${STUB_SWITCHBOARD_URL}/__stub/script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
}

/** Recorded requests whose query contains `match`. */
export async function stubRequests(match: string): Promise<RecordedRequest[]> {
  const res = await fetch(`${STUB_SWITCHBOARD_URL}/__stub/requests`)
  const all = (await res.json()) as RecordedRequest[]
  return all.filter((r) => r.query.includes(match))
}

/** A GraphQL error response as the switchboard sends it. */
export function graphqlError(message: string, code?: string): unknown {
  return { data: null, errors: [{ message, ...(code ? { extensions: { code } } : {}) }] }
}
