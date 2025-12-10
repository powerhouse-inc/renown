import { test, expect } from '@playwright/test'

test.describe('Console Login Page', () => {
  test('shows invalid session message when no session ID provided', async ({ page }) => {
    await page.goto('/console')

    await expect(page.getByText('Invalid Session')).toBeVisible()
    await expect(page.getByText('No session ID provided')).toBeVisible()
    await expect(page.getByText('ph login')).toBeVisible()
  })

  test('shows console login flow with valid session ID', async ({ page }) => {
    const sessionId = 'ui-test-' + Date.now()
    await page.goto(`/console?session=${sessionId}`)

    // Should show authorize CLI title
    await expect(page.getByText('Authorize CLI')).toBeVisible()

    // Should show CLI application card with session info
    await expect(page.getByRole('heading', { name: 'Powerhouse CLI' })).toBeVisible()
    await expect(page.getByText(`Session: ${sessionId.slice(0, 8)}...`)).toBeVisible()

    // Should show wallet connection prompt
    await expect(page.getByText('Authorize the Powerhouse CLI')).toBeVisible()
  })

  test('page has correct meta title', async ({ page }) => {
    const sessionId = 'meta-test-' + Date.now()
    await page.goto(`/console?session=${sessionId}`)

    await expect(page).toHaveTitle('Renown - Console Login')
  })

  test('shows connect wallet button when not connected', async ({ page }) => {
    const sessionId = 'wallet-test-' + Date.now()
    await page.goto(`/console?session=${sessionId}`)

    // The wallet button should be visible (RainbowKit connect button)
    // Note: The exact text may vary based on RainbowKit configuration
    const connectButton = page.locator('button').filter({ hasText: /connect|wallet/i })
    await expect(connectButton.first()).toBeVisible()
  })

  test('displays Renown branding', async ({ page }) => {
    const sessionId = 'branding-test-' + Date.now()
    await page.goto(`/console?session=${sessionId}`)

    // Should have Renown logo/branding in the card header
    const renownCard = page.locator('.rounded-2xl')
    await expect(renownCard).toBeVisible()
  })

  test('handles different session ID formats', async ({ page }) => {
    // UUID format
    await page.goto('/console?session=550e8400-e29b-41d4-a716-446655440000')
    await expect(page.getByText('Authorize CLI')).toBeVisible()

    // Short session ID
    await page.goto('/console?session=abc123')
    await expect(page.getByText('Authorize CLI')).toBeVisible()

    // Long session ID
    await page.goto('/console?session=very-long-session-id-with-many-characters-1234567890')
    await expect(page.getByText('Authorize CLI')).toBeVisible()
  })
})

test.describe('Console Login Page - API Integration', () => {
  test('initializes session via API when page loads', async ({ page, request }) => {
    const sessionId = 'init-test-' + Date.now()

    // Load the page
    await page.goto(`/console?session=${sessionId}`)
    await expect(page.getByText('Authorize CLI')).toBeVisible()

    // The session should exist now (created lazily or by the page)
    // When we poll, it should return pending
    const response = await request.get(`/api/console/session/${sessionId}`)
    const data = await response.json()
    expect(data.status).toBe('pending')
  })

  test('session can be completed and verified via API', async ({ page, request }) => {
    const sessionId = 'complete-ui-test-' + Date.now()
    const testAddress = '0x1234567890123456789012345678901234567890'
    const testChainId = 1
    const testDid = `did:pkh:eip155:${testChainId}:${testAddress.toLowerCase()}`

    // Load the page
    await page.goto(`/console?session=${sessionId}`)
    await expect(page.getByText('Authorize CLI')).toBeVisible()

    // Simulate completing the session via API (as if user authenticated)
    const completeResponse = await request.put(`/api/console/session/${sessionId}`, {
      data: {
        address: testAddress,
        chainId: testChainId,
        did: testDid,
        credentialId: 'urn:uuid:test-credential',
      },
    })
    expect(completeResponse.status()).toBe(200)

    // Verify session is ready
    const pollResponse = await request.get(`/api/console/session/${sessionId}`)
    const pollData = await pollResponse.json()
    expect(pollData.status).toBe('ready')
    expect(pollData.address).toBe(testAddress)
  })
})
