// A scriptable browser wallet for UI tests: an EIP-1193 provider injected as
// window.ethereum (and announced over EIP-6963) whose signing requests are
// answered in the Playwright worker by a viem account. Lets a test connect
// through RainbowKit, sign the EIP-712 credential, and accept or decline a
// personal_sign, without a real wallet.
import type { Page } from '@playwright/test'
import { hexToString, isHex, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

export interface InjectedWallet {
  address: Hex
  /** Messages the page asked the wallet to personal_sign, in order. */
  personalSignRequests: string[]
  /** Whether the next personal_sign requests are declined (EIP-1193 code 4001). */
  declinePersonalSign: boolean
}

export async function installInjectedWallet(page: Page): Promise<InjectedWallet> {
  const account = privateKeyToAccount(generatePrivateKey())
  const wallet: InjectedWallet = {
    address: account.address,
    personalSignRequests: [],
    declinePersonalSign: false,
  }

  await page.exposeFunction(
    '__testWalletSign',
    async (method: string, params: unknown[]): Promise<{ result?: Hex; error?: { code: number; message: string } }> => {
      if (method === 'personal_sign') {
        const raw = params[0] as string
        const message = isHex(raw) ? hexToString(raw) : raw
        wallet.personalSignRequests.push(message)
        if (wallet.declinePersonalSign) return { error: { code: 4001, message: 'User rejected the request.' } }
        return { result: await account.signMessage({ message }) }
      }
      if (method === 'eth_signTypedData_v4') {
        const typed = JSON.parse(params[1] as string)
        const { EIP712Domain: _domain, ...types } = typed.types
        void _domain
        return {
          result: await account.signTypedData({
            domain: typed.domain,
            types,
            primaryType: typed.primaryType,
            message: typed.message,
          }),
        }
      }
      return { error: { code: 4200, message: `Unsupported method ${method}` } }
    },
  )

  await page.addInitScript((address: string) => {
    type Listener = (...args: unknown[]) => void
    const listeners: Record<string, Listener[]> = {}
    const provider = {
      isMetaMask: true,
      async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return [address]
          case 'eth_chainId':
            return '0x1'
          case 'net_version':
            return '1'
          case 'wallet_requestPermissions':
          case 'wallet_getPermissions':
            return [{ parentCapability: 'eth_accounts' }]
          case 'wallet_revokePermissions':
          case 'wallet_switchEthereumChain':
            return null
          case 'personal_sign':
          case 'eth_signTypedData_v4': {
            const sign = (window as unknown as {
              __testWalletSign: (m: string, p: unknown[]) => Promise<{ result?: string; error?: { code: number; message: string } }>
            }).__testWalletSign
            const answer = await sign(method, params ?? [])
            if (answer.error) throw Object.assign(new Error(answer.error.message), { code: answer.error.code })
            return answer.result
          }
          default:
            throw Object.assign(new Error(`Unsupported method ${method}`), { code: 4200 })
        }
      },
      on(event: string, listener: Listener) {
        ;(listeners[event] ??= []).push(listener)
        return provider
      },
      removeListener(event: string, listener: Listener) {
        listeners[event] = (listeners[event] ?? []).filter((l) => l !== listener)
        return provider
      },
    }
    ;(window as unknown as { ethereum: unknown }).ethereum = provider
    const detail = Object.freeze({
      info: {
        uuid: '6a3c1f0e-6f4e-4d6b-9a57-0a6f3c1b2d4e',
        name: 'Test Wallet',
        icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
        rdns: 'io.renown.test-wallet',
      },
      provider,
    })
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }))
    window.addEventListener('eip6963:requestProvider', announce)
    announce()
  }, account.address)

  return wallet
}
