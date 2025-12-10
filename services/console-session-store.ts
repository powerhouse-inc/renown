/**
 * In-memory store for console login sessions.
 * Sessions expire after 5 minutes to prevent memory leaks.
 */

export interface ConsoleSession {
  sessionId: string
  status: 'pending' | 'ready'
  createdAt: number
  address?: string
  chainId?: number
  did?: string
  connectDid?: string // The CLI's DID that was authorized
  credentialId?: string
  userDocumentId?: string
}

const SESSION_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

// In-memory store for sessions
const sessions = new Map<string, ConsoleSession>()

// Cleanup expired sessions periodically
let cleanupInterval: NodeJS.Timeout | null = null

function startCleanup() {
  if (cleanupInterval) return
  cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [sessionId, session] of sessions.entries()) {
      if (now - session.createdAt > SESSION_EXPIRY_MS) {
        sessions.delete(sessionId)
      }
    }
  }, 60 * 1000) // Run cleanup every minute
}

export function createSession(sessionId: string): ConsoleSession {
  startCleanup()

  const session: ConsoleSession = {
    sessionId,
    status: 'pending',
    createdAt: Date.now(),
  }
  sessions.set(sessionId, session)
  return session
}

export function getSession(sessionId: string): ConsoleSession | null {
  const session = sessions.get(sessionId)
  if (!session) return null

  // Check if expired
  if (Date.now() - session.createdAt > SESSION_EXPIRY_MS) {
    sessions.delete(sessionId)
    return null
  }

  return session
}

export function completeSession(
  sessionId: string,
  data: {
    address: string
    chainId: number
    did: string
    credentialId: string
    userDocumentId?: string
    connectDid?: string
  }
): ConsoleSession | null {
  const session = sessions.get(sessionId)
  if (!session) return null

  // Check if expired
  if (Date.now() - session.createdAt > SESSION_EXPIRY_MS) {
    sessions.delete(sessionId)
    return null
  }

  session.status = 'ready'
  session.address = data.address
  session.chainId = data.chainId
  session.did = data.did
  session.credentialId = data.credentialId
  session.userDocumentId = data.userDocumentId
  session.connectDid = data.connectDid

  return session
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId)
}
