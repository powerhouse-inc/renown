// Credential writes, forwarded to the switchboard's self-authenticating
// renown_* mutations (see services/renown-credential.ts).
import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../../../utils/allow-cors'
import {
  CredentialWriteError,
  issueCredential,
  issuerAddressOf,
  revokeCredential,
  type EIP712Credential,
} from '../../../services/renown-credential'

interface EIP712Domain {
  version: string
  chainId: bigint | number
}

function sendWriteError(res: NextApiResponse, e: unknown, message: string) {
  if (e instanceof CredentialWriteError) {
    res.status(e.status).json({ error: e.message, code: e.code })
    return
  }
  console.error(`${message}:`, e)
  res.status(500).json({ error: message, details: String(e) })
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // Store an EIP-712 delegation credential
    const { docId, credential, signature, domain, username, userImage } = req.body as {
      driveId?: string
      docId?: string
      credential: EIP712Credential
      signature: string
      domain: EIP712Domain
      username?: string
      userImage?: string | null
    }

    if (!credential || !signature || !domain) {
      res.status(400).json({ error: 'credential, signature, and domain are required' })
      return
    }

    const ethAddress = issuerAddressOf(credential)
    if (!ethAddress) {
      res.status(400).json({ error: 'Cannot determine user identity - address not found in credential' })
      return
    }

    try {
      const { documentId, userDocumentId } = await issueCredential({
        credential,
        signature,
        domain,
        ethAddress,
        username,
        userImage,
        docId,
      })
      res.status(200).json({
        result: true,
        documentId,
        credentialId: documentId,
        userDocumentId,
      })
    } catch (e) {
      sendWriteError(res, e, 'Failed to store credential')
    }
  } else if (req.method === 'DELETE') {
    // Revoke a credential by its VC id, authorized by the issuer's
    // personal_sign of revokeMessage(credentialId, timestamp).
    const { credentialId, signature, timestamp, address, reason } = (req.body ?? {}) as {
      credentialId?: string
      signature?: string
      timestamp?: string
      address?: string
      reason?: string
    }

    if (!credentialId) {
      res.status(400).json({ error: 'credentialId is required' })
      return
    }
    if (!signature || !timestamp) {
      res.status(401).json({ error: 'A signature and timestamp are required to revoke a credential' })
      return
    }

    try {
      await revokeCredential({ credentialId, signature, timestamp, address, reason })
      res.status(200).json({ result: true })
    } catch (e) {
      sendWriteError(res, e, 'Failed to revoke credential')
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

export default allowCors(handler)
