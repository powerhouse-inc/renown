import type { WalletAdapter } from './adapter'
import type { LoginMethod } from './types'

export class AdapterRegistry {
  private readonly adapters = new Map<string, WalletAdapter>()

  register(adapter: WalletAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(`Adapter "${adapter.name}" is already registered`)
    }
    this.adapters.set(adapter.name, adapter)
  }

  unregister(name: string): void {
    this.adapters.delete(name)
  }

  get(name: string): WalletAdapter | undefined {
    return this.adapters.get(name)
  }

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

  supportsMethod(method: LoginMethod): boolean {
    for (const adapter of this.adapters.values()) {
      if (adapter.supportedMethods.includes(method)) return true
    }
    return false
  }

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
