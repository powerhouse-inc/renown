import type { WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'

/** /me while the session (or the wallet code) loads. */
export function MeLoading({ error }: WalletFallbackProps) {
  if (error) return <WalletLoadError />
  return (
    <p role="status" className="text-ink-muted py-24 text-center">
      Loading your Renown…
    </p>
  )
}
