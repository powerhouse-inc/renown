import type { ReactElement, ReactNode } from 'react'
import { PrivyProvider } from '@privy-io/react-auth'
import { useTheme } from 'next-themes'
import type { WalletAdapter } from '../../services/wallet/adapter'
import RenownLogo from '../../components/ui/renown-logo'
import { PrivyAdapter } from './adapter'
import { PrivyAdapterBridge } from './bridge'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || undefined
const PRIVY_CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || undefined

export function PrivyAuthProvider({
  adapter,
  children,
}: {
  adapter: WalletAdapter
  children: ReactNode
}) {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === 'light' ? 'light' : 'dark'

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID!}
      clientId={PRIVY_CLIENT_ID}
      config={{
        appearance: {
          theme,
          accentColor: '#0084FF',
          // Privy requires the raw <svg> or <img> element — not a component.
          // It inspects `element.type` and bails on anything else.
          logo: RenownLogo({}) as ReactElement,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      <PrivyAdapterBridge adapter={adapter as PrivyAdapter} />
      {children}
    </PrivyProvider>
  )
}
