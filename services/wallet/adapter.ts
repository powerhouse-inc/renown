import type {
  AdapterListener,
  LoginMethod,
  LoginOptions,
  Session,
  Unsubscribe,
} from './types'

export interface WalletAdapter {
  readonly name: string
  readonly supportedMethods: LoginMethod[]
  login(opts: LoginOptions): Promise<Session>
  logout(): Promise<void>
  getSession(): Session | null
  subscribe(listener: AdapterListener): Unsubscribe
}

export abstract class BaseWalletAdapter implements WalletAdapter {
  abstract readonly name: string
  abstract readonly supportedMethods: LoginMethod[]

  protected current: Session | null = null
  private readonly listeners = new Set<AdapterListener>()

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
