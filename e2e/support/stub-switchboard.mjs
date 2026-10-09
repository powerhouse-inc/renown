// A scriptable stand-in for the Renown switchboard's GraphQL endpoint, so the
// app's API routes (which call the switchboard server-side, out of reach of
// `page.route`) can be tested. Started by playwright.config.ts; the dev server
// is pointed at it through NEXT_PUBLIC_SWITCHBOARD_ENDPOINT.
//
//   POST /graphql            records the request, answers from the script
//   POST /__stub/script      { match, variables?, response } — the next GraphQL
//                            request whose query contains `match` (and whose
//                            variables JSON contains `variables`, if given) is
//                            answered with `response`; one use per entry
//   GET  /__stub/requests    every recorded GraphQL request
//   POST /__stub/reset       clears script and recordings
//   POST /__stub/fixture     { match, variables?, response } — answers every
//                            matching GraphQL request (after the script), and
//                            survives /__stub/reset; for specs that run in
//                            parallel with the scripting ones (unique variables!)
//
// renown-package HTTP routes (stateless, safe in parallel):
//   POST /api/@powerhousedao/renown-package/media/uploads   401 without a
//        bearer; else 201 with an uploadTarget on this stub
//   PUT  /__stub/s3/<sha256>   stores the bytes (checks the hash)
//   GET  /__stub/s3/<sha256>   serves them
//   GET  /api/@powerhousedao/renown-package/media/<doc>/<field>   302 to
//        /__stub/s3/<STUB_AVATAR_SHA> for "stub-avatar-doc" + avatar and "stub-app-doc" + logo/cover, else 404
//
// Unscripted requests get empty read-model results, so pages rendered by other
// specs keep working.
import { createHash } from 'node:crypto'
import http from 'node:http'

const port = Number(process.env.STUB_SWITCHBOARD_PORT || 4799)

let script = []
let requests = []
const fixtures = []
const objects = new Map()
const PACKAGE = '/api/@powerhousedao/renown-package'
// sha256 of the 1x1 PNG below, served for doc "stub-avatar-doc".
const STUB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const STUB_AVATAR_SHA = createHash('sha256').update(STUB_PNG).digest('hex')
objects.set(STUB_AVATAR_SHA, { type: 'image/png', bytes: STUB_PNG })

const DEFAULT_DATA = {
  renownUsers: [],
  renownUser: null,
  renownCredentials: [],
  appProfile: null,
  appProfilesByPublisher: [],
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  })
  res.end(JSON.stringify(body))
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function packageRoute(req, res) {
  const url = new URL(req.url, 'http://stub')
  if (url.pathname === `${PACKAGE}/media/uploads` && req.method === 'POST') {
    if (!/^Bearer \S+/.test(req.headers.authorization ?? '')) {
      return send(res, 401, { code: 'UNAUTHENTICATED', error: 'A Renown bearer token is required' })
    }
    const body = JSON.parse((await readRaw(req)).toString() || '{}')
    return send(res, 201, {
      ref: `attachment://v1:${body.sha256}`,
      reservationId: `res-${body.sha256.slice(0, 8)}`,
      expiresAtUtc: new Date(Date.now() + 900_000).toISOString(),
      uploadTarget: {
        method: 'PUT',
        url: `http://localhost:${port}/__stub/s3/${body.sha256}`,
        headers: { 'content-type': body.mimeType },
      },
    })
  }
  const media = /^\/api\/@powerhousedao\/renown-package\/media\/([^/]+)\/([^/]+)$/.exec(url.pathname)
  if (media && req.method === 'GET') {
    const stored =
      (media[1] === 'stub-avatar-doc' && media[2] === 'avatar') ||
      (media[1] === 'stub-app-doc' && (media[2] === 'logo' || media[2] === 'cover'))
    if (stored) {
      res.writeHead(302, {
        Location: `http://localhost:${port}/__stub/s3/${STUB_AVATAR_SHA}`,
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=240',
      })
      return res.end()
    }
    if (media[1] === 'stub-broken-doc') return send(res, 500, { error: 'boom' })
    return send(res, 404, { error: 'Not found' })
  }
  const object = /^\/__stub\/s3\/([0-9a-f]{64})$/.exec(url.pathname)
  if (object && req.method === 'PUT') {
    const bytes = await readRaw(req)
    if (createHash('sha256').update(bytes).digest('hex') !== object[1]) return send(res, 400, { error: 'BadDigest' })
    objects.set(object[1], { type: req.headers['content-type'] ?? 'application/octet-stream', bytes })
    return send(res, 200, {})
  }
  if (object && req.method === 'GET') {
    const stored = objects.get(object[1])
    if (!stored) return send(res, 404, { error: 'NoSuchKey' })
    res.writeHead(200, { 'Content-Type': stored.type, 'Access-Control-Allow-Origin': '*' })
    return res.end(stored.bytes)
  }
  return false
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  try {
    if (req.url === '/__stub/reset' && req.method === 'POST') {
      script = []
      requests = []
      return send(res, 200, { ok: true })
    }
    if (req.url === '/__stub/script' && req.method === 'POST') {
      script.push(await readBody(req))
      return send(res, 200, { ok: true })
    }
    if (req.url === '/__stub/fixture' && req.method === 'POST') {
      fixtures.push(await readBody(req))
      return send(res, 200, { ok: true })
    }
    if (req.url?.startsWith(PACKAGE) || req.url?.startsWith('/__stub/s3/')) {
      const handled = await packageRoute(req, res)
      if (handled !== false) return
    }
    if (req.url === '/__stub/requests' && req.method === 'GET') {
      return send(res, 200, requests)
    }
    if (req.url?.startsWith('/graphql') && req.method === 'POST') {
      const body = await readBody(req)
      const query = String(body.query ?? '')
      const variables = JSON.stringify(body.variables ?? {})
      requests.push({ query, variables: body.variables ?? {}, headers: req.headers })
      const index = script.findIndex(
        (entry) => query.includes(entry.match) && (!entry.variables || variables.includes(entry.variables)),
      )
      if (index !== -1) {
        const [entry] = script.splice(index, 1)
        return send(res, entry.status ?? 200, entry.response)
      }
      const fixture = fixtures.find(
        (entry) => query.includes(entry.match) && (!entry.variables || variables.includes(entry.variables)),
      )
      if (fixture) return send(res, fixture.status ?? 200, fixture.response)
      return send(res, 200, { data: DEFAULT_DATA })
    }
    if (req.method === 'GET') return send(res, 200, { ok: true })
    return send(res, 404, { error: 'not found' })
  } catch (e) {
    return send(res, 500, { error: String(e) })
  }
})

server.listen(port, () => {
  console.log(`stub switchboard listening on ${port}`)
})
