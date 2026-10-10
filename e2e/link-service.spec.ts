import { test, expect } from '@playwright/test'
import { appJsonLd, profileJsonLd } from '../lib/json-ld'
import { memberSince, profileDisplayName, walletDid } from '../lib/profile-identity'
import { qrCode } from '../lib/qr'
import { linkTarget } from '../utils/link-service'

test('links are recognised by host, unsafe ones are not links at all', () => {
  const table: [string, ReturnType<typeof linkTarget>][] = [
    ['https://github.com/powerhouse-inc', { service: 'github', host: 'github.com' }],
    ['https://gist.github.com/x', { service: 'github', host: 'gist.github.com' }],
    ['https://x.com/PowerhouseDAO', { service: 'x', host: 'x.com' }],
    ['https://twitter.com/a', { service: 'x', host: 'twitter.com' }],
    ['https://www.linkedin.com/in/a', { service: 'linkedin', host: 'linkedin.com' }],
    ['https://farcaster.xyz/a', { service: 'farcaster', host: 'farcaster.xyz' }],
    ['https://warpcast.com/a', { service: 'farcaster', host: 'warpcast.com' }],
    ['https://youtu.be/abc', { service: 'youtube', host: 'youtu.be' }],
    ['https://m.youtube.com/@a', { service: 'youtube', host: 'm.youtube.com' }],
    ['https://discord.gg/abc', { service: 'discord', host: 'discord.gg' }],
    ['https://t.me/a', { service: 'telegram', host: 't.me' }],
    ['http://example.org/blog', { service: 'website', host: 'example.org' }],
    ['https://notgithub.com/a', { service: 'website', host: 'notgithub.com' }],
    ['https://github.com.evil.example/a', { service: 'website', host: 'github.com.evil.example' }],
    ['javascript:alert(1)', null],
    ['mailto:a@b.c', null],
    ['not a url', null],
  ]
  for (const [url, expected] of table) expect(linkTarget(url), url).toEqual(expected)
})

test('profile names fall back from display name to handle, username, short address', () => {
  const base = { documentId: 'doc-1', ethAddress: '0x2bbea0145d6fb9c6709a74c1179ca0be71bb3ac6' }
  expect(profileDisplayName({ ...base, displayName: 'Ada', handle: 'ada', username: 'ada.eth' })).toBe('Ada')
  expect(profileDisplayName({ ...base, displayName: '  ', handle: 'ada', username: 'ada.eth' })).toBe('ada')
  expect(profileDisplayName({ ...base, displayName: null, handle: null, username: 'ada.eth' })).toBe('ada.eth')
  expect(profileDisplayName({ ...base, displayName: null, handle: null, username: '0x2BbE...3aC6' })).toBe('0x2bbe…3ac6')
  expect(profileDisplayName({ documentId: 'doc-1', displayName: null, handle: null, username: null, ethAddress: null })).toBe('doc-1')
  expect(walletDid('0xABC0000000000000000000000000000000000001')).toBe('did:pkh:eip155:1:0xabc0000000000000000000000000000000000001')
  expect(memberSince('2026-06-15T16:49:47.419Z')).toBe('June 2026')
  expect(memberSince('2026-01-01T00:30:00.000Z')).toBe('January 2026')
  expect(memberSince('nope')).toBeNull()
  expect(memberSince(null)).toBeNull()
})

test('QR codes are deterministic single paths with whole-module coordinates', () => {
  const a = qrCode('https://www.renown.id/@frank')
  expect(qrCode('https://www.renown.id/@frank')).toEqual(a)
  expect(qrCode('https://www.renown.id/@ada')).not.toEqual(a)
  expect(a.size).toBe(29) // version 3 at error correction M
  expect(a.path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/)
  expect(qrCode(`https://www.renown.id/app/did:key:${'z'.repeat(60)}`).size).toBeGreaterThan(a.size)
})

test('JSON-LD carries only safe links and the facts shown on the page', () => {
  const profile = {
    documentId: 'doc-1',
    handle: 'ada',
    bio: ' Builds things ',
    createdAt: '2026-01-01T00:00:00.000Z',
    links: [
      { id: '1', label: 'GitHub', url: 'https://github.com/ada' },
      { id: '2', label: 'Bad', url: 'javascript:alert(1)' },
    ],
  }
  expect(profileJsonLd({ profile, name: 'Ada', url: 'https://r.id/@ada', image: null, did: 'did:pkh:eip155:1:0xa' })).toEqual({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: 'https://r.id/@ada',
    dateCreated: '2026-01-01T00:00:00.000Z',
    mainEntity: {
      '@type': 'Person',
      name: 'Ada',
      url: 'https://r.id/@ada',
      alternateName: '@ada',
      identifier: 'did:pkh:eip155:1:0xa',
      description: 'Builds things',
      sameAs: ['https://github.com/ada'],
    },
  })
  const app = {
    appDid: 'did:key:zApp',
    documentId: 'd',
    name: 'Vault',
    tagline: null,
    logo: null,
    website: 'javascript:alert(1)',
    publisherDid: null,
    description: 'Notes',
    category: 'Data',
    logoRef: null,
    coverRef: null,
    links: [],
  }
  expect(appJsonLd({ app, name: 'Vault', url: 'https://r.id/app/x', image: null, publisher: { name: 'Ada', url: 'https://r.id/@ada' } })).toEqual({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Vault',
    url: 'https://r.id/app/x',
    identifier: 'did:key:zApp',
    description: 'Notes',
    applicationCategory: 'Data',
    publisher: { '@type': 'Person', name: 'Ada', url: 'https://r.id/@ada' },
  })
})
