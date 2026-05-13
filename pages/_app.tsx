import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { WagmiProvider } from 'wagmi'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { getChain } from '../utils/viem'
import { wagmiConfig } from '../utils/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { Renown } from '@powerhousedao/reactor-browser/renown'
import '@rainbow-me/rainbowkit/styles.css'

const inter = Inter({ subsets: ['latin'] })

const queryClient = new QueryClient()

function MyApp({ Component, pageProps, router }: AppProps) {
  const chainId = router.query['chain']?.toString() ?? '1'

  const initialChain = getChain(parseInt(chainId))

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <main className={inter.className}>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider
              appInfo={{ appName: 'Renown' }}
              initialChain={initialChain}
            >
              <Renown
                appName="renown-app"
                url={process.env.NEXT_PUBLIC_RENOWN_URL || 'https://www.renown.id'}
                onError={(error) => {
                  // useRenownInit rejects synchronously during SSR — suppress that noise.
                  if (error instanceof Error && error.message === 'window is undefined') return
                  console.error(error)
                }}
              />
              <Component {...pageProps} />
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </main>
    </ThemeProvider>
  )
}

export default MyApp
