import { test, expect } from '@playwright/test'

test.describe('Console Session API', () => {
  const testSessionId = 'test-session-' + Date.now()

  test('GET returns pending status for non-existent session', async ({ request }) => {
    const response = await request.get(`/api/console/session/${testSessionId}`)
    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data.sessionId).toBe(testSessionId)
    expect(data.status).toBe('pending')
  })

  test('POST creates a new session', async ({ request }) => {
    const sessionId = 'create-test-' + Date.now()
    const response = await request.post(`/api/console/session/${sessionId}`)
    expect(response.status()).toBe(201)

    const data = await response.json()
    expect(data.sessionId).toBe(sessionId)
    expect(data.status).toBe('pending')
  })

  test('POST returns existing session if already created', async ({ request }) => {
    const sessionId = 'existing-test-' + Date.now()

    // Create session
    const createResponse = await request.post(`/api/console/session/${sessionId}`)
    expect(createResponse.status()).toBe(201)

    // Try to create again
    const secondResponse = await request.post(`/api/console/session/${sessionId}`)
    expect(secondResponse.status()).toBe(200)

    const data = await secondResponse.json()
    expect(data.sessionId).toBe(sessionId)
    expect(data.status).toBe('pending')
  })

  test('PUT completes a session with credential data', async ({ request }) => {
    const sessionId = 'complete-test-' + Date.now()
    const testAddress = '0x1234567890123456789012345678901234567890'
    const testChainId = 1
    const testDid = `did:pkh:eip155:${testChainId}:${testAddress.toLowerCase()}`
    const testCredentialId = 'urn:uuid:test-credential-id'

    // Create session first
    await request.post(`/api/console/session/${sessionId}`)

    // Complete the session
    const completeResponse = await request.put(`/api/console/session/${sessionId}`, {
      data: {
        address: testAddress,
        chainId: testChainId,
        did: testDid,
        credentialId: testCredentialId,
        userDocumentId: 'test-doc-id',
      },
    })
    expect(completeResponse.status()).toBe(200)

    const completeData = await completeResponse.json()
    expect(completeData.sessionId).toBe(sessionId)
    expect(completeData.status).toBe('ready')

    // Poll for the session
    const pollResponse = await request.get(`/api/console/session/${sessionId}`)
    expect(pollResponse.status()).toBe(200)

    const pollData = await pollResponse.json()
    expect(pollData.status).toBe('ready')
    expect(pollData.address).toBe(testAddress)
    expect(pollData.chainId).toBe(testChainId)
    expect(pollData.did).toBe(testDid)
    expect(pollData.credentialId).toBe(testCredentialId)
  })

  test('PUT fails with missing required fields', async ({ request }) => {
    const sessionId = 'incomplete-test-' + Date.now()

    const response = await request.put(`/api/console/session/${sessionId}`, {
      data: {
        address: '0x1234567890123456789012345678901234567890',
        // Missing chainId, did, credentialId
      },
    })
    expect(response.status()).toBe(400)

    const data = await response.json()
    expect(data.error).toContain('Missing required fields')
  })

  test('GET deletes session after successful retrieval (one-time use)', async ({ request }) => {
    const sessionId = 'one-time-test-' + Date.now()
    const testAddress = '0x1234567890123456789012345678901234567890'
    const testChainId = 1
    const testDid = `did:pkh:eip155:${testChainId}:${testAddress.toLowerCase()}`

    // Create and complete session
    await request.post(`/api/console/session/${sessionId}`)
    await request.put(`/api/console/session/${sessionId}`, {
      data: {
        address: testAddress,
        chainId: testChainId,
        did: testDid,
        credentialId: 'urn:uuid:test-credential',
      },
    })

    // First GET should return ready status
    const firstPoll = await request.get(`/api/console/session/${sessionId}`)
    expect(firstPoll.status()).toBe(200)
    const firstData = await firstPoll.json()
    expect(firstData.status).toBe('ready')

    // Second GET should return pending (session was deleted)
    const secondPoll = await request.get(`/api/console/session/${sessionId}`)
    expect(secondPoll.status()).toBe(200)
    const secondData = await secondPoll.json()
    expect(secondData.status).toBe('pending')
  })

  test('DELETE removes a session', async ({ request }) => {
    const sessionId = 'delete-test-' + Date.now()

    // Create session
    await request.post(`/api/console/session/${sessionId}`)

    // Delete session
    const deleteResponse = await request.delete(`/api/console/session/${sessionId}`)
    expect(deleteResponse.status()).toBe(200)

    const deleteData = await deleteResponse.json()
    expect(deleteData.success).toBe(true)
  })

  test('full polling flow simulates console waiting for auth', async ({ request }) => {
    const sessionId = 'polling-flow-' + Date.now()
    const testAddress = '0xabcdef1234567890abcdef1234567890abcdef12'
    const testChainId = 1
    const testDid = `did:pkh:eip155:${testChainId}:${testAddress.toLowerCase()}`
    const testCredentialId = 'urn:uuid:polling-test-credential'

    // Simulate console starting to poll (before user opens browser)
    const poll1 = await request.get(`/api/console/session/${sessionId}`)
    expect((await poll1.json()).status).toBe('pending')

    // Simulate user opening browser and creating session
    await request.post(`/api/console/session/${sessionId}`)

    // Console polls again - still pending
    const poll2 = await request.get(`/api/console/session/${sessionId}`)
    expect((await poll2.json()).status).toBe('pending')

    // Simulate user completing authentication
    await request.put(`/api/console/session/${sessionId}`, {
      data: {
        address: testAddress,
        chainId: testChainId,
        did: testDid,
        credentialId: testCredentialId,
        userDocumentId: 'user-doc-123',
      },
    })

    // Console polls - now ready!
    const poll3 = await request.get(`/api/console/session/${sessionId}`)
    const finalData = await poll3.json()
    expect(finalData.status).toBe('ready')
    expect(finalData.address).toBe(testAddress)
    expect(finalData.credentialId).toBe(testCredentialId)
    expect(finalData.userDocumentId).toBe('user-doc-123')
  })
})
