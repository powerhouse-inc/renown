import { runtimeConfig } from '../../lib/runtime-config'
import { NextApiRequest, NextApiResponse } from 'next'
import { allowCors } from '../../utils/allow-cors'

const SWITCHBOARD_ENDPOINT =
  runtimeConfig().switchboardEndpoint

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
