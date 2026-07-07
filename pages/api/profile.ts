import { NextApiRequest, NextApiResponse } from 'next/types'
import { allowCors } from './[utils]'
import { queryRenownUsers, type RenownUsersInput } from '../../services/switchboard'
import { DEFAULT_DRIVE_ID } from '../../utils/constants'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const body = req.body

    if (!body.id && !body.ethAddress && !body.username) {
      res.status(400).json({ error: 'Either id, ethAddress, or username is required' })
      return
    }

    // Use user-specific drive when querying by ethAddress
    let driveId = body.driveId
    if (!driveId && body.ethAddress) {
      driveId = `renown-${body.ethAddress.toLowerCase()}`
    } else if (!driveId) {
      driveId = DEFAULT_DRIVE_ID
    }

    const input: RenownUsersInput = {
      driveId,
      ...(body.id && { phids: [body.id] }),
      ...(body.ethAddress && { ethAddresses: [body.ethAddress.toLowerCase()] }),
      ...(body.username && { usernames: [body.username] }),
    }

    try {
      const users = await queryRenownUsers(input)

      // Return first result or null
      const profile = users.length > 0 ? users[0] : null
      res.status(200).json({ profile })
    } catch (e) {
      console.error('Failed to fetch profile:', e)
      res.status(500).json({ error: 'Failed to fetch profile' })
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

export default allowCors(handler)
