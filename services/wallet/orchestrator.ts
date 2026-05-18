import type { Hex } from 'viem'
import type { BusyListener, InitializingListener, WalletAdapter } from './adapter'
import type { AdapterRegistry } from './registry'
import type { FetchCredentialResponse, RenownApi } from './renown-api'
import { buildAndSignEip712Vc } from './credentials'
import type { AdapterListener, LoginMethod, LoginOptions, Session, Unsubscribe } from './types'

/** Optional metadata sent with a newly issued delegation credential. */
export interface IssueCredentialOptions {
  username?: string
  userImage?: string | null
  driveId?: string
  docId?: string
  expiresInDays?: number
}

/** Outcome of {@link AuthOrchestrator.issueDelegationVc}. */
export interface IssueCredentialResult {
  credentialId: string
  userDocumentId?: string
}

/**
 * Application-facing auth facade over one or more {@link WalletAdapter}s.
 *
 * Tracks which adapter owns the active session, fans out session/busy/
 * initializing state to subscribers, and coordinates EIP-712 credential
 * issuance and revocation via {@link RenownApi}.
 */
export class AuthOrchestrator {
  private currentAdapter: WalletAdapter | null = null
  private readonly listeners = new Set<AdapterListener>()
  private readonly busyListeners = new Set<BusyListener>()
  private readonly initializingListeners = new Set<InitializingListener>()
  private readonly adapterUnsubs = new Map<string, Unsubscribe[]>()

  constructor(
    private readonly registry: AdapterRegistry,
    private readonly api: RenownApi,
  ) {
    for (const adapter of registry.list()) {
      this.attach(adapter)
    }
  }

  /**
   * Wire an adapter's session, busy, and initializing streams into this orchestrator.
   * Idempotent per `adapter.name`; called automatically for adapters in the registry at construction.
   */
  attach(adapter: WalletAdapter): void {
    if (this.adapterUnsubs.has(adapter.name)) return
    const sessionUnsub = adapter.subscribe(session => {
      if (session) {
        this.currentAdapter = adapter
        this.emit(session)
      } else if (this.currentAdapter === adapter) {
        this.currentAdapter = null
        this.emit(null)
      }
    })
    const busyUnsub = adapter.subscribeBusy(() => {
      this.emitBusy()
    })
    const initUnsub = adapter.subscribeInitializing(() => {
      this.emitInitializing()
    })
    this.adapterUnsubs.set(adapter.name, [sessionUnsub, busyUnsub, initUnsub])
  }

  /** Unsubscribe all listeners for the named adapter and stop tracking its session. */
  detach(adapterName: string): void {
    const unsubs = this.adapterUnsubs.get(adapterName)
    if (unsubs) {
      for (const u of unsubs) u()
      this.adapterUnsubs.delete(adapterName)
    }
  }

  /** Active session from the currently tracked adapter, or `null` if none is connected. */
  getSession(): Session | null {
    return this.currentAdapter?.getSession() ?? null
  }

  /** Delegates to {@link AdapterRegistry.getSupportedMethods}. */
  getSupportedMethods(): LoginMethod[] {
    return this.registry.getSupportedMethods()
  }

  /** Delegates to {@link AdapterRegistry.supportsMethod}. */
  supportsMethod(method: LoginMethod): boolean {
    return this.registry.supportsMethod(method)
  }

  /** Subscribe to active-session changes; listener is invoked immediately with the current session. */
  subscribe(listener: AdapterListener): Unsubscribe {
    this.listeners.add(listener)
    listener(this.getSession())
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** `true` if any registered adapter reports busy. */
  isBusy(): boolean {
    for (const adapter of this.registry.list()) {
      if (adapter.isBusy()) return true
    }
    return false
  }

  /** Subscribe to aggregate busy state across all adapters. */
  subscribeBusy(listener: BusyListener): Unsubscribe {
    this.busyListeners.add(listener)
    listener(this.isBusy())
    return () => {
      this.busyListeners.delete(listener)
    }
  }

  /**
   * True while any attached adapter is still probing for an existing session.
   * The UI uses this to render a loading state on first paint instead of
   * pre-login while Privy/wagmi restore.
   */
  isInitializing(): boolean {
    for (const adapter of this.registry.list()) {
      if (adapter.isInitializing()) return true
    }
    return false
  }

  /** Subscribe to aggregate initializing state across all adapters; listener is invoked immediately with the current value. */
  subscribeInitializing(listener: InitializingListener): Unsubscribe {
    this.initializingListeners.add(listener)
    listener(this.isInitializing())
    return () => {
      this.initializingListeners.delete(listener)
    }
  }

  private emit(session: Session | null): void {
    for (const listener of this.listeners) {
      listener(session)
    }
  }

  private emitBusy(): void {
    const busy = this.isBusy()
    for (const listener of this.busyListeners) {
      listener(busy)
    }
  }

  private emitInitializing(): void {
    const initializing = this.isInitializing()
    for (const listener of this.initializingListeners) {
      listener(initializing)
    }
  }

  /** Resolve the adapter for `opts.method` and run its login flow. */
  async signIn(opts: LoginOptions): Promise<Session> {
    const adapter = this.registry.resolveForMethod(opts.method)
    return adapter.login(opts)
  }

  /** Log out of the adapter that owns the current session, if any. */
  async signOut(): Promise<void> {
    if (this.currentAdapter) {
      await this.currentAdapter.logout()
    }
  }

  /**
   * Build, sign, and persist an EIP-712 delegation VC for the active session.
   * @throws If there is no active session.
   */
  async issueDelegationVc(
    app: string,
    appId?: string,
    options: IssueCredentialOptions = {},
  ): Promise<IssueCredentialResult> {
    const session = this.getSession()
    if (!session) {
      throw new Error('Cannot issue credential: no active session')
    }

    const { credential, signature, domain } = await buildAndSignEip712Vc({
      signer: session.signer,
      address: session.address,
      chainId: session.chainId,
      app,
      appId,
      expiresInDays: options.expiresInDays ?? 7,
    })

    const result = await this.api.postCredential({
      credential,
      signature,
      domain,
      username: options.username,
      userImage: options.userImage,
      driveId: options.driveId,
      docId: options.docId,
    })

    return {
      credentialId: credential.id,
      userDocumentId: result.userDocumentId,
    }
  }

  /** Load an existing credential for an address from the Renown API. */
  async fetchCredential(params: {
    address: Hex
    appId?: string
    includeRevoked?: boolean
  }): Promise<FetchCredentialResponse | null> {
    return this.api.fetchCredential(params)
  }

  /** Revoke a credential on the Renown API (e.g. on logout). */
  async revokeCredential(credentialId: string, address: Hex, reason = 'User logged out'): Promise<void> {
    await this.api.deleteCredential({ credentialId, address, reason })
  }
}
