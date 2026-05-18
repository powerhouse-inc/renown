import type {
  AdapterListener,
  LoginMethod,
  LoginOptions,
  Session,
  Unsubscribe,
} from './types'

export type BusyListener = (busy: boolean) => void
export type InitializingListener = (initializing: boolean) => void

export interface WalletAdapter {
  readonly name: string
  readonly supportedMethods: LoginMethod[]
  login(opts: LoginOptions): Promise<Session>
  logout(): Promise<void>
  getSession(): Session | null
  subscribe(listener: AdapterListener): Unsubscribe
  isBusy(): boolean
  subscribeBusy(listener: BusyListener): Unsubscribe
  /**
   * True until the adapter has had a chance to probe its underlying auth
   * provider and report the first definitive session state (connected or not).
   * Used by the UI to render a stable loading state instead of pre-login while
   * a previously authenticated session is being restored on page load.
   */
  isInitializing(): boolean
  subscribeInitializing(listener: InitializingListener): Unsubscribe
}

export abstract class BaseWalletAdapter implements WalletAdapter {
  abstract readonly name: string
  abstract readonly supportedMethods: LoginMethod[]

  protected current: Session | null = null
  private readonly listeners = new Set<AdapterListener>()
  private busy = false
  private readonly busyListeners = new Set<BusyListener>()
  // Starts true so the first paint (before any adapter event) renders a
  // loading state rather than pre-login. Cleared once via `markReady()` after
  // the adapter has decided whether there is an existing session.
  private initializing = true
  private readonly initializingListeners = new Set<InitializingListener>()

  subscribe(listener: AdapterListener): Unsubscribe {
    this.listeners.add(listener)
    listener(this.current)
    return () => {
      this.listeners.delete(listener)
    }
  }

  protected emit(session: Session | null): void {
    if (sessionsEqual(this.current, session)) return
    this.current = session
    for (const listener of this.listeners) {
      listener(session)
    }
  }

  getSession(): Session | null {
    return this.current
  }

  isBusy(): boolean {
    return this.busy
  }

  subscribeBusy(listener: BusyListener): Unsubscribe {
    this.busyListeners.add(listener)
    listener(this.busy)
    return () => {
      this.busyListeners.delete(listener)
    }
  }

  protected setBusy(value: boolean): void {
    if (this.busy === value) return
    this.busy = value
    for (const listener of this.busyListeners) {
      listener(value)
    }
  }

  isInitializing(): boolean {
    return this.initializing
  }

  subscribeInitializing(listener: InitializingListener): Unsubscribe {
    this.initializingListeners.add(listener)
    listener(this.initializing)
    return () => {
      this.initializingListeners.delete(listener)
    }
  }

  /**
   * Called by adapter bridges once they've observed the first definitive auth
   * state (session present or not). Idempotent — only flips initializing→false
   * once. Public so React-side bridges can call it without subclass plumbing.
   */
  markReady(): void {
    if (!this.initializing) return
    this.initializing = false
    for (const listener of this.initializingListeners) {
      listener(false)
    }
  }

  abstract login(opts: LoginOptions): Promise<Session>
  abstract logout(): Promise<void>
}

function sessionsEqual(a: Session | null, b: Session | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.address === b.address &&
    a.chainId === b.chainId &&
    a.caip2 === b.caip2 &&
    a.accountType === b.accountType
  )
}
