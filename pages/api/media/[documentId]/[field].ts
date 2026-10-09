// GET /media/<documentId>/<field> (rewritten here by next.config.ts): asks the
// switchboard's media route and passes its answer on — a 302 to a short-lived
// signed URL, or (on a switchboard storing files on disk) the bytes. The
// redirect is cacheable for a minute; a missing image is a cacheable 404 so
// <img> falls back quickly. A `?v=<hash>` query is a cache-busting key for
// the caller's URL only: it is not forwarded, the upstream route ignores it.
import type { NextApiRequest, NextApiResponse } from 'next'
import { isMediaField, packageRoutesBase } from '../../../../services/media'

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=240'
const DOCUMENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/

function notFound(res: NextApiResponse): void {
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.status(404).json({ error: 'Not found' })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const documentId = String(req.query.documentId ?? '')
  const field = String(req.query.field ?? '')
  if (!DOCUMENT_ID_RE.test(documentId) || !isMediaField(field)) return notFound(res)

  let upstream: Response
  try {
    upstream = await fetch(
      `${packageRoutesBase()}/media/${encodeURIComponent(documentId)}/${field}`,
      { redirect: 'manual' },
    )
  } catch (error) {
    console.error('Media lookup failed:', error)
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: 'Media unavailable' })
    return
  }

  const location = upstream.headers.get('location')
  if (upstream.status === 302 && location) {
    res.setHeader('Cache-Control', CACHE_CONTROL)
    res.redirect(302, location)
    return
  }
  if (upstream.status === 200) {
    res.setHeader('Cache-Control', CACHE_CONTROL)
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.status(200).send(Buffer.from(await upstream.arrayBuffer()))
    return
  }
  if (upstream.status >= 500) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(upstream.status === 503 ? 503 : 502).json({ error: 'Media unavailable' })
    return
  }
  notFound(res)
}
