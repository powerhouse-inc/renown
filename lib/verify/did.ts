// /verify for a bare DID: a name, not a signed claim, so the report says what
// the DID is and who is behind it, with no genuine/forged verdict.
import { appName, shortAddress, signerName } from './format'
import { isP256DidKey } from './p256'
import { appParty, signerParty } from './parties'
import type { Check, Report, VerifyDeps } from './types'

export async function verifyWalletDid(did: string, address: string, chainId: number, deps: VerifyDeps): Promise<Report> {
  const signer = await signerParty(deps.lookups, address, chainId)
  const checks: Check[] = [
    { id: 'format', label: 'A wallet identity', status: 'pass', detail: `The Renown identity of wallet ${shortAddress(address)} on chain ${chainId}.` },
    !signer.looked
      ? { id: 'profile', label: 'Public profile', status: 'unknown', detail: 'Renown could not be reached to look up a profile.' }
      : signer.profile
        ? { id: 'profile', label: 'Public profile', status: 'pass', detail: `It has a public profile as ${signerName(signer)}.` }
        : { id: 'profile', label: 'Public profile', status: 'neutral', detail: 'It has no public profile on Renown.' },
  ]
  return {
    kind: 'did-pkh',
    verdict: 'identity',
    summary: signer.profile
      ? `${did.slice(0, 22)}… is ${signerName(signer)} on Renown.`
      : `This is the Renown identity of ${shortAddress(address)}. It has no public profile${signer.looked ? '' : ' that could be looked up just now'}.`,
    checks,
    signer,
    app: null,
    times: [],
  }
}

export async function verifyAppDid(did: string, deps: VerifyDeps): Promise<Report> {
  const p256 = isP256DidKey(did)
  const app = await appParty(deps.lookups, did, null)
  const checks: Check[] = [
    p256
      ? { id: 'format', label: 'An app key', status: 'pass', detail: 'A P-256 public key, the kind Renown apps sign with.' }
      : { id: 'format', label: 'An app key', status: 'neutral', detail: 'A did:key, but not a P-256 key: Renown apps do not sign with this kind of key.' },
    !app.looked
      ? { id: 'profile', label: 'App profile', status: 'unknown', detail: 'Renown could not be reached to look up an app profile.' }
      : app.profile
        ? { id: 'profile', label: 'App profile', status: 'pass', detail: `It is the key of ${appName(app)}, which has a public app profile.` }
        : { id: 'profile', label: 'App profile', status: 'neutral', detail: 'It has no public app profile. Session keys of Connect and other apps usually have none.' },
  ]
  return {
    kind: 'did-key',
    verdict: 'identity',
    summary: app.profile
      ? `This is the app key of ${appName(app)}.`
      : 'This is an app key with no public app profile.',
    checks,
    signer: null,
    app,
    times: [],
  }
}
