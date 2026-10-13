// GET /org/<id>/did.json (rewritten here by next.config.ts): the did:web
// document of did:web:<host>:org:<id>, as renown-orgs builds it
// (organizationDidDocument). 404 when unknown, archived or taken down (the
// switchboard answers null for all three); 503 on an outage or RATE_LIMITED.
import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchOrganizationDidDocument } from '../../../services/orgs'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../../../utils/with-timeout'

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const id = String(req.query.id ?? '')
  if (!ID_RE.test(id)) {
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.status(404).json({ error: 'Not found' })
    return
  }
  let document: string | null
  try {
    document = await withTimeout(fetchOrganizationDidDocument(id, req), SSR_DATA_TIMEOUT_MS)
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    res.status(503).json({ error: 'DID documents are temporarily unavailable' })
    return
  }
  if (!document) {
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.status(404).json({ error: 'Not found' })
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(document)
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: 'The DID document could not be read' })
    return
  }
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60')
  res.status(200).json(parsed)
}
