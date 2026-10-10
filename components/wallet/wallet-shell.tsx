// The wallet stack (wagmi + RainbowKit + Privy + the auth orchestrator) for the
// routes that sign with a wallet. Only components/wallet/lazy-wallet-shell.tsx
// imports this module, so marketing pages never download it.
import '@rainbow-me/rainbowkit/styles.css'
import type { ReactNode } from 'react'
import { AuthRootProvider } from '../../services/wallet/auth-root-provider'

export function WalletShell({ children }: { children: ReactNode }) {
  return <AuthRootProvider>{children}</AuthRootProvider>
}
