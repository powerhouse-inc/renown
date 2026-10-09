// Code samples on /developers. Every API used here exists in @renown/sdk 6.2.3
// (RenownBuilder, renown.did, renown.login, renown.getBearerToken,
// verifyAuthBearerToken, fetchDelegationCredential); keep them in sync with it.
import type { CodeLang } from '../../lib/highlight'
import { DEFAULT_OIDC_ISSUER } from '../../services/oidc'

export type SnippetKey = 'install' | 'identity' | 'callback' | 'bearer' | 'verify' | 'oidc' | 'graphql' | 'graphqlCurl'

export const SNIPPETS: Record<SnippetKey, { code: string; lang: CodeLang; label: string }> = {
  install: { lang: 'bash', label: 'Terminal', code: 'pnpm add @renown/sdk' },
  identity: {
    lang: 'ts',
    label: 'app.ts',
    code: `import { RenownBuilder } from '@renown/sdk'

// Creates (once) and stores your app's key pair in the browser.
const renown = await new RenownBuilder('my-app').build()

// Your app's identity: pass it as ?connect= in the connect link.
const connectUrl = \`https://www.renown.id/?connect=\${renown.did}&returnUrl=\${encodeURIComponent(location.href)}\``,
  },
  callback: {
    lang: 'ts',
    label: 'callback.ts',
    code: `// Back from Renown: ?user=did:pkh:eip155:<chainId>:<address>
const user = new URL(location.href).searchParams.get('user')
if (user) {
  // Loads the credential the user just signed for renown.did.
  await renown.login(decodeURIComponent(user))
}`,
  },
  bearer: {
    lang: 'ts',
    label: 'api-client.ts',
    code: `// A short-lived token signed by your app key, for your own API.
const token = await renown.getBearerToken({ expiresIn: 600 })
await fetch('/api/notes', { headers: { Authorization: \`Bearer \${token}\` } })`,
  },
  verify: {
    lang: 'ts',
    label: 'server.ts',
    code: `import { verifyAuthBearerToken, fetchDelegationCredential } from '@renown/sdk'

export async function authenticate(token: string) {
  // 1. The token is well-formed, unexpired and signed by its issuer (your app key).
  const jwt = await verifyAuthBearerToken(token)
  if (!jwt) return null
  // 2. The wallet in the token really authorised that key: an unrevoked,
  //    unexpired credential exists on Renown.
  const { address, chainId } = jwt.verifiableCredential.credentialSubject
  const grant = await fetchDelegationCredential({ address, chainId, appDid: jwt.issuer })
  return grant ? { address, chainId } : null
}`,
  },
  oidc: {
    lang: 'bash',
    label: 'Terminal',
    code: `curl ${DEFAULT_OIDC_ISSUER}/.well-known/openid-configuration`,
  },
  graphql: {
    lang: 'graphql',
    label: 'renown-stats',
    code: `query {
  appProfiles(limit: 5) {
    items { appDid name tagline category }
    next
  }
}`,
  },
  graphqlCurl: {
    lang: 'bash',
    label: 'Terminal',
    code: `curl -s https://switchboard.renown.vetra.io/graphql/renown-stats \\
  -H 'content-type: application/json' \\
  -d '{"query":"{ appProfiles(limit: 5) { items { appDid name } next } }"}'`,
  },
}
