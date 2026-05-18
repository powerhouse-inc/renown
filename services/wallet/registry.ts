import type { WalletAdapter } from './adapter'
import type { LoginMethod } from './types'

/**
 * In-memory catalog of {@link WalletAdapter} instances keyed by name.
 *
 * Used by {@link AuthOrchestrator} to resolve which adapter handles a
 * {@link LoginMethod} and to aggregate supported methods across providers.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, WalletAdapter>()

  /** Add an adapter; throws if `adapter.name` is already registered. */
  register(adapter: WalletAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(`Adapter "${adapter.name}" is already registered`)
    }
    this.adapters.set(adapter.name, adapter)
  }

  /** Remove an adapter by name (no-op if missing). */
  unregister(name: string): void {
    this.adapters.delete(name)
  }

  /** Look up an adapter by name. */
  get(name: string): WalletAdapter | undefined {
    return this.adapters.get(name)
  }

  /** All registered adapters in insertion order. */
  list(): WalletAdapter[] {
    return Array.from(this.adapters.values())
  }

  /** Union of all login methods declared as supported by registered adapters. */
  getSupportedMethods(): LoginMethod[] {
    const methods = new Set<LoginMethod>()
    for (const adapter of this.adapters.values()) {
      for (const method of adapter.supportedMethods) methods.add(method)
    }
    return Array.from(methods)
  }

  /** Whether any registered adapter declares support for `method`. */
  supportsMethod(method: LoginMethod): boolean {
    for (const adapter of this.adapters.values()) {
      if (adapter.supportedMethods.includes(method)) return true
    }
    return false
  }

  /**
   * Return the sole adapter that supports `method`.
   * @throws If none or more than one adapter supports the method.
   */
  resolveForMethod(method: LoginMethod): WalletAdapter {
    const matches = this.list().filter(a => a.supportedMethods.includes(method))
    if (matches.length === 0) {
      throw new Error(`No adapter registered for login method "${method}"`)
    }
    if (matches.length > 1) {
      throw new Error(
        `Multiple adapters support login method "${method}": ${matches.map(a => a.name).join(', ')}. Call registry.get(name) explicitly.`,
      )
    }
    return matches[0]
  }
}
