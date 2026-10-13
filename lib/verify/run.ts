// One entry point for /verify: a detected paste in, a report out. The real
// dependencies (the Renown SDK, viem, the switchboard) are loaded on demand,
// so the page itself ships none of them.
import { verifyAttestation } from './attestation'
import { verifyCredential, verifyCredentialId } from './credential'
import type { Detected } from './detect'
import { verifyAppDid, verifyWalletDid } from './did'
import { switchboardLookups } from './lookups'
import { verifyOperation } from './operation'
import { switchboardOrgLookups } from './org-lookups'
import { contractSignatureOnChain } from './smart-wallet'
import { verifyToken } from './token'
import type { Report, VerifyDeps } from './types'

export type CheckableInput = Exclude<Detected, { kind: null }>

export interface OperationTarget {
  documentId: string
  branch: string
}

/** The SDK logs every refused token with console.error; a refusal is an expected answer here. */
async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => undefined
  try {
    return await run()
  } finally {
    console.error = original
  }
}

/**
 * The dependencies the browser uses. `now` is read when a check runs (the SDK
 * reads Date.now() too), unless a fixed time is given.
 */
export function liveDeps(fixedNow?: Date): VerifyDeps {
  return {
    lookups: switchboardLookups(),
    orgs: switchboardOrgLookups(),
    async eoaSignature(credential) {
      const { verifyCredentialSignature } = await import('@renown/sdk')
      return verifyCredentialSignature(credential as unknown as Parameters<typeof verifyCredentialSignature>[0])
    },
    async bearerToken(jwt, audience) {
      const { verifyAuthBearerToken } = await import('@renown/sdk')
      return quietly(async () => (await verifyAuthBearerToken(jwt, audience ? { audience } : undefined)) !== false)
    },
    contractSignature: contractSignatureOnChain,
    get now() {
      return fixedNow ?? new Date()
    },
  }
}

export async function runVerify(input: CheckableInput, target: OperationTarget, liveOrFixed: VerifyDeps): Promise<Report> {
  // One clock reading for the whole check.
  const deps: VerifyDeps = { ...liveOrFixed, now: liveOrFixed.now }
  switch (input.kind) {
    case 'did-pkh':
      return verifyWalletDid(input.did, input.address, input.chainId, deps)
    case 'did-key':
      return verifyAppDid(input.did, deps)
    case 'credential-id':
      return verifyCredentialId(input.credentialId, deps)
    case 'credential':
      return verifyCredential(input.credential, deps)
    case 'token':
      return verifyToken(input.jwt, deps)
    case 'operation':
      return verifyOperation(input.action, target, deps)
    case 'release-attestation':
      return verifyAttestation(input.attestation, deps)
  }
}
