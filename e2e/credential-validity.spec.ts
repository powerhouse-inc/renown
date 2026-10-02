import { test, expect } from '@playwright/test'
import {
  DEFAULT_CREDENTIAL_VALIDITY_DAYS,
  MAX_CREDENTIAL_VALIDITY_DAYS,
  credentialExpiryDate,
  describeCredentialValidity,
  isDefaultCredentialValidity,
  parseExpiresInDays,
} from '../utils/credential-validity'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { AdapterRegistry } from '../services/wallet/registry'
import { AuthOrchestrator } from '../services/wallet/orchestrator'
import type { RenownApi } from '../services/wallet/renown-api'
import type { WalletAdapter } from '../services/wallet/adapter'
import { AccountType, LoginMethod, type Session } from '../services/wallet/types'

// Runs in the Playwright worker (Node), not the browser.
test.describe('parseExpiresInDays', () => {
  test('defaults to 7 days when absent', () => {
    expect(DEFAULT_CREDENTIAL_VALIDITY_DAYS).toBe(7)
    expect(parseExpiresInDays(undefined)).toBe(7)
    expect(parseExpiresInDays(null)).toBe(7)
    expect(parseExpiresInDays('')).toBe(7)
  })

  test('accepts integers from 1 to 365', () => {
    expect(parseExpiresInDays('1')).toBe(1)
    expect(parseExpiresInDays('30')).toBe(30)
    expect(parseExpiresInDays('365')).toBe(365)
  })

  test('clamps values above 365 to 365', () => {
    expect(MAX_CREDENTIAL_VALIDITY_DAYS).toBe(365)
    expect(parseExpiresInDays('366')).toBe(365)
    expect(parseExpiresInDays('100000')).toBe(365)
    expect(parseExpiresInDays('99999999999999999999999')).toBe(365)
  })

  test('falls back to 7 for anything that is not a positive integer', () => {
    for (const raw of ['0', '-1', '-400', '1.5', '7.0', 'abc', '30d', ' 30', '30 ', '1e3', '0x10', '+30', 'NaN', 'Infinity']) {
      expect(parseExpiresInDays(raw), raw).toBe(7)
    }
  })

  test('takes the first value of a repeated query parameter', () => {
    expect(parseExpiresInDays(['90', '365'])).toBe(90)
    expect(parseExpiresInDays([])).toBe(7)
  })
})

test.describe('credential validity description', () => {
  const now = new Date('2026-10-02T12:00:00.000Z')

  test('the expiry date is the given number of days after now', () => {
    expect(credentialExpiryDate(365, now).toISOString()).toBe('2027-10-02T12:00:00.000Z')
    expect(credentialExpiryDate(7, now).toISOString()).toBe('2026-10-09T12:00:00.000Z')
  })

  test('only the default validity counts as default', () => {
    expect(isDefaultCredentialValidity(7)).toBe(true)
    expect(isDefaultCredentialValidity(1)).toBe(false)
    expect(isDefaultCredentialValidity(365)).toBe(false)
  })

  test('states the number of days and the end date', () => {
    expect(describeCredentialValidity(365, now, 'en-US', 'UTC')).toBe('Valid for 365 days, until October 2, 2027')
    expect(describeCredentialValidity(1, now, 'en-US', 'UTC')).toBe('Valid for 1 day, until October 3, 2026')
  })
})

test.describe('AuthOrchestrator.issueDelegationVc validity', () => {
  async function issue(expiresInDays?: number) {
    const account = privateKeyToAccount(generatePrivateKey())
    const session: Session = {
      address: account.address,
      chainId: 1,
      caip2: 'eip155:1',
      accountType: AccountType.EOA,
      autoSign: false,
      signer: {
        signMessage: (message) => account.signMessage({ message }),
        signTypedData: (args) => account.signTypedData(args as Parameters<typeof account.signTypedData>[0]),
      },
    }
    const adapter: WalletAdapter = {
      name: 'test',
      supportedMethods: [LoginMethod.WALLET],
      login: async () => session,
      logout: async () => {},
      getSession: () => session,
      subscribe: (listener) => {
        listener(session)
        return () => {}
      },
      isBusy: () => false,
      subscribeBusy: () => () => {},
      isInitializing: () => false,
      subscribeInitializing: () => () => {},
    }
    const registry = new AdapterRegistry()
    registry.register(adapter)
    const posted: Parameters<RenownApi['postCredential']>[0][] = []
    const api = {
      postCredential: async (body: Parameters<RenownApi['postCredential']>[0]) => {
        posted.push(body)
        return { userDocumentId: 'doc' }
      },
    } as unknown as RenownApi
    const orchestrator = new AuthOrchestrator(registry, api)
    await orchestrator.issueDelegationVc('https://app.example', 'did:key:z6MkApp', { expiresInDays })
    const { issuanceDate, expirationDate } = posted[0].credential
    return Math.round((Date.parse(expirationDate) - Date.parse(issuanceDate)) / (24 * 60 * 60 * 1000))
  }

  test('signs the requested validity into the credential', async () => {
    expect(await issue(365)).toBe(365)
    expect(await issue(1)).toBe(1)
  })

  test('keeps the 7-day default when no validity is requested', async () => {
    expect(await issue()).toBe(7)
  })
})
