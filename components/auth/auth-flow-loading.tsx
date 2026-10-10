import type { WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'
import RenownCard from '../ui/renown-card'
import { LoadingBody } from './loading-body'

/**
 * The sign-in card in its loading state, as WebFlow / ConsoleFlow / OidcLoginFlow
 * draw it while the session is restored: shown while their wallet code loads,
 * so the card does not jump when the flow takes over.
 */
export function AuthFlowLoading({ error }: WalletFallbackProps) {
  if (error) return <WalletLoadError />
  return (
    <div className="flex flex-col items-center">
      <RenownCard className="max-w-[482px] rounded-3xl shadow-modal">
        <div className="flex flex-col items-center bg-background px-8 pb-8 pt-10">
          <h2 className="mb-3 text-3xl font-semibold">Signing you in</h2>
          <p className="mb-10 text-center text-lg leading-6 text-muted-foreground-light">
            Hang tight while we finish setting up your session.
          </p>
          <LoadingBody />
        </div>
      </RenownCard>
    </div>
  )
}
