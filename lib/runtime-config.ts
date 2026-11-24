// The settings one image needs per deployment: given when the app starts,
// over the values baked into the build. A deployment that gives none (as
// renown.id's does) keeps exactly the baked values, so one image serves any
// Renown: www.renown.id, or a company's own at https://renown.<domain>.
//
// The server reads its environment; the browser gets the same values from
// /api/runtime-config (pages/api/runtime-config.ts), which _document loads
// before the app starts. Only public values are here: never a token or key.

export type PublicConfig = {
  /** This Renown's public origin; '' when unset (readers fall back to the request host or www.renown.id). */
  renownUrl: string
  /** The switchboard's GraphQL endpoint. */
  switchboardEndpoint: string
  /** The OIDC issuer apps configure; '' when unset (Renown's default). */
  oidcIssuer: string
  /** Where a sign-in with nowhere else to return to goes; '' when unset. */
  connectUrl: string
  privyAppId: string
  privyClientId: string
  walletConnectProjectId: string
  infuraProjectId: string
  openPanelClientId: string
  openPanelApiUrl: string
  /** The drive profiles live in. */
  driveId: string
  /** OpenPanel and Umami; off only when RENOWN_ANALYTICS=off. */
  analytics: boolean
}

type Env = Record<string, string | undefined>

/**
 * The values the build baked in. Each is read by its literal name so that
 * Next inlines it into both bundles; a name read any other way is undefined
 * in the browser.
 */
const BAKED: Env = {
  NEXT_PUBLIC_RENOWN_URL: process.env.NEXT_PUBLIC_RENOWN_URL,
  NEXT_PUBLIC_SWITCHBOARD_ENDPOINT: process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT,
  NEXT_PUBLIC_RENOWN_OIDC_ISSUER: process.env.NEXT_PUBLIC_RENOWN_OIDC_ISSUER,
  NEXT_PUBLIC_CONNECT_URL: process.env.NEXT_PUBLIC_CONNECT_URL,
  NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  NEXT_PUBLIC_PRIVY_CLIENT_ID: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID,
  NEXT_PUBLIC_VITE_WALLET_CONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_VITE_WALLET_CONNECT_PROJECT_ID,
  NEXT_PUBLIC_VITE_INFURA_PROJECT_ID: process.env.NEXT_PUBLIC_VITE_INFURA_PROJECT_ID,
  NEXT_PUBLIC_OPENPANEL_CLIENT_ID: process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID,
  NEXT_PUBLIC_OPENPANEL_API_URL: process.env.NEXT_PUBLIC_OPENPANEL_API_URL,
  NEXT_PUBLIC_RENOWN_DRIVE_ID: process.env.NEXT_PUBLIC_RENOWN_DRIVE_ID,
}

/** Each string setting: its name at start, and the name the build baked it under. */
const NAMES = {
  renownUrl: ['RENOWN_URL', 'NEXT_PUBLIC_RENOWN_URL'],
  switchboardEndpoint: ['SWITCHBOARD_ENDPOINT', 'NEXT_PUBLIC_SWITCHBOARD_ENDPOINT'],
  oidcIssuer: ['RENOWN_OIDC_ISSUER', 'NEXT_PUBLIC_RENOWN_OIDC_ISSUER'],
  connectUrl: ['CONNECT_URL', 'NEXT_PUBLIC_CONNECT_URL'],
  privyAppId: ['PRIVY_APP_ID', 'NEXT_PUBLIC_PRIVY_APP_ID'],
  privyClientId: ['PRIVY_CLIENT_ID', 'NEXT_PUBLIC_PRIVY_CLIENT_ID'],
  walletConnectProjectId: ['WALLET_CONNECT_PROJECT_ID', 'NEXT_PUBLIC_VITE_WALLET_CONNECT_PROJECT_ID'],
  infuraProjectId: ['INFURA_PROJECT_ID', 'NEXT_PUBLIC_VITE_INFURA_PROJECT_ID'],
  openPanelClientId: ['OPENPANEL_CLIENT_ID', 'NEXT_PUBLIC_OPENPANEL_CLIENT_ID'],
  openPanelApiUrl: ['OPENPANEL_API_URL', 'NEXT_PUBLIC_OPENPANEL_API_URL'],
  driveId: ['RENOWN_DRIVE_ID', 'NEXT_PUBLIC_RENOWN_DRIVE_ID'],
} as const satisfies Record<Exclude<keyof PublicConfig, 'analytics'>, readonly [string, string]>

/**
 * The settings from the environment at start, then the baked values, then
 * today's defaults. An empty value counts as unset. A Privy app and its
 * client, and an OpenPanel client and its API, are pairs: when the first is
 * given at start, its partner comes from the start too (empty when not
 * given), never from the build, which names another app's.
 */
export function serverConfig(env: Env = process.env, baked: Env = BAKED): PublicConfig {
  const pick = ([runtime, built]: readonly [string, string]): string => env[runtime] || baked[built] || ''
  const pair = (first: readonly [string, string], partner: readonly [string, string]): [string, string] =>
    env[first[0]] ? [env[first[0]]!, env[partner[0]] || ''] : [baked[first[1]] || '', baked[partner[1]] || '']
  const [privyAppId, privyClientId] = pair(NAMES.privyAppId, NAMES.privyClientId)
  const [openPanelClientId, openPanelApiUrl] = pair(NAMES.openPanelClientId, NAMES.openPanelApiUrl)
  return {
    renownUrl: pick(NAMES.renownUrl),
    // Only `next dev` falls back to a local switchboard: a production build
    // with nothing set must never point browsers at localhost.
    switchboardEndpoint:
      pick(NAMES.switchboardEndpoint) ||
      (env.NODE_ENV === 'development' ? 'http://localhost:4001/graphql' : 'https://switchboard.renown.vetra.io/graphql'),
    oidcIssuer: pick(NAMES.oidcIssuer),
    connectUrl: pick(NAMES.connectUrl),
    privyAppId,
    privyClientId,
    walletConnectProjectId: pick(NAMES.walletConnectProjectId),
    infuraProjectId: pick(NAMES.infuraProjectId),
    openPanelClientId,
    openPanelApiUrl,
    driveId: pick(NAMES.driveId) || 'renown-profiles',
    analytics: env.RENOWN_ANALYTICS !== 'off',
  }
}

declare global {
  interface Window {
    __RENOWN_CONFIG__?: PublicConfig
  }
}

/** In the browser: what /api/runtime-config set, else the baked values (the script did not load). */
export function publicConfig(): PublicConfig {
  return window.__RENOWN_CONFIG__ ?? serverConfig({ NODE_ENV: process.env.NODE_ENV }, BAKED)
}

/** The settings wherever this runs: the server's environment, or what the browser was given. */
export function runtimeConfig(): PublicConfig {
  return typeof window === 'undefined' ? serverConfig() : publicConfig()
}

// Umami (self-hosted) counts renown.vetra.io and www.renown.id and nothing
// else (previews, local development, other deployments).
const UMAMI = {
  src: 'https://umami.monitoring.vetra.io/script.js',
  websiteId: 'c5102484-ab3d-4c46-9198-0fbe81f27789',
  domains: 'renown.vetra.io,www.renown.id',
}

/** JSON as a script literal in which no value can end the script or start markup. */
const scriptJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

/** The body of /api/runtime-config: the settings for the browser, and Umami when analytics is on. */
export function runtimeConfigScript(config: PublicConfig): string {
  let script = `window.__RENOWN_CONFIG__=${scriptJson(config)};`
  if (config.analytics) {
    script +=
      `(function(){var s=document.createElement('script');s.defer=true;s.src=${scriptJson(UMAMI.src)};` +
      `s.setAttribute('data-website-id',${scriptJson(UMAMI.websiteId)});s.setAttribute('data-domains',${scriptJson(UMAMI.domains)});` +
      `s.setAttribute('data-do-not-track','true');s.setAttribute('data-exclude-search','true');s.setAttribute('data-performance','true');` +
      `document.head.appendChild(s)})();`
  }
  return script
}
