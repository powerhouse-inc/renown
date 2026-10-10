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
//   POST /__stub/fixture/remove  { id } — drops the fixtures added with that id
//
// renown-package HTTP routes (stateless, safe in parallel):
//   POST /api/@powerhousedao/renown-package/media/uploads   401 without a
//        bearer; else 201 with an uploadTarget on this stub
//   PUT  /__stub/s3/<sha256>   stores the bytes (checks the hash)
//   GET  /__stub/s3/<sha256>   serves them
//   GET  /api/@powerhousedao/renown-package/media/<doc>/<field>   302 to
//        /__stub/og/<webp|avif|svg|badwebp|bomb>   OG image fixtures
//        /__stub/s3/<STUB_AVATAR_SHA> for "stub-avatar-doc" + avatar and "stub-app-doc" + logo/cover, else 404
//
// Unscripted requests get empty read-model results, so pages rendered by other
// specs keep working.
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import http from 'node:http'
import { crc32, deflateSync } from 'node:zlib'

const port = Number(process.env.STUB_SWITCHBOARD_PORT || 4799)

/** A PNG whose header claims `size` x `size` 1-bit pixels, all zero: a few KB that decode to `size`^2 pixels. */
function pixelBombPng(size) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 1 // bit depth
  header[9] = 0 // greyscale
  const rows = Buffer.alloc(size * (1 + Math.ceil(size / 8)))
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Images the OG route converts with sharp (e2e/og.spec.ts): valid WebP/AVIF/SVG,
// a WebP with corrupt bytes, and a 64-megapixel PNG (over the 40 MP limit).
const OG_IMAGES = {
  webp: { type: 'image/webp', bytes: () => Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvB8ABAAfQ/4aUtv+BiOh/AAA=', 'base64') },
  avif: {
    type: 'image/avif',
    bytes: () =>
      Buffer.from(
        'AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAD6AAEAAAAAAAAAHQAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAgAAAAIAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAlbWRhdBIACgg4CL9hAQ0GkDIPGAAAAEAAsAxmyziV6Ug4',
        'base64',
      ),
  },
  svg: {
    type: 'image/svg+xml',
    bytes: () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#0080ff"/></svg>'),
  },
  badwebp: { type: 'image/webp', bytes: () => Buffer.concat([Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1'), Buffer.alloc(64, 0x5a)]) },
  bomb: { type: 'image/png', bytes: () => pixelBombPng(8000) },
}

// Real multi-colour pictures (four vertical bands, red/green/blue/yellow), as PNG and
// WebP, to prove the OG route draws the picture and not a flat colour.
const bands = (width) =>
  Buffer.concat(
    [[230, 30, 30], [30, 200, 60], [30, 90, 240], [250, 210, 20]].map(([r, g, b]) => Buffer.alloc((width / 4) * 3, Buffer.from([r, g, b]))),
  )
async function bandedImage(format, width, height) {
  const row = bands(width)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return sharp(raw, { raw: { width, height, channels: 3 } })[format]().toBuffer()
}
OG_IMAGES.photopng = { type: 'image/png', bytes: await bandedImage('png', 800, 800) }
OG_IMAGES.photowebp = { type: 'image/webp', bytes: await bandedImage('webp', 800, 800) }
const solid = (r, g, b) => sharp({ create: { width: 1200, height: 630, channels: 3, background: { r, g, b } } }).png().toBuffer()
OG_IMAGES.whitecover = { type: 'image/png', bytes: await solid(255, 255, 255) }
OG_IMAGES.yellowcover = { type: 'image/png', bytes: await solid(255, 255, 0) }
OG_IMAGES.photocover = { type: 'image/png', bytes: await bandedImage('png', 1600, 840) }
for (const key of ['photopng', 'photowebp', 'photocover', 'whitecover', 'yellowcover']) {
  const { bytes } = OG_IMAGES[key]
  OG_IMAGES[key].bytes = () => bytes
}

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
  appProfiles: { items: [], next: null },
  appProfileCategories: [],
  renownNetworkStats: null,
  appStats: null,
  userStats: [],
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
    // Fixtures for the OG route's image guards (e2e/og.spec.ts).
    const hostile = {
      'stub-text-doc': `http://localhost:${port}/__stub/og/text`,
      'stub-huge-doc': `http://localhost:${port}/__stub/og/huge`,
      'stub-evil-doc': 'https://evil.example/avatar.png',
      'stub-loop-doc': `http://localhost:${port}/__stub/og/loop1`,
      'stub-webp-doc': `http://localhost:${port}/__stub/og/webp`,
      'stub-avif-doc': `http://localhost:${port}/__stub/og/avif`,
      'stub-svg-doc': `http://localhost:${port}/__stub/og/svg`,
      'stub-badwebp-doc': `http://localhost:${port}/__stub/og/badwebp`,
      'stub-bomb-doc': `http://localhost:${port}/__stub/og/bomb`,
      'stub-photopng-doc': `http://localhost:${port}/__stub/og/photopng`,
      'stub-photowebp-doc': `http://localhost:${port}/__stub/og/photowebp`,
      'stub-whitecover-doc': `http://localhost:${port}/__stub/og/whitecover`,
      'stub-yellowcover-doc': `http://localhost:${port}/__stub/og/yellowcover`,
      'stub-photocover-doc': `http://localhost:${port}/__stub/og/photocover`,
    }
    if (hostile[media[1]]) {
      res.writeHead(302, { Location: hostile[media[1]] })
      return res.end()
    }
    if (media[1] === 'stub-broken-doc') return send(res, 500, { error: 'boom' })
    return send(res, 404, { error: 'Not found' })
  }
  const og = /^\/__stub\/og\/(text|huge|webp|avif|svg|badwebp|bomb|photopng|photowebp|photocover|whitecover|yellowcover|loop1|loop2|loop3)$/.exec(url.pathname)
  if (og && req.method === 'GET') {
    if (og[1] === 'text') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      return res.end('not an image')
    }
    const image = OG_IMAGES[og[1]]
    if (image) {
      res.writeHead(200, { 'Content-Type': image.type })
      return res.end(image.bytes())
    }
    if (og[1] === 'huge') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      return res.end(Buffer.alloc(5 * 1024 * 1024))
    }
    const next = { loop1: 'loop2', loop2: 'loop3', loop3: 'loop1' }[og[1]]
    res.writeHead(302, { Location: `http://localhost:${port}/__stub/og/${next}` })
    return res.end()
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
    if (req.url === '/__stub/fixture/remove' && req.method === 'POST') {
      const { id } = await readBody(req)
      for (let i = fixtures.length - 1; i >= 0; i--) if (fixtures[i].id === id) fixtures.splice(i, 1)
      return send(res, 200, { ok: true })
    }
    if (req.url === '/__stub/fixture' && req.method === 'POST') {
      fixtures.push(await readBody(req))
      return send(res, 200, { ok: true })
    }
    if (req.url?.startsWith(PACKAGE) || req.url?.startsWith('/__stub/s3/') || req.url?.startsWith('/__stub/og/')) {
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
