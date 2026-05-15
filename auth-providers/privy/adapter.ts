import type { Hex } from 'viem'
import type {
  ConnectedWallet,
  LoginModalOptions,
  OAuthProviderType,
  SignTypedDataParams,
} from '@privy-io/react-auth'
import { BaseWalletAdapter } from '../../services/wallet/adapter'
import {
  AccountType,
  LoginCancelledError,
  LoginMethod,
  type LoginOptions,
  type Session,
  type SignTypedDataArgs,
  type Signer,
  type Unsubscribe,
} from '../../services/wallet/types'

type PrivyLoginMethodId = NonNullable<LoginModalOptions['loginMethods']>[number]

/**
 * Functions captured from Privy React hooks. Provided by <PrivyAdapterBridge>
 * via `bind()`. Until bind is called, login/logout/sign calls will throw.
 */
export interface PrivyBindings {
  openLoginModal: (options?: LoginModalOptions) => void
  initOAuth: (provider: OAuthProviderType) => Promise<void>
  logout: () => Promise<void>
  signMessage: (message: string, address: Hex) => Promise<Hex>
  signTypedData: (args: SignTypedDataArgs, address: Hex) => Promise<Hex>
}

type UnsupportedMethods = LoginMethod.FACEBOOK

const PRIVY_METHOD_MAP: Record<Exclude<LoginMethod, UnsupportedMethods>, PrivyLoginMethodId> = {
  [LoginMethod.WALLET]: 'wallet',
  [LoginMethod.GOOGLE]: 'google',
  [LoginMethod.APPLE]: 'apple',
  [LoginMethod.EMAIL]: 'email',
  [LoginMethod.SMS]: 'sms',
  [LoginMethod.TWITTER]: 'twitter',
  [LoginMethod.LINKEDIN]: 'linkedin',
  [LoginMethod.INSTAGRAM]: 'instagram',
  [LoginMethod.TIKTOK]: 'tiktok',
  [LoginMethod.SPOTIFY]: 'spotify',
  [LoginMethod.DISCORD]: 'discord',
  [LoginMethod.GITHUB]: 'github'
}

/**
 * OAuth methods that can be triggered headlessly via Privy's `initOAuth` —
 * a full-page redirect to the provider, skipping the Privy modal entirely.
 * Methods absent here (EMAIL, SMS, WALLET) take other paths.
 */
const HEADLESS_OAUTH_MAP: Partial<Record<LoginMethod, OAuthProviderType>> = {
  [LoginMethod.GOOGLE]: 'google',
  [LoginMethod.APPLE]: 'apple',
  [LoginMethod.TWITTER]: 'twitter',
  [LoginMethod.LINKEDIN]: 'linkedin',
  [LoginMethod.INSTAGRAM]: 'instagram',
  [LoginMethod.TIKTOK]: 'tiktok',
  [LoginMethod.SPOTIFY]: 'spotify',
  [LoginMethod.DISCORD]: 'discord',
  [LoginMethod.GITHUB]: 'github',
}

interface PendingLogin {
  resolve(session: Session): void
  reject(error: Error): void
}

export interface PrivyAdapterOptions {
  supportedMethods: Array<Exclude<LoginMethod, UnsupportedMethods>>
}

export class PrivyAdapter extends BaseWalletAdapter {
  readonly name = 'privy'
  readonly supportedMethods: LoginMethod[]

  private bindings: PrivyBindings | null = null
  private pending: PendingLogin | null = null

  constructor(options: PrivyAdapterOptions) {
    super()
    const requested = options.supportedMethods
    for (const method of requested) {
      if (!(method in PRIVY_METHOD_MAP)) {
        throw new Error(
          `PrivyAdapter cannot support login method "${method}"`,
        )
      }
    }
    this.supportedMethods = [...requested]
  }

  /**
   * Called by <PrivyAdapterBridge> on mount to inject the React-bound Privy
   * functions. Returns an unsubscribe used during cleanup.
   */
  bind(bindings: PrivyBindings): Unsubscribe {
    this.bindings = bindings
    return () => {
      if (this.bindings === bindings) this.bindings = null
    }
  }

  /**
   * Called by the bridge whenever the Privy embedded wallet becomes available.
   * Emits a new session and resolves any pending login promise.
   */
  syncFromEmbeddedWallet(wallet: ConnectedWallet): void {
    const chainId = parseCaip2ChainId(wallet.chainId)
    const address = wallet.address as Hex

    const signer: Signer = {
      signMessage: async (message: string) => {
        if (!this.bindings) throw new Error('PrivyAdapter not bound (bridge not mounted)')
        return this.bindings.signMessage(message, address)
      },
      signTypedData: async (args: SignTypedDataArgs) => {
        if (!this.bindings) throw new Error('PrivyAdapter not bound (bridge not mounted)')
        return this.bindings.signTypedData(args, address)
      },
    }

    const session: Session = {
      address,
      chainId,
      caip2: wallet.chainId,
      accountType: AccountType.EOA,
      signer,
      // Privy manages the embedded wallet's keys, so it can sign without a
      // user-facing confirmation popup.
      autoSign: true,
    }

    this.emit(session)

    if (this.pending) {
      this.pending.resolve(session)
      this.pending = null
    }
  }

  /** Called by the bridge when the user logs out or auth becomes unavailable. */
  clearSession(): void {
    this.emit(null)
  }

  /**
   * Called by the bridge to signal that Privy is authenticated but the embedded
   * wallet has not yet been provisioned. Drives the global "auth busy" signal
   * that the UI consumes to render a stable loading state.
   */
  setProvisioning(value: boolean): void {
    this.setBusy(value)
  }

  /** Called by the bridge on Privy's onError callback. */
  handleLoginError(error: unknown): void {
    if (!this.pending) return
    // Privy emits string codes like `exited_auth_flow` when the user dismisses
    // the modal. Surface those as a typed cancellation so UI can ignore them.
    const code = typeof error === 'string' ? error : null
    const err = code?.startsWith('exited_')
      ? new LoginCancelledError(code)
      : error instanceof Error
        ? error
        : new Error(String(error))
    this.pending.reject(err)
    this.pending = null
  }

  async login(opts: LoginOptions): Promise<Session> {
    const privyMethod = PRIVY_METHOD_MAP[opts.method as keyof typeof PRIVY_METHOD_MAP]
    if (!privyMethod) {
      throw new Error(`PrivyAdapter does not support login method "${opts.method}"`)
    }

    if (!this.bindings) {
      throw new Error(
        'PrivyAdapter not bound. Ensure <PrivyProvider> wraps the app and <PrivyAdapterBridge /> is mounted inside it.',
      )
    }

    const existing = this.getSession()
    if (existing) return existing

    const oauthProvider = HEADLESS_OAUTH_MAP[opts.method]
    if (oauthProvider) {
      // Headless OAuth — Privy does a full-page redirect to the provider.
      // The returned promise resolves once the redirect is initiated; the
      // session is established when the user returns and the bridge fires
      // `syncFromEmbeddedWallet`. Track that here as the pending login.
      return new Promise<Session>((resolve, reject) => {
        this.pending = { resolve, reject }
        this.bindings!.initOAuth(oauthProvider).catch(error => {
          this.pending = null
          reject(error instanceof Error ? error : new Error(String(error)))
        })
      })
    }

    return new Promise<Session>((resolve, reject) => {
      this.pending = { resolve, reject }
      try {
        this.bindings!.openLoginModal({ loginMethods: [privyMethod] })
      } catch (error) {
        this.pending = null
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  async logout(): Promise<void> {
    if (!this.bindings) {
      this.emit(null)
      return
    }
    try {
      await this.bindings.logout()
    } finally {
      this.emit(null)
    }
  }
}

function parseCaip2ChainId(caip2: string): number {
  const parts = caip2.split(':')
  const last = parts[parts.length - 1]
  const n = Number(last)
  if (!Number.isFinite(n)) {
    throw new Error(`PrivyAdapter: could not parse chainId from CAIP-2 "${caip2}"`)
  }
  return n
}

export type { SignTypedDataParams }
