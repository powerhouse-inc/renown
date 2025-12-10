import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../../[utils]'
import {
  createSession,
  getSession,
  completeSession,
  deleteSession,
} from '../../../../services/console-session-store'

/**
 * Console Session API
 *
 * GET /api/console/session/[sessionId] - Get session status (for polling)
 * POST /api/console/session/[sessionId] - Create/initialize a session
 * PUT /api/console/session/[sessionId] - Complete a session with credential data
 * DELETE /api/console/session/[sessionId] - Delete a session
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { sessionId } = req.query

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'Session ID is required' })
    return
  }

  if (req.method === 'GET') {
    // Get session status - used by console for polling
    const session = getSession(sessionId)

    if (!session) {
      // Session doesn't exist or expired
      // Return pending status to allow console to keep polling while user opens browser
      res.status(200).json({
        sessionId,
        status: 'pending',
      })
      return
    }

    if (session.status === 'pending') {
      res.status(200).json({
        sessionId: session.sessionId,
        status: 'pending',
      })
      return
    }

    // Session is ready - return credential data
    res.status(200).json({
      sessionId: session.sessionId,
      status: 'ready',
      address: session.address,
      chainId: session.chainId,
      did: session.did,
      connectDid: session.connectDid,
      credentialId: session.credentialId,
      userDocumentId: session.userDocumentId,
    })

    // Delete session after successful retrieval (one-time use)
    deleteSession(sessionId)
  } else if (req.method === 'POST') {
    // Create/initialize a session - called when console opens browser
    // This is optional, sessions can also be created lazily on PUT
    const existingSession = getSession(sessionId)
    if (existingSession) {
      res.status(200).json({
        sessionId: existingSession.sessionId,
        status: existingSession.status,
      })
      return
    }

    const session = createSession(sessionId)
    res.status(201).json({
      sessionId: session.sessionId,
      status: session.status,
    })
  } else if (req.method === 'PUT') {
    // Complete a session with credential data - called after user authenticates
    const { address, chainId, did, credentialId, userDocumentId, connectDid } = req.body

    if (!address || !chainId || !did || !credentialId) {
      res.status(400).json({
        error: 'Missing required fields: address, chainId, did, credentialId',
      })
      return
    }

    // Create session if it doesn't exist (lazy creation)
    let session = getSession(sessionId)
    if (!session) {
      session = createSession(sessionId)
    }

    const updatedSession = completeSession(sessionId, {
      address,
      chainId,
      did,
      credentialId,
      userDocumentId,
      connectDid,
    })

    if (!updatedSession) {
      res.status(404).json({ error: 'Session not found or expired' })
      return
    }

    res.status(200).json({
      sessionId: updatedSession.sessionId,
      status: updatedSession.status,
    })
  } else if (req.method === 'DELETE') {
    // Delete a session - called if user cancels
    deleteSession(sessionId)
    res.status(200).json({ success: true })
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

export default allowCors(handler)
