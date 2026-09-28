import { test, expect } from '@playwright/test'
import { verifyMessage, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { profileMessage } from '../services/renown-signed-messages'
import { refreshProfile, type StoredProfile, type UpdateProfileBody } from '../services/wallet/profile-refresh'
import type { Signer } from '../services/wallet/types'

// Runs in the Playwright worker (Node): the login-time profile refresh with a
// fake signer, profile read and update, so no wallet is needed.
function setup(stored: StoredProfile | null) {
  const account = privateKeyToAccount(generatePrivateKey())
  const signed: string[] = []
  const reads: Hex[] = []
  const updates: UpdateProfileBody[] = []
  const signer: Signer = {
    async signMessage(message) {
      signed.push(message)
      return account.signMessage({ message })
    },
    async signTypedData() {
      throw new Error('not used')
    },
  }
  const run = (ens: { ensName?: string | null; ensAvatar?: string | null }) =>
    refreshProfile({
      address: account.address,
      ...ens,
      signer,
      readProfile: async (address) => {
        reads.push(address)
        return stored
      },
      updateProfile: async (body) => {
        updates.push(body)
      },
    })
  return { account, signed, reads, updates, run }
}

test.describe('login profile refresh', () => {
  test('does nothing without an ENS name', async () => {
    const s = setup({ username: 'old.eth', userImage: null })
    expect(await s.run({ ensName: null, ensAvatar: 'https://example.com/a.png' })).toBe('skipped')
    expect(await s.run({})).toBe('skipped')
    expect(s.reads).toEqual([])
    expect(s.signed).toEqual([])
    expect(s.updates).toEqual([])
  })

  test('does not sign when the stored profile already matches', async () => {
    const s = setup({ username: 'frank.eth', userImage: 'https://example.com/a.png' })
    expect(await s.run({ ensName: 'frank.eth', ensAvatar: 'https://example.com/a.png' })).toBe('unchanged')
    expect(s.signed).toEqual([])
    expect(s.updates).toEqual([])
  })

  test('treats a missing avatar and a null one as the same', async () => {
    const s = setup({ username: 'frank.eth' })
    expect(await s.run({ ensName: 'frank.eth', ensAvatar: null })).toBe('unchanged')
    expect(s.signed).toEqual([])
  })

  test('does not sign for a profile the read model does not show yet', async () => {
    const s = setup(null)
    expect(await s.run({ ensName: 'frank.eth' })).toBe('unchanged')
    expect(s.signed).toEqual([])
  })

  test('signs the canonical profile message and sends it when the ENS name changed', async () => {
    const s = setup({ username: 'old.eth', userImage: null })
    expect(await s.run({ ensName: 'frank.eth', ensAvatar: 'https://example.com/a.png' })).toBe('updated')

    expect(s.updates).toHaveLength(1)
    const [update] = s.updates
    expect(update).toMatchObject({
      address: s.account.address,
      username: 'frank.eth',
      userImage: 'https://example.com/a.png',
    })
    const expected = await profileMessage(
      s.account.address,
      { username: 'frank.eth', userImage: 'https://example.com/a.png' },
      update.timestamp,
    )
    expect(s.signed).toEqual([expected])
    expect(await verifyMessage({ address: s.account.address, message: expected, signature: update.signature })).toBe(
      true,
    )
  })
})
