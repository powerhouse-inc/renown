// POST /api/org/<mutation> { args, auth }: a signed renown-orgs write, checked
// against services/org-mutations.ts and forwarded unchanged to the switchboard
// (which verifies the signature). Like /api/profile/update, no request carries
// a bearer.
import type { NextApiRequest, NextApiResponse } from 'next'
import { statusForOrgError } from '../../../lib/orgs/errors'
import { argsProblem, isOrgMutationName } from '../../../services/org-mutations'
import { forwardOrgMutation, parseOrgAuth } from '../../../services/org-write'
import { toOrgApiError } from '../../../services/orgs'
import { allowCors } from '../../../utils/allow-cors'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  const name = String(req.query.mutation ?? '')
  if (!isOrgMutationName(name)) {
    res.status(404).json({ error: 'Unknown organisation action', code: 'NOT_FOUND' })
    return
  }
  const body = (isRecord(req.body) ? req.body : {}) as { args?: unknown; auth?: unknown }
  if (!isRecord(body.args)) {
    res.status(400).json({ error: 'args must be an object', code: 'BAD_USER_INPUT', field: 'args' })
    return
  }
  const problem = argsProblem(name, body.args)
  if (problem) {
    res.status(400).json({ error: `Unexpected or missing argument: ${problem}`, code: 'BAD_USER_INPUT', field: problem })
    return
  }
  const auth = parseOrgAuth(body.auth)
  if (!auth) {
    res.status(401).json({ error: 'A signature is required', code: 'FORBIDDEN', field: 'auth' })
    return
  }
  try {
    res.status(200).json({ data: await forwardOrgMutation(name, body.args, auth) })
  } catch (error) {
    const failure = toOrgApiError(error)
    if (failure.code === 'NETWORK') console.error(`Organisation write ${name} failed:`, error instanceof Error ? error.name : 'error')
    res.status(statusForOrgError(failure.code)).json({ error: failure.message, code: failure.code, field: failure.field })
  }
}

export default allowCors(handler)
