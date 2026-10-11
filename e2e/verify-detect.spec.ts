import { test, expect } from '@playwright/test'
import { detectInput } from '../lib/verify/detect'
import { base58Decode, isP256DidKey, p256PublicKey, verifyP256 } from '../lib/verify/p256'
import { readShareFragment, shareFragment } from '../lib/verify/share'
import { makeAppKey, makeBearerToken, makeCredential, makeV2Action, makeWallet } from './support/verify-fixtures'

// Runs in the Playwright worker (Node): what /verify recognises in a paste,
// the P-256 did:key decoding it verifies with, and its share links.

test.describe('/verify detection', () => {
  test('recognises each kind of paste and refuses the rest', async () => {
    const key = await makeAppKey()
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: key.did })
    const token = await makeBearerToken(key, wallet.address)
    const action = await makeV2Action({ key, address: wallet.address, documentId: 'doc-1' })
    const rows: [string, string | null][] = [
      [`did:pkh:eip155:1:${wallet.address}`, 'did-pkh'],
      [key.did, 'did-key'],
      ['urn:uuid:11111111-1111-4111-8111-111111111111', 'credential-id'],
      [token, 'token'],
      [`Bearer ${token}`, 'token'],
      [`  ${JSON.stringify(credential, null, 2)}\n`, 'credential'],
      [JSON.stringify(action), 'operation'],
      [JSON.stringify({ index: 3, action }), 'operation'],
      ['', null],
      ['did:pkh:eip155:1:0x123', null],
      ['hello', null],
      ['{"a":1}', null],
      ['{"a":', null],
      ['x'.repeat(100_001), null],
    ]
    for (const [text, kind] of rows) expect([text.slice(0, 40), detectInput(text).kind]).toEqual([text.slice(0, 40), kind])
    expect(detectInput(`did:pkh:eip155:137:${wallet.address}`)).toMatchObject({ address: wallet.address.toLowerCase(), chainId: 137 })
    expect(detectInput('{"a":').kind === null && detectInput('{"a":')).toMatchObject({ problem: 'json-invalid' })
    expect(detectInput('x'.repeat(100_001))).toMatchObject({ problem: 'too-long' })
    expect(isP256DidKey(key.did)).toBe(true)
    expect(isP256DidKey('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')).toBe(false)
  })

  test('share links carry the paste in the fragment and survive a round trip', () => {
    const input = { text: '{"x":"é ✓"}', documentId: 'doc-1', branch: 'draft' }
    const fragment = shareFragment(input)
    expect(fragment).toMatch(/^#v=[A-Za-z0-9_-]+$/)
    expect(readShareFragment(fragment)).toEqual(input)
    expect(readShareFragment(shareFragment({ text: 'did:key:z', documentId: '', branch: 'main' }))).toEqual({ text: 'did:key:z', documentId: '', branch: 'main' })
    expect(readShareFragment('#v=%%%')).toBeNull()
    expect(readShareFragment('#section')).toBeNull()
  })
})

test.describe('/verify P-256 app keys', () => {
  test('decodes a did:key and verifies its WebCrypto signatures, and nothing else', async () => {
    const key = await makeAppKey()
    expect(p256PublicKey(key.did)).toHaveLength(65)
    const message = new TextEncoder().encode('Signed Operation:\n3abc')
    const signature = await key.sign(message)
    expect(await verifyP256(key.did, signature, message)).toBe(true)
    expect(await verifyP256(key.did, signature, new TextEncoder().encode('Signed Operation:\n3abd'))).toBe(false)
    expect(await verifyP256((await makeAppKey()).did, signature, message)).toBe(false)
    expect(await verifyP256(key.did, signature.slice(0, 63), message)).toBe(false)
    expect(base58Decode('0OIl')).toBeNull()
    expect(() => p256PublicKey('did:pkh:eip155:1:0x0')).toThrow('not a base58btc did:key')
  })
})
