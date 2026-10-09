// Revoking one approval: the Renown bearer first, then the wallet's
// personal_sign of revokeMessage() when there is no bearer or the switchboard
// does not accept it. Pure orchestration; the transport is injected.
import { revokeMessage } from '../../services/renown-signed-messages'

/** How a revoke request proves the issuer address. */
export type RevokeAuth = { bearer: string } | { signature: string; timestamp: string }

export type RevokeFailure = 'FORBIDDEN' | 'NOT_FOUND' | 'NETWORK' | 'DECLINED' | 'NO_WALLET' | 'UNKNOWN'

export class RevokeError extends Error {
  constructor(
    readonly reason: RevokeFailure,
    message: string = reason,
  ) {
    super(message)
    this.name = 'RevokeError'
  }
}

export interface RevokeDeps {
  /** The Renown bearer for the signed-in address; null when there is none. */
  getBearer: () => Promise<string | null>
  /** personal_sign with the wallet of the signed-in address; null without one. */
  signMessage: ((message: string) => Promise<string>) | null
  /** Sends renown_revokeCredential; throws RevokeError. */
  send: (credentialId: string, auth: RevokeAuth) => Promise<void>
  now?: () => Date
}

/** Revokes `credentialId`; resolves with the proof that worked, rejects with RevokeError. */
export async function revokeConnection(credentialId: string, deps: RevokeDeps): Promise<'bearer' | 'signature'> {
  const bearer = await deps.getBearer().catch(() => null)
  if (bearer) {
    try {
      await deps.send(credentialId, { bearer })
      return 'bearer'
    } catch (error) {
      // Only an authorisation refusal is worth a second try with a signature.
      if (!(error instanceof RevokeError) || error.reason !== 'FORBIDDEN') throw error
    }
  }
  if (!deps.signMessage) throw new RevokeError('NO_WALLET')
  const timestamp = (deps.now ?? (() => new Date()))().toISOString()
  let signature: string
  try {
    signature = await deps.signMessage(revokeMessage(credentialId, timestamp))
  } catch {
    throw new RevokeError('DECLINED')
  }
  await deps.send(credentialId, { signature, timestamp })
  return 'signature'
}

/** What went wrong, in plain words, for the error toast. */
export function revokeFailureText(reason: RevokeFailure): string {
  switch (reason) {
    case 'FORBIDDEN':
      return 'Renown could not confirm the approval is yours. Sign in with the wallet that gave it and try again.'
    case 'NOT_FOUND':
      return 'Renown has no record of this approval any more.'
    case 'NETWORK':
      return 'Renown did not respond. Check your connection and try again.'
    case 'DECLINED':
      return 'You declined the signature, so nothing was revoked.'
    case 'NO_WALLET':
      return 'Connect the wallet that gave this approval, then try again.'
    default:
      return 'Something went wrong on our side. Try again in a moment.'
  }
}
