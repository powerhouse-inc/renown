import type { WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'

/** An organisation page body while the session (or the wallet code) loads. */
export function OrgBodyLoading({ error }: WalletFallbackProps) {
  if (error) return <WalletLoadError />
  return (
    <p role="status" className="text-ink-muted py-24 text-center">
      Loading…
    </p>
  )
}
