import type { WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'

/** /profile/edit while the session (or the wallet code) loads. */
export function EditProfileLoading({ error }: WalletFallbackProps) {
  if (error) return <WalletLoadError />
  return <p className="text-muted-foreground py-24 text-center">Loading…</p>
}
