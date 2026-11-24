// The settings one image needs per deployment: given when the app starts,
// over the values baked into the build. A deployment that gives none (as
// renown.id's does) keeps exactly the baked values, so one image serves any
// Renown: www.renown.id, or a company's own at https://renown.<domain>.
//
// The server reads its environment; the browser gets the same values from
// /runtime-config.js (pages/api/runtime-config.ts), which _document loads
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

/** The settings from the environment at start, then the baked values, then today's defaults. An empty value counts as unset. */
export function serverConfig(env: Env = process.env, baked: Env = BAKED): PublicConfig {
  const pick = ([runtime, built]: readonly [string, string]): string => env[runtime] || baked[built] || ''
  return {
    renownUrl: pick(NAMES.renownUrl),
    // Only `next dev` falls back to a local switchboard: a production build
    // with nothing set must never point browsers at localhost.
    switchboardEndpoint:
      pick(NAMES.switchboardEndpoint) ||
      (env.NODE_ENV === 'development' ? 'http://localhost:4001/graphql' : 'https://switchboard.renown.vetra.io/graphql'),
    oidcIssuer: pick(NAMES.oidcIssuer),
    connectUrl: pick(NAMES.connectUrl),
    privyAppId: pick(NAMES.privyAppId),
    privyClientId: pick(NAMES.privyClientId),
    walletConnectProjectId: pick(NAMES.walletConnectProjectId),
    infuraProjectId: pick(NAMES.infuraProjectId),
    openPanelClientId: pick(NAMES.openPanelClientId),
    openPanelApiUrl: pick(NAMES.openPanelApiUrl),
    driveId: pick(NAMES.driveId) || 'renown-profiles',
    analytics: env.RENOWN_ANALYTICS !== 'off',
  }
}

declare global {
  interface Window {
    __RENOWN_CONFIG__?: PublicConfig
  }
}

/** In the browser: what /runtime-config.js set, else the baked values (the script did not load). */
export function publicConfig(): PublicConfig {
  return window.__RENOWN_CONFIG__ ?? serverConfig({ NODE_ENV: process.env.NODE_ENV }, BAKED)
}

/** The settings wherever this runs: the server's environment, or what the browser was given. */
export function runtimeConfig(): PublicConfig {
  return typeof window === 'undefined' ? serverConfig() : publicConfig()
}
