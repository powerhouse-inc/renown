import type { Hex } from 'viem'
import type { BusyListener, WalletAdapter } from './adapter'
import type { AdapterRegistry } from './registry'
import type { FetchCredentialResponse, RenownApi } from './renown-api'
import type { SignatureVerifier } from './signature-verifier'
import { buildAndSignEip712Vc } from './credentials'
import type { AdapterListener, LoginMethod, LoginOptions, Session, Unsubscribe } from './types'

export interface IssueCredentialOptions {
  username?: string
  userImage?: string | null
  driveId?: string
  docId?: string
  expiresInDays?: number
}

export interface IssueCredentialResult {
  credentialId: string
  userDocumentId?: string
}

export class AuthOrchestrator {
  private currentAdapter: WalletAdapter | null = null
  private readonly listeners = new Set<AdapterListener>()
  private readonly busyListeners = new Set<BusyListener>()
  private readonly adapterUnsubs = new Map<string, Unsubscribe[]>()

  constructor(
    private readonly registry: AdapterRegistry,
    private readonly api: RenownApi,
    private readonly verifier: SignatureVerifier,
  ) {
    for (const adapter of registry.list()) {
      this.attach(adapter)
    }
  }

  /** Subscribe to an adapter so its session emissions propagate through the orchestrator. */
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
    this.adapterUnsubs.set(adapter.name, [sessionUnsub, busyUnsub])
  }

  detach(adapterName: string): void {
    const unsubs = this.adapterUnsubs.get(adapterName)
    if (unsubs) {
      for (const u of unsubs) u()
      this.adapterUnsubs.delete(adapterName)
    }
  }

  getSession(): Session | null {
    return this.currentAdapter?.getSession() ?? null
  }

  getSupportedMethods(): LoginMethod[] {
    return this.registry.getSupportedMethods()
  }

  supportsMethod(method: LoginMethod): boolean {
    return this.registry.supportsMethod(method)
  }

  subscribe(listener: AdapterListener): Unsubscribe {
    this.listeners.add(listener)
    listener(this.getSession())
    return () => {
      this.listeners.delete(listener)
    }
  }

  isBusy(): boolean {
    for (const adapter of this.registry.list()) {
      if (adapter.isBusy()) return true
    }
    return false
  }

  subscribeBusy(listener: BusyListener): Unsubscribe {
    this.busyListeners.add(listener)
    listener(this.isBusy())
    return () => {
      this.busyListeners.delete(listener)
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

  async signIn(opts: LoginOptions): Promise<Session> {
    const adapter = this.registry.resolveForMethod(opts.method)
    return adapter.login(opts)
  }

  async signOut(): Promise<void> {
    if (this.currentAdapter) {
      await this.currentAdapter.logout()
    }
  }

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

  async fetchCredential(params: {
    address: Hex
    appId?: string
    includeRevoked?: boolean
  }): Promise<FetchCredentialResponse | null> {
    return this.api.fetchCredential(params)
  }

  async revokeCredential(credentialId: string, address: Hex, reason = 'User logged out'): Promise<void> {
    await this.api.deleteCredential({ credentialId, address, reason })
  }
}
