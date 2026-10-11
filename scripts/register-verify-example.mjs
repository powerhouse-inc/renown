#!/usr/bin/env node
// Stores /verify's example credential (lib/verify/examples.json) on a Renown
// switchboard, so the examples check out against the live registry:
//
//   node scripts/register-verify-example.mjs https://switchboard.renown-staging.vetra.io/graphql
//
// renown_issueCredential is self-authenticating (the switchboard checks the
// EIP-712 proof) and idempotent, so running it twice is harmless. No key is
// needed: the signed credential is all it takes. On the first run the
// switchboard also creates a bare profile (a renown-user document holding
// only the address) for the example address if it has none, as it does for
// any new issuer; later runs change nothing.
import { readFileSync } from 'node:fs'

const endpoint = process.argv[2]
if (!endpoint || !/^https?:\/\/.+\/graphql$/.test(endpoint)) {
  console.error('usage: node scripts/register-verify-example.mjs <switchboard>/graphql')
  process.exit(1)
}
const { credential } = JSON.parse(readFileSync(new URL('../lib/verify/examples.json', import.meta.url), 'utf8'))
const input = {
  id: credential.id,
  context: credential['@context'],
  type: credential.type,
  issuer: credential.issuer,
  credentialSubject: credential.credentialSubject,
  credentialSchema: credential.credentialSchema,
  issuanceDate: credential.issuanceDate,
  expirationDate: credential.expirationDate,
  proof: {
    type: credential.proof.type,
    created: credential.proof.created,
    verificationMethod: credential.proof.verificationMethod,
    proofPurpose: credential.proof.proofPurpose,
    proofValue: credential.proof.proofValue,
    ethereumAddress: credential.proof.ethereumAddress,
    eip712: credential.proof.eip712,
  },
}
const res = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    query: 'mutation IssueCredential($input: RenownCredential_InitInput!) { renown_issueCredential(input: $input) }',
    variables: { input },
  }),
})
const body = await res.json()
if (body.errors?.length || !body.data?.renown_issueCredential) {
  console.error('Not stored:', JSON.stringify(body.errors ?? body))
  process.exit(1)
}
console.log(`Stored ${credential.id} as document ${body.data.renown_issueCredential}`)
