import { test, expect } from '@playwright/test'
import { profileMessage, profilePayload, revokeMessage } from '../services/renown-signed-messages'

// Runs in the Playwright worker (Node), not the browser: pins the canonical
// messages against the vectors the switchboard's renown-auth subgraph verifies
// (renown-package subgraphs/renown-auth/core/signed-message.ts). A drift here
// makes every signed revoke/profile write FORBIDDEN.
test.describe('Renown signed messages', () => {
  test('revoke message is exact', () => {
    expect(revokeMessage('cred-1', '2026-09-28T12:00:00.000Z')).toBe(
      'Revoke Renown credential cred-1 at 2026-09-28T12:00:00.000Z',
    )
  })

  test('profile message hashes the payload and lowercases the address', async () => {
    const expected =
      'Update Renown profile 0xabc0000000000000000000000000000000000001 e586dca7432283bd3bc606f7650606a0407f43f27843c738a82b9146603e6130 at t'
    expect(await profileMessage('0xABC0000000000000000000000000000000000001', { username: 'frank' }, 't')).toBe(
      expected,
    )
    expect(
      await profileMessage('0xabc0000000000000000000000000000000000001', { username: 'frank', userImage: null }, 't'),
    ).toBe(expected)
  })

  test('profile message covers both fields', async () => {
    expect(await profileMessage('0xABC0000000000000000000000000000000000001', {}, '2026-09-28T12:00:00.000Z')).toBe(
      'Update Renown profile 0xabc0000000000000000000000000000000000001 70023d290d04552cdddde62b7173cd7eaf34ed6c94dbadb84160250cdf949aba at 2026-09-28T12:00:00.000Z',
    )
    expect(
      await profileMessage(
        '0xABC0000000000000000000000000000000000001',
        { username: 'frank', userImage: 'data:image/png;base64,AA==' },
        '2026-09-28T12:00:00.000Z',
      ),
    ).toBe(
      'Update Renown profile 0xabc0000000000000000000000000000000000001 cad71ba7aa480cb0c72fd95c95cdcb63bfcc85666e5f66358e1f3f6221b0deb6 at 2026-09-28T12:00:00.000Z',
    )
  })

  test('profile message keeps the legacy payload until an identity field is present', async () => {
    expect(await profileMessage('0xABC0000000000000000000000000000000000001', { username: 'frank', handle: null }, 't')).toBe(
      'Update Renown profile 0xabc0000000000000000000000000000000000001 e586dca7432283bd3bc606f7650606a0407f43f27843c738a82b9146603e6130 at t',
    )
  })

  test('profile message hashes all identity fields in a fixed order', async () => {
    expect(
      await profileMessage(
        '0xABC0000000000000000000000000000000000001',
        {
          displayName: 'Frank',
          handle: 'frank',
          bio: 'Hi',
          links: [{ id: 'l1', label: 'Site', url: 'https://frank.example' }],
          avatar: `attachment://v1:${'a'.repeat(64)}`,
        },
        '2026-10-09T12:00:00.000Z',
      ),
    ).toBe(
      'Update Renown profile 0xabc0000000000000000000000000000000000001 4580e73ddd79972b5dd50d52aae493f1caed7a4025ec04ad402fd54c4a86ff55 at 2026-10-09T12:00:00.000Z',
    )
    expect(await profileMessage('0xABC0000000000000000000000000000000000001', { links: [] }, '2026-10-09T12:00:00.000Z')).toBe(
      'Update Renown profile 0xabc0000000000000000000000000000000000001 2de3522753823feab751ee8b58c4684f30d285ddfbf1dcae520db06c7772a629 at 2026-10-09T12:00:00.000Z',
    )
  })

  // Vectors shared with renown-package (docs/superpowers/plans/2026-10-11-verify-people-backend.md,
  // "Signed profile message"): listed is the eighth key, only when it is a boolean.
  test.describe('listed', () => {
    const address = '0xABC0000000000000000000000000000000000001'
    const at = '2026-10-11T12:00:00.000Z'
    const full = {
      displayName: 'Frank',
      handle: 'frank',
      bio: 'Hi',
      links: [{ id: 'l1', label: 'Site', url: 'https://frank.example' }],
      avatar: `attachment://v1:${'a'.repeat(64)}`,
    }
    const message = (hash: string) => `Update Renown profile 0xabc0000000000000000000000000000000000001 ${hash} at ${at}`

    test('payloads without listed are unchanged, null and absent alike', async () => {
      expect(profilePayload({ username: 'frank', listed: null })).toBe('{"username":"frank","userImage":null}')
      expect(await profileMessage(address, { username: 'frank' }, at)).toBe(
        message('e586dca7432283bd3bc606f7650606a0407f43f27843c738a82b9146603e6130'),
      )
      expect(await profileMessage(address, full, at)).toBe(message('4580e73ddd79972b5dd50d52aae493f1caed7a4025ec04ad402fd54c4a86ff55'))
      expect(await profileMessage(address, { ...full, listed: null }, at)).toBe(
        message('4580e73ddd79972b5dd50d52aae493f1caed7a4025ec04ad402fd54c4a86ff55'),
      )
    })

    test('listed is appended as the eighth key, and alone uses the seven-key form', async () => {
      expect(profilePayload({ listed: true })).toBe(
        '{"username":null,"userImage":null,"displayName":null,"handle":null,"bio":null,"links":null,"avatar":null,"listed":true}',
      )
      expect(await profileMessage(address, { listed: true }, at)).toBe(message('0a46ac991ff7e91d94d7d2ddff022fcbca86fcf7905fa09f77e46a3a3f5b93e0'))
      expect(await profileMessage(address, { listed: false }, at)).toBe(message('16dcce85d96df385580015dad07cf92524375040055ad19d9224022995a6e687'))
      expect(await profileMessage(address, { ...full, listed: true }, at)).toBe(
        message('ada9fa9d37a3d9f1b21e466272c02b4b136fec97e2fa57a11ed85dc814fa5296'),
      )
      expect(await profileMessage(address, { username: 'frank', listed: false }, at)).toBe(
        message('cf1c6b7c982d816646bbebc956e6d0c32da3b478bc01f90e1957cc3d981a24cc'),
      )
    })
  })
})
