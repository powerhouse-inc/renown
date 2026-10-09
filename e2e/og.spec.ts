import { test, expect } from '@playwright/test'
import { fixtureStub } from './support/stub-switchboard-client'

// Fixtures use ids no other spec uses (they survive renown-writes.spec.ts's resets).
// The OG route (pages/api/og.tsx) against the stub switchboard.
const ADDRESS = '0x5e00000000000000000000000000000000000c01'
const BROKEN = '0x5e00000000000000000000000000000000000c02'
const APP_DID = 'did:key:z6MkSeoAppxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const profile = (documentId: string, avatar: string | null) => ({
  documentId,
  displayName: 'Olga Graph',
  username: null,
  handle: 'olga',
  avatar,
  userImage: null,
})

test.beforeAll(async () => {
  await fixtureStub({ match: 'OgProfile', variables: ADDRESS, response: { data: { renownUsers: [profile('seo-doc-1', null)] } } })
  // Its avatar is not stored on the stub: the image fetch 404s.
  await fixtureStub({
    match: 'OgProfile',
    variables: BROKEN,
    response: { data: { renownUsers: [profile('seo-doc-broken', `attachment://v1:${'a'.repeat(64)}`)] } },
  })
  await fixtureStub({
    match: 'OgApp',
    variables: APP_DID,
    response: { data: { appProfile: { documentId: 'stub-app-doc', name: 'Seo App', tagline: 'Found everywhere', category: 'Tools', logo: null, logoRef: `attachment://v1:${'1'.repeat(64)}` } } },
  })
})

test.describe('link-preview images', () => {
  const variantOf = async (request: import('@playwright/test').APIRequestContext, query: string) => {
    const response = await request.get(`/api/og${query}`)
    expect(response.status(), query).toBe(200)
    expect(response.headers()['content-type'], query).toBe('image/png')
    return response.headers()['x-og-variant']
  }

  test('render the default, profile and app cards', async ({ request }) => {
    expect(await variantOf(request, '')).toBe('default')
    expect(await variantOf(request, `?variant=profile&address=${ADDRESS}`)).toBe('profile')
    expect(await variantOf(request, `?variant=app&did=${APP_DID}`)).toBe('app')
  })

  test('fall back to the default card on bad input, unknown ids and broken images', async ({ request }) => {
    expect(await variantOf(request, '?variant=profile&address=nope')).toBe('default')
    expect(await variantOf(request, '?variant=profile&address=0x5e00000000000000000000000000000000000c99')).toBe('default')
    expect(await variantOf(request, `?variant=profile&address=${BROKEN}`)).toBe('default')
    expect(await variantOf(request, '?variant=app&did=did:web:nope')).toBe('default')
    expect(await variantOf(request, '?variant=bogus')).toBe('default')
  })
})
