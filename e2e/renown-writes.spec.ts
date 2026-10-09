import { test, expect } from '@playwright/test'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { verifyMessage } from 'viem'
import { profileMessage, revokeMessage, type ProfileFields } from '../services/renown-signed-messages'
import { installInjectedWallet, type InjectedWallet } from './support/injected-wallet'
import { graphqlError, resetStub, scriptStub, stubRequests } from './support/stub-switchboard-client'

// The write routes call the switchboard server-side, so these tests drive the
// stub switchboard the dev server is pointed at (see playwright.config.ts) and
// assert on what it received. Every test that scripts the stub lives in this
// file: the stub is shared, so they must run one at a time.
test.describe.configure({ mode: 'serial' })

const UNKNOWN_REVOKE = 'Cannot query field "renown_revokeCredential" on type "Mutation".'
const UNKNOWN_ISSUE = 'Cannot query field "renown_issueCredential" on type "Mutation".'
const UNKNOWN_UPSERT = 'Cannot query field "renown_upsertProfile" on type "Mutation".'

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
    expect(response.status()).toBe(500)
    expect(await stubRequests('createEmptyDocument')).toHaveLength(0)
  })
})

async function signedProfile(
  profile: ProfileFields,
  key = generatePrivateKey(),
) {
  const account = privateKeyToAccount(key)
  const timestamp = new Date().toISOString()
  const signature = await account.signMessage({
    message: await profileMessage(account.address, profile, timestamp),
  })
  return { address: account.address, ...profile, signature, timestamp }
}

test.describe('POST /api/profile/update', () => {
  test('without a signature returns 401 and writes nothing', async ({ request }) => {
    const address = privateKeyToAccount(generatePrivateKey()).address
    const response = await request.post('/api/profile/update', { data: { address, username: 'frank.eth' } })
    expect(response.status()).toBe(401)
    expect(await stubRequests('renown_upsertProfile')).toHaveLength(0)
    expect(await stubRequests('mutateDocument')).toHaveLength(0)
  })

  test('forwards renown_upsertProfile without a bearer', async ({ request }) => {
    const body = await signedProfile({ username: 'frank.eth', userImage: 'https://example.com/a.png' })
    await scriptStub({
      match: 'renown_upsertProfile',
      variables: body.address,
      response: { data: { renown_upsertProfile: 'doc-profile' } },
    })

    const response = await request.post('/api/profile/update', {
      data: body,
      headers: { Authorization: 'Bearer should-not-be-forwarded' },
    })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ result: true, documentId: 'doc-profile' })

    const call = (await stubRequests('renown_upsertProfile')).find((c) => c.variables.address === body.address)
    expect(call?.variables).toEqual({
      address: body.address,
      username: 'frank.eth',
      userImage: 'https://example.com/a.png',
      signature: body.signature,
      timestamp: body.timestamp,
    })
    expect(call?.headers.authorization).toBeUndefined()
    expect(await stubRequests('mutateDocument')).toHaveLength(0)
  })

  for (const [code, status] of [
    ['FORBIDDEN', 403],
    ['BAD_USER_INPUT', 400],
    ['RATE_LIMITED', 429],
  ] as const) {
    test(`relays ${code} as ${status} without falling back`, async ({ request }) => {
      const body = await signedProfile({ username: 'frank.eth', userImage: null })
      await scriptStub({ match: 'renown_upsertProfile', variables: body.address, response: graphqlError(code, code) })

      const response = await request.post('/api/profile/update', { data: body })
      expect(response.status()).toBe(status)
      expect(await stubRequests('mutateDocument')).toHaveLength(0)
    })
  }

  test('forwards the identity fields exactly as signed', async ({ request }) => {
    const fields = {
      displayName: 'Frank',
      handle: 'frank',
      bio: 'Hi',
      links: [{ id: 'l1', label: 'Site', url: 'https://frank.example' }],
      avatar: `attachment://v1:${'a'.repeat(64)}`,
    }
    const body = await signedProfile(fields)
    await scriptStub({ match: 'renown_upsertProfile', variables: body.address, response: { data: { renown_upsertProfile: 'doc-id' } } })

    const response = await request.post('/api/profile/update', { data: body })
    expect(response.status()).toBe(200)
    const call = (await stubRequests('renown_upsertProfile')).find((c) => c.variables.address === body.address)
    expect(call?.variables).toEqual({ address: body.address, username: null, userImage: null, ...fields, signature: body.signature, timestamp: body.timestamp })
  })

  test('relays HANDLE_TAKEN as 409 naming the field', async ({ request }) => {
    const body = await signedProfile({ handle: 'taken' })
    await scriptStub({
      match: 'renown_upsertProfile',
      variables: body.address,
      response: graphqlError('The handle "taken" is taken', 'HANDLE_TAKEN', { field: 'handle' }),
    })
    const response = await request.post('/api/profile/update', { data: body })
    expect(response.status()).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'HANDLE_TAKEN', field: 'handle' })
  })

  test('relays INVALID_AVATAR as 400 naming the field', async ({ request }) => {
    const body = await signedProfile({ avatar: `attachment://v1:${'b'.repeat(64)}` })
    await scriptStub({
      match: 'renown_upsertProfile',
      variables: body.address,
      response: graphqlError('Invalid avatar: not uploaded', 'INVALID_AVATAR', { field: 'avatar' }),
    })
    const response = await request.post('/api/profile/update', { data: body })
    expect(response.status()).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_AVATAR', field: 'avatar' })
  })

  test('refuses identity fields on a switchboard without renown_* mutations', async ({ request }) => {
    const body = await signedProfile({ handle: 'frank' })
    await scriptStub({ match: 'renown_upsertProfile', variables: body.address, response: graphqlError(UNKNOWN_UPSERT) })
    const response = await request.post('/api/profile/update', { data: body })
    expect(response.status()).toBe(501)
    expect(await stubRequests('mutateDocument')).toHaveLength(0)
  })

  test('falls back to the legacy profile write on a switchboard without renown_* mutations', async ({ request }) => {
    const body = await signedProfile({ username: 'frank.eth', userImage: null })
    const documentId = uniqueId('doc-profile-legacy')
    await scriptStub({ match: 'renown_upsertProfile', variables: body.address, response: graphqlError(UNKNOWN_UPSERT) })
    await scriptStub({
      match: 'renownUsers',
      variables: body.address.toLowerCase(),
      response: { data: { renownUsers: [{ documentId, ethAddress: body.address.toLowerCase() }] } },
    })
    await scriptStub({ match: 'mutateDocument', variables: documentId, response: { data: { mutateDocument: { id: documentId } } } })

    const response = await request.post('/api/profile/update', { data: body })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ documentId })

    const write = (await stubRequests('mutateDocument')).find((c) => c.variables.documentIdentifier === documentId)
    expect(JSON.stringify(write?.variables.actions)).toContain('"type":"SET_USERNAME"')
  })

  test('legacy fallback refuses a signature by another address', async ({ request }) => {
    const body = await signedProfile({ username: 'frank.eth', userImage: null })
    const victim = privateKeyToAccount(generatePrivateKey()).address
    await scriptStub({ match: 'renown_upsertProfile', variables: victim, response: graphqlError(UNKNOWN_UPSERT) })

    const response = await request.post('/api/profile/update', { data: { ...body, address: victim } })
    expect(response.status()).toBe(403)
    expect(await stubRequests('mutateDocument')).toHaveLength(0)
  })
})

// Browser-level: the web flow with an injected test wallet. The credential
// read (GET /api/auth/credential) is answered in the browser once the
// credential was posted, since the stub has no read model; the writes go
// through the real API routes to the stub switchboard.
test.describe('web flow credential revocation', () => {
  const APP_DID = 'did:web:test.example'
  const FLOW_URL = `/?app=${APP_DID}&returnUrl=${encodeURIComponent('http://localhost:3000/done')}`

  interface Flow {
    wallet: InjectedWallet
    /** DELETE requests the browser sent. */
    deletes: string[]
    /** Profile updates the browser sent. */
    profileUpdates: string[]
    credentialId: () => string
  }

  async function authorize(page: import('@playwright/test').Page): Promise<Flow> {
    // Nothing leaves localhost: ENS lookups fail fast, so the flow has no ENS name.
    await page.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => route.abort())
    const wallet = await installInjectedWallet(page)
    let issued: { credential: { id: string; credentialSubject: unknown } } | null = null
    let revoked = false
    await page.route('**/api/credential/renown', async (route) => {
      const method = route.request().method()
      if (method === 'POST') issued = route.request().postDataJSON()
      const response = await route.fetch()
      if (method === 'DELETE' && response.ok()) revoked = true
      await route.fulfill({ response })
    })
    // Like the real read (includeRevoked: false), a revoked credential is gone.
    await page.route('**/api/auth/credential?*', (route) =>
      issued && !revoked
        ? route.fulfill({
            json: { credential: { id: issued.credential.id, credentialSubject: issued.credential.credentialSubject } },
          })
        : route.fulfill({ status: 404, json: { error: 'Credential not found' } }),
    )
    const deletes: string[] = []
    const profileUpdates: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'DELETE') deletes.push(r.url())
      if (r.url().includes('/api/profile/update')) profileUpdates.push(r.url())
    })
    await scriptStub({
      match: 'renown_issueCredential',
      variables: wallet.address.toLowerCase(),
      response: { data: { renown_issueCredential: uniqueId('doc-ui') } },
    })

    await page.goto(FLOW_URL)
    await page.getByRole('button', { name: 'Confirm Authorization' }).click({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Revoke' })).toBeVisible({ timeout: 30_000 })
    return {
      wallet,
      deletes,
      profileUpdates,
      credentialId: () => {
        if (!issued) throw new Error('no credential was issued')
        return issued.credential.id
      },
    }
  }

  test.beforeEach(() => {
    test.setTimeout(90_000)
  })

  test('login without an ENS name signs nothing beyond the credential', async ({ page }) => {
    const flow = await authorize(page)
    expect(flow.wallet.personalSignRequests).toEqual([])
    expect(flow.profileUpdates).toEqual([])
  })

  test('a declined revoke signature sends no DELETE and says so', async ({ page }) => {
    const flow = await authorize(page)
    flow.wallet.declinePersonalSign = true

    await page.getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Revocation cancelled' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Revoke' })).toBeVisible()
    expect(flow.wallet.personalSignRequests).toHaveLength(1)
    expect(flow.wallet.personalSignRequests[0]).toMatch(
      new RegExp(`^Revoke Renown credential ${flow.credentialId()} at \\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z$`),
    )
    expect(flow.deletes).toEqual([])
  })

  test('a revoke the switchboard refuses is reported, not shown as done', async ({ page }) => {
    const flow = await authorize(page)
    await scriptStub({
      match: 'renown_revokeCredential',
      variables: flow.credentialId(),
      response: graphqlError('Forbidden', 'FORBIDDEN'),
    })

    await page.getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Could not revoke' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Revoke' })).toBeVisible()
    expect(flow.deletes).toHaveLength(1)
  })

  test('a signed revoke reaches the switchboard with a signature by the wallet', async ({ page }) => {
    const flow = await authorize(page)
    await scriptStub({
      match: 'renown_revokeCredential',
      variables: flow.credentialId(),
      response: { data: { renown_revokeCredential: true } },
    })

    await page.getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByRole('button', { name: 'Confirm Authorization' })).toBeVisible({ timeout: 30_000 })

    const call = (await stubRequests('renown_revokeCredential')).find(
      (c) => c.variables.credentialId === flow.credentialId(),
    )
    const { signature, timestamp } = call!.variables as { signature: `0x${string}`; timestamp: string }
    expect(
      await verifyMessage({
        address: flow.wallet.address,
        message: revokeMessage(flow.credentialId(), timestamp),
        signature,
      }),
    ).toBe(true)
    expect(call!.headers.authorization).toBeUndefined()
  })

  test('Disconnect with a declined revoke signature signs out and says the authorization stays active', async ({
    page,
  }) => {
    const flow = await authorize(page)
    flow.wallet.declinePersonalSign = true

    await page.getByRole('button', { name: 'Disconnect' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'without revoking your authorization' })).toBeVisible({
      timeout: 30_000,
    })
    expect(flow.deletes).toEqual([])
  })
})
