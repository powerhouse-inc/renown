import type { Config } from 'wagmi'
import {
  disconnect,
  getAccount,
  signMessage,
  signTypedData,
  watchAccount,
  type GetAccountReturnType,
} from 'wagmi/actions'
import { BaseWalletAdapter } from '../../services/wallet/adapter'
import {
  AccountType,
  LoginCancelledError,
  LoginMethod,
  type LoginOptions,
  type Session,
  type Signer,
  type Unsubscribe,
} from '../../services/wallet/types'

type ConnectedAccount = Extract<GetAccountReturnType, { status: 'connected' }>

export class WagmiAdapter extends BaseWalletAdapter {
  readonly name = 'wagmi'
  readonly supportedMethods: LoginMethod[] = [LoginMethod.WALLET]

  private openModal: (() => void) | null = null
  private pending: {
    resolve: (session: Session) => void
    reject: (error: Error) => void
  } | null = null
  private readonly unwatch: Unsubscribe

  constructor(private readonly config: Config) {
    super()
    this.unwatch = watchAccount(this.config, {
      onChange: account => this.handleAccountChange(account),
    })

    const account = getAccount(this.config)
    if (account.status === 'connected') {
      this.emit(this.toSession(account))
    }
  }

  /**
   * Wire up RainbowKit's connect modal opener. Returns an unsubscribe.
   * Called by the React-side WagmiAdapterBridge component once useConnectModal resolves.
   */
  registerConnectModal(open: () => void): Unsubscribe {
    this.openModal = open
    return () => {
      if (this.openModal === open) this.openModal = null
    }
  }

  /**
   * Called by the bridge when RainbowKit's connect modal closes. If we still
   * have a pending login and no connection was established, treat it as a user
   * cancellation so the UI can re-enable its buttons.
   */
  cancelPendingLogin(): void {
    if (!this.pending) return
    if (getAccount(this.config).status === 'connected') return
    const { reject } = this.pending
    this.pending = null
    reject(new LoginCancelledError())
  }

  async login(opts: LoginOptions): Promise<Session> {
    if (opts.method !== LoginMethod.WALLET) {
      throw new Error(`WagmiAdapter does not support login method "${opts.method}"`)
    }

    const existing = this.getSession()
    if (existing) return existing

    if (!this.openModal) {
      throw new Error(
        'WagmiAdapter: connect modal opener not registered. Ensure <WagmiAdapterBridge /> is mounted under <RainbowKitProvider>.',
      )
    }

    return new Promise<Session>((resolve, reject) => {
      this.pending = { resolve, reject }
      try {
        this.openModal!()
      } catch (error) {
        this.pending = null
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  async logout(): Promise<void> {
    try {
      await disconnect(this.config)
    } finally {
      this.emit(null)
    }
  }

  dispose(): void {
    this.unwatch?.()
  }

  private handleAccountChange(account: GetAccountReturnType): void {
    if (account.status === 'connected') {
      const session = this.toSession(account)
      this.emit(session)
      if (this.pending) {
        this.pending.resolve(session)
        this.pending = null
      }
    } else if (account.status === 'disconnected') {
      this.emit(null)
    }
  }

  private toSession(account: ConnectedAccount): Session {
    const address = account.address
    const chainId = account.chainId
    const config = this.config

    const signer: Signer = {
      async signMessage(message: string) {
        return signMessage(config, { account: address, message })
      },
      async signTypedData(args) {
        return signTypedData(config, {
          account: address,
          domain: args.domain,
          // viem accepts the broader TypedData | Record<string, unknown> shape
          types: args.types as Record<string, readonly { name: string; type: string }[]>,
          primaryType: args.primaryType,
          message: args.message,
        })
      },
    }

    return {
      address,
      chainId,
      caip2: `eip155:${chainId}`,
      accountType: AccountType.EOA,
      signer,
    }
  }
}
