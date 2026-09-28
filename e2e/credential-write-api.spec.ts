import { test, expect } from '@playwright/test'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { revokeMessage } from '../services/renown-signed-messages'
import { graphqlError, resetStub, scriptStub, stubRequests } from './support/stub-switchboard-client'

// The credential write routes call the switchboard server-side, so these
// tests drive the stub switchboard the dev server is pointed at (see
// playwright.config.ts) and assert on what it received.
test.describe.configure({ mode: 'serial' })

const UNKNOWN_REVOKE = 'Cannot query field "renown_revokeCredential" on type "Mutation".'
const UNKNOWN_ISSUE = 'Cannot query field "renown_issueCredential" on type "Mutation".'

let counter = 0
function uniqueId(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now()}-${counter}`
}

function makeCredentialBody(address: `0x${string}`, credentialId: string) {
  const issuerId = `did:pkh:eip155:1:${address.toLowerCase()}`
  return {
    credential: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'RenownCredential'],
      id: credentialId,
      issuer: { id: issuerId, ethereumAddress: address },
      credentialSubject: { id: issuerId, app: 'renown-app' },
      credentialSchema: { id: 'https://renown.id/schemas/renown-credential/v1', type: 'JsonSchemaValidator2018' },
      issuanceDate: '2026-09-28T12:00:00.000Z',
      expirationDate: '2026-10-05T12:00:00.000Z',
    },
    signature: '0xproof',
    domain: { version: '1', chainId: 1 },
    username: 'frank',
    userImage: null,
  }
}

async function signedRevoke(credentialId: string, key = generatePrivateKey()) {
  const account = privateKeyToAccount(key)
  const timestamp = new Date().toISOString()
  const signature = await account.signMessage({ message: revokeMessage(credentialId, timestamp) })
  return { address: account.address, signature, timestamp }
}

test.beforeEach(async () => {
  await resetStub()
})

test.describe('DELETE /api/credential/renown', () => {
  test('without a signature returns 401 and writes nothing', async ({ request }) => {
    const credentialId = uniqueId('urn:uuid:nosig')
    const response = await request.delete('/api/credential/renown', {
      data: { credentialId, address: privateKeyToAccount(generatePrivateKey()).address },
    })
    expect(response.status()).toBe(401)
    expect(await stubRequests('renown_revokeCredential')).toHaveLength(0)
    expect(await stubRequests('mutateDocument')).toHaveLength(0)
  })

  test('with a signature forwards renown_revokeCredential without a bearer', async ({ request }) => {
    const credentialId = uniqueId('urn:uuid:signed')
    const signed = await signedRevoke(credentialId)
    await scriptStub({
      match: 'renown_revokeCredential',
      variables: credentialId,
      response: { data: { renown_revokeCredential: true } },
    })

    const response = await request.delete('/api/credential/renown', {
      data: { credentialId, ...signed },
      headers: { Authorization: 'Bearer should-not-be-forwarded' },
    })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ result: true })

    const calls = await stubRequests('renown_revokeCredential')
    const call = calls.find((c) => c.variables.credentialId === credentialId)
    expect(call?.variables).toEqual({
      credentialId,
      signature: signed.signature,
      timestamp: signed.timestamp,
    })
    expect(call?.headers.authorization).toBeUndefined()
    expect(await stubRequests('mutateDocument')).toHaveLength(0)
  })

  test('relays FORBIDDEN as 403 without falling back', async ({ request }) => {
    const credentialId = uniqueId('urn:uuid:forbidden')
    const signed = await signedRevoke(credentialId)
    await scriptStub({
      match: 'renown_revokeCredential',
      variables: credentialId,
      response: graphqlError('Forbidden', 'FORBIDDEN'),
    })

    const response = await request.delete('/api/credential/renown', { data: { credentialId, ...signed } })
    expect(response.status()).toBe(403)
    expect(await stubRequests('renownCredentials')).toHaveLength(0)
    expect(await stubRequests('mutateDocument')).toHaveLength(0)
  })

  test('relays NOT_FOUND as 404', async ({ request }) => {
    const credentialId = uniqueId('urn:uuid:missing')
    const signed = await signedRevoke(credentialId)
    await scriptStub({
      match: 'renown_revokeCredential',
      variables: credentialId,
      response: graphqlError('Not found', 'NOT_FOUND'),
    })

    const response = await request.delete('/api/credential/renown', { data: { credentialId, ...signed } })
    expect(response.status()).toBe(404)
  })

  test('falls back to the legacy revoke on a switchboard without renown_* mutations', async ({ request }) => {
    const credentialId = uniqueId('urn:uuid:legacy')
    const documentId = uniqueId('doc-legacy')
    const signed = await signedRevoke(credentialId)
    await scriptStub({ match: 'renown_revokeCredential', variables: credentialId, response: graphqlError(UNKNOWN_REVOKE) })
    await scriptStub({
      match: 'renownCredentials',
      variables: signed.address.toLowerCase(),
      response: { data: { renownCredentials: [{ documentId, credentialId }] } },
    })
    await scriptStub({ match: 'mutateDocument', variables: documentId, response: { data: { mutateDocument: { id: documentId } } } })

    const response = await request.delete('/api/credential/renown', { data: { credentialId, ...signed } })
    expect(response.status()).toBe(200)

    const writes = (await stubRequests('mutateDocument')).filter((c) => c.variables.documentIdentifier === documentId)
    expect(writes).toHaveLength(1)
    expect(JSON.stringify(writes[0].variables.actions)).toContain('"type":"REVOKE"')
  })

  test('legacy fallback still refuses a signature by another address', async ({ request }) => {
    const credentialId = uniqueId('urn:uuid:legacy-wrong')
    const signed = await signedRevoke(credentialId)
    const victim = privateKeyToAccount(generatePrivateKey()).address
    await scriptStub({ match: 'renown_revokeCredential', variables: credentialId, response: graphqlError(UNKNOWN_REVOKE) })

    const response = await request.delete('/api/credential/renown', {
      data: { credentialId, signature: signed.signature, timestamp: signed.timestamp, address: victim },
    })
    expect(response.status()).toBe(403)
    expect(await stubRequests('mutateDocument')).toHaveLength(0)
  })
})

test.describe('DELETE /api/auth/credential', () => {
  test('without a signature returns 401 and writes nothing', async ({ request }) => {
    const documentId = uniqueId('doc-nosig')
    const response = await request.delete(`/api/auth/credential?id=${documentId}`)
    expect(response.status()).toBe(401)
    expect(await stubRequests('renown_revokeCredential')).toHaveLength(0)
    expect(await stubRequests('mutateDocument')).toHaveLength(0)
  })

  test('maps the document id to its credential id and revokes it signed', async ({ request }) => {
    const credentialId = uniqueId('urn:uuid:by-doc')
    const documentId = uniqueId('doc-by-doc')
    const signed = await signedRevoke(credentialId)
    await scriptStub({
      match: 'renownCredentials',
      variables: signed.address.toLowerCase(),
      response: { data: { renownCredentials: [{ documentId, credentialId }] } },
    })
    await scriptStub({
      match: 'renown_revokeCredential',
      variables: credentialId,
      response: { data: { renown_revokeCredential: true } },
    })

    const response = await request.delete(`/api/auth/credential?id=${documentId}`, { data: signed })
    expect(response.status()).toBe(200)

    const call = (await stubRequests('renown_revokeCredential')).find((c) => c.variables.credentialId === credentialId)
    expect(call?.variables).toEqual({ credentialId, signature: signed.signature, timestamp: signed.timestamp })
    expect(call?.headers.authorization).toBeUndefined()
  })
})

test.describe('POST /api/credential/renown', () => {
  test('stores the credential through renown_issueCredential', async ({ request }) => {
    const account = privateKeyToAccount(generatePrivateKey())
    const credentialId = uniqueId('urn:uuid:issue')
    const body = makeCredentialBody(account.address, credentialId)
    await scriptStub({
      match: 'renown_issueCredential',
      variables: credentialId,
      response: { data: { renown_issueCredential: 'doc-issued' } },
    })

    const response = await request.post('/api/credential/renown', { data: body })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ result: true, documentId: 'doc-issued' })

    const call = (await stubRequests('renown_issueCredential')).find(
      (c) => (c.variables.input as { id?: string } | undefined)?.id === credentialId,
    )
    expect(call).toBeDefined()
    expect(call?.variables).toMatchObject({
      username: 'frank',
      userImage: null,
      input: {
        id: credentialId,
        issuer: { id: body.credential.issuer.id, ethereumAddress: account.address },
        proof: {
          proofValue: '0xproof',
          type: 'EthereumEip712Signature2021',
          eip712: { domain: { version: '1', chainId: 1 }, primaryType: 'VerifiableCredential' },
        },
      },
    })
    expect(await stubRequests('createEmptyDocument')).toHaveLength(0)
    expect(await stubRequests('mutateDocument')).toHaveLength(0)
  })

  test('falls back to the legacy document writes on a switchboard without renown_* mutations', async ({ request }) => {
    const account = privateKeyToAccount(generatePrivateKey())
    const credentialId = uniqueId('urn:uuid:issue-legacy')
    await scriptStub({ match: 'renown_issueCredential', variables: credentialId, response: graphqlError(UNKNOWN_ISSUE) })
    await scriptStub({
      match: 'createEmptyDocument',
      variables: 'powerhouse/renown-credential',
      response: { data: { createEmptyDocument: { id: 'doc-legacy-credential' } } },
    })
    await scriptStub({
      match: 'createEmptyDocument',
      variables: 'powerhouse/renown-user',
      response: { data: { createEmptyDocument: { id: 'doc-legacy-profile' } } },
    })

    const response = await request.post('/api/credential/renown', {
      data: makeCredentialBody(account.address, credentialId),
    })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({
      result: true,
      documentId: 'doc-legacy-credential',
      userDocumentId: 'doc-legacy-profile',
    })

    const init = (await stubRequests('mutateDocument')).find(
      (c) => c.variables.documentIdentifier === 'doc-legacy-credential',
    )
    expect(JSON.stringify(init?.variables.actions)).toContain('"type":"INIT"')
  })

  test('surfaces BAD_USER_INPUT as 400 without falling back', async ({ request }) => {
    const account = privateKeyToAccount(generatePrivateKey())
    const credentialId = uniqueId('urn:uuid:issue-bad')
    await scriptStub({
      match: 'renown_issueCredential',
      variables: credentialId,
      response: graphqlError('Invalid request: EIP-712 proof signature does not match issuer', 'BAD_USER_INPUT'),
    })

    const response = await request.post('/api/credential/renown', {
      data: makeCredentialBody(account.address, credentialId),
    })
    expect(response.status()).toBe(400)
    expect((await response.json()).error).toContain('EIP-712 proof signature does not match issuer')
    expect(await stubRequests('createEmptyDocument')).toHaveLength(0)
  })

  test('does not fall back on a variable-coercion error', async ({ request }) => {
    const account = privateKeyToAccount(generatePrivateKey())
    const credentialId = uniqueId('urn:uuid:issue-coerce')
    await scriptStub({
      match: 'renown_issueCredential',
      variables: credentialId,
      response: graphqlError(
        'Variable "$input" got invalid value "x" at "input.proof.eip712"; Unknown type "RenownCredential_InitInput".',
      ),
    })

    const response = await request.post('/api/credential/renown', {
      data: makeCredentialBody(account.address, credentialId),
    })
    expect(response.status()).toBeGreaterThanOrEqual(400)
    expect(await stubRequests('createEmptyDocument')).toHaveLength(0)
  })
})
