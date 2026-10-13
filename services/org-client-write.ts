// Browser side of a signed organisation write: personal_sign over orgMessage()
// of exactly the arguments posted, then POST /api/org/<mutation>. Never throws.
import { isOrgErrorCode, orgErrorText, type OrgFailureCode } from '../lib/orgs/errors'
import type { OrgMutationName } from './org-mutations'
import { orgMessage } from './org-signed-messages'

export type OrgWriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: OrgFailureCode; field: string | null; message: string; unconfirmed?: true }

export interface OrgSigner {
  address: string
  signMessage: (message: string) => Promise<string>
}

function failure(code: OrgFailureCode, field: string | null = null, serverMessage?: string | null, unconfirmed = false): OrgWriteResult<never> {
  return { ok: false, code, field, message: orgErrorText(code, serverMessage), ...(unconfirmed ? { unconfirmed: true as const } : {}) }
}

export async function signedOrgWrite<T>(
  name: OrgMutationName,
  args: Record<string, unknown>,
  signer: OrgSigner | null,
  options: { now?: Date; fetchImpl?: typeof fetch; base?: string } = {},
): Promise<OrgWriteResult<T>> {
  if (!signer) return failure('NO_WALLET')
  // The bytes that are posted are the bytes that are signed: undefined drops out here, as in JSON.
  const sent = JSON.parse(JSON.stringify(args)) as Record<string, unknown>
  const timestamp = (options.now ?? new Date()).toISOString()
  const orgId = typeof sent.orgId === 'string' ? sent.orgId : null
  let signature: string
  try {
    signature = await signer.signMessage(await orgMessage(name, orgId, sent, timestamp))
  } catch {
    return failure('DECLINED')
  }
  let response: Response
  try {
    response = await (options.fetchImpl ?? fetch)(`${options.base ?? ''}/api/org/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: sent, auth: { address: signer.address, signature, timestamp } }),
    })
  } catch {
    // The request may have been applied although the answer was lost: writes are
    // not idempotent, so a create flow re-reads before it offers a retry.
    return failure('NETWORK', null, null, true)
  }
  const parsed: unknown = await response.json().catch(() => null)
  // An unparsable answer says nothing about whether the write was applied.
  if (typeof parsed !== 'object' || parsed === null) return failure('NETWORK', null, null, true)
  const body = parsed as { data?: T; code?: unknown; field?: unknown; error?: unknown }
  if (!response.ok) {
    const code = isOrgErrorCode(body.code) ? body.code : 'NETWORK'
    return failure(code, typeof body.field === 'string' ? body.field : null, typeof body.error === 'string' ? body.error : null, code === 'NETWORK')
  }
  return { ok: true, data: body.data as T }
}

export interface OrgWriter {
  write<T>(name: OrgMutationName, args: Record<string, unknown>): Promise<OrgWriteResult<T>>
}

/** A writer for one signer (null: every write answers NO_WALLET). */
export function orgWriter(signer: OrgSigner | null): OrgWriter {
  return { write: (name, args) => signedOrgWrite(name, args, signer) }
}

/** The signer of a signed-in session (useMeSession), or null when its wallet is not the session's. */
export function sessionSigner(session: { address: string; signMessage: ((message: string) => Promise<string>) | null }): OrgSigner | null {
  const { signMessage } = session
  return signMessage ? { address: session.address, signMessage } : null
}
