import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { WagmiProvider } from 'wagmi'
import { Inter } from 'next/font/google'
import { getChain } from '../utils/viem'
import { wagmiConfig } from '../utils/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { RenownUserProvider } from '@renown/sdk'
import '@rainbow-me/rainbowkit/styles.css'

const inter = Inter({ subsets: ['latin'] })

const queryClient = new QueryClient()

function MyApp({ Component, pageProps, router }: AppProps) {
  const networkId = router.query['network']?.toString() ?? 'eip155'
  const chainId = router.query['chain']?.toString() ?? '1'

  const initialChain = getChain(parseInt(chainId))

  return (
    <main className={inter.className}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            appInfo={{ appName: 'Renown' }}
            initialChain={initialChain}
          >
            <RenownUserProvider
              renownUrl={process.env.NEXT_PUBLIC_RENOWN_URL || 'https://www.renown.id'}
              networkId={networkId}
              chainId={chainId}
            >
              <Component {...pageProps} />
            </RenownUserProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </main>
  )
}

export default MyApp
