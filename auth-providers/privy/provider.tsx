import { useMemo, type ReactElement, type ReactNode } from 'react'
import { PrivyProvider } from '@privy-io/react-auth'
import { useTheme } from 'next-themes'
import type { WalletAdapter } from '../../services/wallet/adapter'
import RenownLogo from '../../components/ui/renown-logo'
import { PrivyAdapter } from './adapter'
import { PrivyAdapterBridge } from './bridge'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || undefined
const PRIVY_CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || undefined

// Privy requires the raw <svg> / <img> element — not a component. It inspects
// `element.type` and bails on anything else. Built once at module scope to
// avoid a fresh ReactElement on every render churning PrivyProvider's config.
const PRIVY_LOGO_ELEMENT = RenownLogo({}) as ReactElement

export function PrivyAuthProvider({
  adapter,
  children,
}: {
  adapter: WalletAdapter
  children: ReactNode
}) {
  const { resolvedTheme } = useTheme()
  const theme: 'light' | 'dark' = resolvedTheme === 'light' ? 'light' : 'dark'

  // Memoize so a new config object on every render doesn't cause PrivyProvider
  // to rebuild its context and cascade re-renders / remounts into descendants.
  const config = useMemo(
    () => ({
      appearance: {
        theme,
        accentColor: '#0084FF' as const,
        logo: PRIVY_LOGO_ELEMENT,
      },
      embeddedWallets: {
        ethereum: { createOnLogin: 'users-without-wallets' as const },
      },
    }),
    [theme],
  )

  return (
    <PrivyProvider appId={PRIVY_APP_ID!} clientId={PRIVY_CLIENT_ID} config={config}>
      <PrivyAdapterBridge adapter={adapter as PrivyAdapter} />
      {children}
    </PrivyProvider>
  )
}
