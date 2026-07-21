import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next'

const ORIGIN_URL = process.env.ORIGIN_URL || '*'

// Wraps an API handler with permissive CORS so any external domain can call it.
// Lives under utils/ (not pages/api/) so it can't be mistaken for a route.
export const allowCors =
  (fn: NextApiHandler) => async (req: NextApiRequest, res: NextApiResponse) => {
    // No Allow-Credentials: it is invalid with Origin '*', and these endpoints
    // authenticate via signed request payloads, not cross-origin cookies.
    res.setHeader('Access-Control-Allow-Origin', ORIGIN_URL)
    res.setHeader('Access-Control-Allow-Methods', 'GET,DELETE,PATCH,POST,PUT')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
    )
    if (req.method === 'OPTIONS') {
      res.status(200).end()
      return
    }
    await fn(req, res)
  }
