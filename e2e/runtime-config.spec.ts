import { test, expect } from '@playwright/test'
import { serverConfig } from '../lib/runtime-config'

// Runs in the Playwright worker (Node): the settings an install gives the app
// when it starts, over what the image was built with.
const BUILT = {
  NEXT_PUBLIC_RENOWN_URL: 'https://www.renown.id',
  NEXT_PUBLIC_SWITCHBOARD_ENDPOINT: 'https://switchboard.renown.vetra.io/graphql',
  NEXT_PUBLIC_PRIVY_APP_ID: 'baked-privy-app',
}

test.describe('runtime config', () => {
  test('a setting given at start wins over the one baked into the build', () => {
    const config = serverConfig({ RENOWN_URL: 'https://renown.labs.example.com' }, BUILT)
    expect(config.renownUrl).toBe('https://renown.labs.example.com')
    expect(config.switchboardEndpoint).toBe('https://switchboard.renown.vetra.io/graphql')
  })

  test('a setting given empty keeps the baked one', () => {
    expect(serverConfig({ RENOWN_URL: '', PRIVY_APP_ID: '' }, BUILT)).toMatchObject({
      renownUrl: 'https://www.renown.id',
      privyAppId: 'baked-privy-app',
    })
  })

  test('every setting has its name at start', () => {
    const config = serverConfig(
      {
        RENOWN_URL: 'https://renown.labs.example.com',
        SWITCHBOARD_ENDPOINT: 'https://renown-switchboard.labs.example.com/graphql',
        RENOWN_OIDC_ISSUER: 'https://renown-switchboard.labs.example.com/api/@powerhousedao/renown-package/oidc',
        CONNECT_URL: 'https://labs.example.com',
        PRIVY_APP_ID: 'privy-app',
        PRIVY_CLIENT_ID: 'privy-client',
        WALLET_CONNECT_PROJECT_ID: 'wc',
        INFURA_PROJECT_ID: 'infura',
        OPENPANEL_CLIENT_ID: 'op-client',
        OPENPANEL_API_URL: 'https://op.example.com',
        RENOWN_DRIVE_ID: 'powerhouse',
        RENOWN_ANALYTICS: 'on',
      },
      {},
    )
    expect(config).toEqual({
      renownUrl: 'https://renown.labs.example.com',
      switchboardEndpoint: 'https://renown-switchboard.labs.example.com/graphql',
      oidcIssuer: 'https://renown-switchboard.labs.example.com/api/@powerhousedao/renown-package/oidc',
      connectUrl: 'https://labs.example.com',
      privyAppId: 'privy-app',
      privyClientId: 'privy-client',
      walletConnectProjectId: 'wc',
      infuraProjectId: 'infura',
      openPanelClientId: 'op-client',
      openPanelApiUrl: 'https://op.example.com',
      driveId: 'powerhouse',
      analytics: true,
    })
  })

  test('RENOWN_ANALYTICS=off turns analytics off; unset leaves it on', () => {
    expect(serverConfig({ RENOWN_ANALYTICS: 'off' }, BUILT).analytics).toBe(false)
    expect(serverConfig({}, BUILT).analytics).toBe(true)
  })

  test("with nothing set: today's defaults", () => {
    const config = serverConfig({ NODE_ENV: 'production' }, {})
    expect(config.driveId).toBe('renown-profiles')
    expect(config.switchboardEndpoint).toBe('https://switchboard.renown.vetra.io/graphql')
    expect(config.renownUrl).toBe('')
    expect(serverConfig({ NODE_ENV: 'development' }, {}).switchboardEndpoint).toBe('http://localhost:4001/graphql')
  })

  test('carries none of the server-only settings', () => {
    const config = serverConfig({ RENOWN_TRUSTED_READ_TOKEN: 'secret-read-token', ENS_RPC_URL: 'https://rpc.example.com/key' }, BUILT)
    expect(JSON.stringify(config)).not.toMatch(/secret-read-token|rpc\.example\.com/)
  })
})
