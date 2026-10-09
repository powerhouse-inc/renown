// Profile write, forwarded to the switchboard's self-authenticating
// renown_upsertProfile (see services/renown-profile-write.ts).
import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from '../../../utils/allow-cors'
import { CredentialWriteError } from '../../../services/renown-credential'
import { upsertProfile } from '../../../services/renown-profile-write'
import type { ProfileFields } from '../../../services/renown-signed-messages'

type Body = ProfileFields & { address?: string; signature?: string; timestamp?: string }

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = (req.body ?? {}) as Body
  const { address, signature, timestamp } = body

  if (!address) {
    res.status(400).json({ error: 'address is required' })
    return
  }
  if (!signature || !timestamp) {
    res.status(401).json({ error: 'A signature and timestamp are required to update a profile' })
    return
  }

  try {
    const documentId = await upsertProfile({
      address,
      username: body.username,
      userImage: body.userImage,
      displayName: body.displayName,
      handle: body.handle,
      bio: body.bio,
      links: body.links,
      avatar: body.avatar,
      signature,
      timestamp,
    })
    res.status(200).json({ result: true, documentId })
  } catch (e) {
    if (e instanceof CredentialWriteError) {
      res.status(e.status).json({ error: e.message, code: e.code, field: e.field })
      return
    }
    console.error('Failed to update profile:', e)
    res.status(500).json({ error: 'Failed to update profile', details: String(e) })
  }
}

export default allowCors(handler)
