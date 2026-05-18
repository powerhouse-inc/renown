import type {
  AdapterListener,
  LoginMethod,
  LoginOptions,
  Session,
  Unsubscribe,
} from './types'

/** Notified when an adapter enters or leaves a long-running login/logout operation. */
export type BusyListener = (busy: boolean) => void

/** Notified when an adapter's startup session probe completes (see `isInitializing`). */
export type InitializingListener = (initializing: boolean) => void

/**
 * Contract for a wallet or social auth backend (Privy, wagmi, etc.).
 *
 * Each adapter owns one provider's session lifecycle: login, logout, and
 * reactive session updates. The {@link AuthOrchestrator} attaches to every
 * registered adapter and surfaces the active session to the app.
 */
export interface WalletAdapter {
  /** Stable identifier used by {@link AdapterRegistry} (e.g. `"wagmi"`, `"privy"`). */
  readonly name: string
  /** Login methods this adapter can handle via {@link WalletAdapter.login}. */
  readonly supportedMethods: LoginMethod[]
  /** Start or complete a login flow for the given method; resolves with the new session. */
  login(opts: LoginOptions): Promise<Session>
  /** Clear the adapter's session and notify subscribers with `null`. */
  logout(): Promise<void>
  /** Current session snapshot, or `null` when disconnected. */
  getSession(): Session | null
  /** Subscribe to session changes; the listener is invoked immediately with the current value. */
  subscribe(listener: AdapterListener): Unsubscribe
  /** Whether a login or logout operation is in progress. */
  isBusy(): boolean
  /** Subscribe to busy-state changes; the listener is invoked immediately with the current value. */
  subscribeBusy(listener: BusyListener): Unsubscribe
  /**
   * True until the adapter has had a chance to probe its underlying auth
   * provider and report the first definitive session state (connected or not).
   * Used by the UI to render a stable loading state instead of pre-login while
   * a previously authenticated session is being restored on page load.
   */
  isInitializing(): boolean
  /** Subscribe to initializing-state changes; the listener is invoked immediately with the current value. */
  subscribeInitializing(listener: InitializingListener): Unsubscribe
}

/**
 * Shared session, busy, and initializing state for concrete adapters.
 *
 * Subclasses implement {@link login} and {@link logout}; React-side bridges
 * call {@link emit} and {@link markReady} when the underlying provider reports
 * auth state.
 */
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

  /** @inheritdoc */
  subscribe(listener: AdapterListener): Unsubscribe {
    this.listeners.add(listener)
    listener(this.current)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Push a new session to subscribers when it differs from the cached value. */
  protected emit(session: Session | null): void {
    if (sessionsEqual(this.current, session)) return
    this.current = session
    for (const listener of this.listeners) {
      listener(session)
    }
  }

  /** @inheritdoc */
  getSession(): Session | null {
    return this.current
  }

  /** @inheritdoc */
  isBusy(): boolean {
    return this.busy
  }

  /** @inheritdoc */
  subscribeBusy(listener: BusyListener): Unsubscribe {
    this.busyListeners.add(listener)
    listener(this.busy)
    return () => {
      this.busyListeners.delete(listener)
    }
  }

  /** Update busy flag and notify {@link subscribeBusy} listeners. */
  protected setBusy(value: boolean): void {
    if (this.busy === value) return
    this.busy = value
    for (const listener of this.busyListeners) {
      listener(value)
    }
  }

  /** @inheritdoc */
  isInitializing(): boolean {
    return this.initializing
  }

  /** @inheritdoc */
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

/** Compare session identity fields so redundant emissions are skipped. */
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
