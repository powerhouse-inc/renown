import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { createConfig, WagmiProvider, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { Inter } from 'next/font/google'
import { getChain } from '../utils/viem'
import { useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'

const inter = Inter({ subsets: ['latin'] })

// Suppress known Next.js 13.5.11 + React 18.3 fetchPriority warning
const originalError = console.error
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('React does not recognize the `fetchPriority` prop')
  ) {
    return
  }
  originalError.apply(console, args)
}

const INFURA_PROJECT_ID = process.env.NEXT_PUBLIC_VITE_INFURA_PROJECT_ID

const queryClient = new QueryClient()

// Global singleton config - only create once and reuse
let globalWagmiConfig: ReturnType<typeof createConfig> | null = null
let globalConfigKey: string | null = null

function getOrCreateWagmiConfig(networkId: string, chainId: string) {
  const cacheKey = `${networkId}-${chainId}`

  // If we already have a config for this exact chain, return it
  if (globalWagmiConfig && globalConfigKey === cacheKey) {
    return globalWagmiConfig
  }

  // If we have a config but for a different chain, log a warning but return the existing one
  // to avoid multiple WalletConnect initializations
  if (globalWagmiConfig && globalConfigKey !== cacheKey) {
    console.warn(
      `Attempting to switch from ${globalConfigKey} to ${cacheKey}, but reusing existing config to avoid WalletConnect re-initialization`,
    )
    return globalWagmiConfig
  }

  // No config exists yet, create one
  if (networkId !== 'eip155') {
    throw new Error(`Network '${networkId}' is not supported. Supported networks: eip155`)
  }

  const id = parseInt(chainId)
  const chain = getChain(id)
  if (!chain) {
    throw new Error(`Chain with id '${chainId}' not found`)
  }

  console.log(`Creating wagmi config for ${cacheKey}`)

  globalWagmiConfig = createConfig({
    chains: [chain],
    connectors: [
      injected(),
      walletConnect({
        projectId: process.env.NEXT_PUBLIC_VITE_WALLET_CONNECT_PROJECT_ID || '',
        showQrModal: false,
      }),
    ],
    transports: {
      [chain.id]: http(
        INFURA_PROJECT_ID ? `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}` : undefined,
      ),
    },
  })

  globalConfigKey = cacheKey
  console.log(`Wagmi config created and cached for ${cacheKey}`)

  return globalWagmiConfig
}

function MyApp({ Component, pageProps, router }: AppProps) {
  const networkId = router.query['network']?.toString() ?? 'eip155'
  const chainId = router.query['chain']?.toString() ?? '1'

  // Get or create the global singleton config
  // This ensures WalletConnect is only initialized once
  const config = getOrCreateWagmiConfig(networkId, chainId)

  return (
    <main className={inter.className}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <Component {...pageProps} />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </main>
  )
}

export default MyApp
