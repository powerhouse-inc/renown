import type { ReactNode } from 'react'
import { useRouter } from 'next/router'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import type { WalletAdapter } from '../../services/wallet/adapter'
import { getChain } from '../../utils/viem'
import { wagmiConfig } from '../../utils/wagmi'
import { WagmiAdapter } from './adapter'
import { WagmiAdapterBridge } from './bridge'

export function WagmiAuthProvider({
  adapter,
  children,
}: {
  adapter: WalletAdapter
  children: ReactNode
}) {
  const router = useRouter()
  const chainId = router.query['chain']?.toString() ?? '1'
  const initialChain = getChain(parseInt(chainId))

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider appInfo={{ appName: 'Renown' }} initialChain={initialChain}>
        <WagmiAdapterBridge adapter={adapter as WagmiAdapter} />
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  )
}
