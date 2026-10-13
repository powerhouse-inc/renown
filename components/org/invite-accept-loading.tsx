// The invite page's Join control while the session (or the wallet code)
// loads. Kept free of wallet code: pages/invite/[token].tsx imports it directly.
import type { WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'

export function InviteAcceptLoading({ error }: WalletFallbackProps) {
  if (error) return <WalletLoadError />
  return <span aria-hidden="true" className="bg-surface-2 mx-auto block h-12 w-56 rounded-full motion-safe:animate-pulse" />
}
