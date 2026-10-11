// "Try an example" on /verify: a coherent set signed once with throwaway keys
// (both private keys were discarded). The wallet issued the credential to the
// app key, and the app key signed the token and the operation for the wallet.
// The credential is stored on Renown (see scripts/register-verify-example.mjs),
// so every example checks out as genuine against the live registry.
import data from './examples.json'

export interface VerifyExample {
  id: 'credential' | 'token' | 'operation' | 'did'
  label: string
  text: string
  documentId: string
}

export const EXAMPLE_DATA = data

export const VERIFY_EXAMPLES: VerifyExample[] = [
  { id: 'credential', label: 'Credential', text: JSON.stringify(data.credential, null, 2), documentId: '' },
  { id: 'token', label: 'Bearer token', text: data.token, documentId: '' },
  { id: 'operation', label: 'Signed operation', text: JSON.stringify(data.operation, null, 2), documentId: data.documentId },
  { id: 'did', label: 'DID', text: `did:pkh:eip155:1:${data.address}`, documentId: '' },
]
