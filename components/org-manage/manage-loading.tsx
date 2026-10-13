import type { WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'

/** The manage pages while the session, the wallet code or the organisation load. */
export function ManageLoading({ error }: WalletFallbackProps) {
  if (error) return <WalletLoadError />
  return (
    <p role="status" className="text-ink-muted py-24 text-center">
      Loading the organisation…
    </p>
  )
}
