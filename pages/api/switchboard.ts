import { NextApiRequest, NextApiResponse } from 'next'
import { allowCors } from '../../utils/allow-cors'

const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  'https://switchboard.renown.vetra.io/graphql'

// Discovery endpoint: lets an updated @renown/sdk read from the Switchboard
// reactor directly. Absent on old deployments, so the SDK falls back to REST.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  res.status(200).json({ endpoint: SWITCHBOARD_ENDPOINT })
}

export default allowCors(handler)
