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
})
