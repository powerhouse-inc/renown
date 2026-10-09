import { test, expect } from '@playwright/test'
import { profileMessage, revokeMessage } from '../services/renown-signed-messages'

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
})
