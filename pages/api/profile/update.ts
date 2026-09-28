// Profile write, forwarded to the switchboard's self-authenticating
// renown_upsertProfile (see services/renown-profile-write.ts).
import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../../../utils/allow-cors'
import { CredentialWriteError } from '../../../services/renown-credential'
import { upsertProfile } from '../../../services/renown-profile-write'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { address, username, userImage, signature, timestamp } = (req.body ?? {}) as {
    address?: string
    username?: string | null
    userImage?: string | null
    signature?: string
    timestamp?: string
  }

  if (!address) {
    res.status(400).json({ error: 'address is required' })
    return
  }
  if (!signature || !timestamp) {
    res.status(401).json({ error: 'A signature and timestamp are required to update a profile' })
    return
  }

  try {
    const documentId = await upsertProfile({ address, username, userImage, signature, timestamp })
    res.status(200).json({ result: true, documentId })
  } catch (e) {
    if (e instanceof CredentialWriteError) {
      res.status(e.status).json({ error: e.message, code: e.code })
      return
    }
    console.error('Failed to update profile:', e)
    res.status(500).json({ error: 'Failed to update profile', details: String(e) })
  }
}

export default allowCors(handler)
