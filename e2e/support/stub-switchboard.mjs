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
//
// Unscripted requests get empty read-model results, so pages rendered by other
// specs keep working.
import http from 'node:http'

const port = Number(process.env.STUB_SWITCHBOARD_PORT || 4799)

let script = []
let requests = []

const DEFAULT_DATA = {
  renownUsers: [],
  renownUser: null,
  renownCredentials: [],
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  res.end(JSON.stringify(body))
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
