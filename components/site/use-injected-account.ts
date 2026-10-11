import { useEffect, useState } from 'react'

/** The slice of an EIP-1193 provider (window.ethereum) this hook uses. */
interface InjectedProvider {
  request(args: { method: string }): Promise<unknown>
  on?(event: 'accountsChanged', listener: (accounts: unknown) => void): unknown
  removeListener?(event: 'accountsChanged', listener: (accounts: unknown) => void): unknown
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/** The selected account of an eth_accounts / accountsChanged answer, lowercase; null for none or garbage. */
function selectedAccount(accounts: unknown): string | null {
  const first: unknown = Array.isArray(accounts) ? accounts[0] : undefined
  return typeof first === 'string' && ADDRESS_RE.test(first) ? first.toLowerCase() : null
}

/**
 * The account the browser's injected wallet (window.ethereum, e.g. MetaMask)
 * has selected for this site, lowercase. Null without an injected wallet, when
 * it is locked or has not connected this site, and while `enabled` is false.
 * Reads eth_accounts (which never opens the wallet) on mount and whenever the
 * window regains focus, and follows accountsChanged. Uses window.ethereum
 * directly, no wallet library, so marketing pages stay free of wallet code.
 */
export function useInjectedAccount(enabled: boolean): string | null {
  const [account, setAccount] = useState<string | null>(null)

  useEffect(() => {
    const provider = (window as { ethereum?: InjectedProvider }).ethereum
    if (!enabled || !provider || typeof provider.request !== 'function') return
    let active = true
    const update = (accounts: unknown) => {
      if (active) setAccount(selectedAccount(accounts))
    }
    const read = () => {
      provider.request({ method: 'eth_accounts' }).then(update, () => undefined)
    }
    read()
    window.addEventListener('focus', read)
    provider.on?.('accountsChanged', update)
    return () => {
      active = false
      window.removeEventListener('focus', read)
      provider.removeListener?.('accountsChanged', update)
    }
  }, [enabled])

  return enabled ? account : null
}
