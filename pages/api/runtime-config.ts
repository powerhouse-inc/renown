import type { NextApiRequest, NextApiResponse } from 'next'
import { runtimeConfigScript, serverConfig } from '../../lib/runtime-config'

/**
 * The browser's settings, read from this server's environment when it
 * started (lib/runtime-config.ts). _document loads it before the app starts,
 * on every page: most pages are prerendered at build, so their HTML cannot
 * carry what a deployment sets at start.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  // The settings change only when the server restarts.
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.status(200).send(runtimeConfigScript(serverConfig()))
}
