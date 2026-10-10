// Wallet errors with no dependencies, so UI code can test for them without
// importing the orchestrator (and with it the wallet stack).

/** Thrown when the wallet did not sign a revocation (the user declined, or signing failed). */
export class RevokeSignatureRejectedError extends Error {
  constructor(cause?: unknown) {
    super('The revocation was not signed, so the credential is still active.', { cause })
    this.name = 'RevokeSignatureRejectedError'
  }
}
