import { http } from 'wagmi'
import { mainnet, sepolia, polygon, optimism, arbitrum, base } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

const INFURA_PROJECT_ID = process.env.NEXT_PUBLIC_VITE_INFURA_PROJECT_ID
const WALLET_CONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_VITE_WALLET_CONNECT_PROJECT_ID

if (!WALLET_CONNECT_PROJECT_ID) {
  console.warn(
    'NEXT_PUBLIC_VITE_WALLET_CONNECT_PROJECT_ID is not set — WalletConnect-based wallets will fail at connect time.',
  )
}

const infuraUrl = (subdomain: string) =>
  INFURA_PROJECT_ID ? `https://${subdomain}.infura.io/v3/${INFURA_PROJECT_ID}` : undefined

export const wagmiConfig = getDefaultConfig({
  appName: 'Renown',
  projectId: WALLET_CONNECT_PROJECT_ID || 'MISSING_WALLET_CONNECT_PROJECT_ID',
  chains: [mainnet, sepolia, polygon, optimism, arbitrum, base],
  transports: {
    [mainnet.id]: http(infuraUrl('mainnet')),
    [sepolia.id]: http(infuraUrl('sepolia')),
    [polygon.id]: http(infuraUrl('polygon-mainnet')),
    [optimism.id]: http(infuraUrl('optimism-mainnet')),
    [arbitrum.id]: http(infuraUrl('arbitrum-mainnet')),
    [base.id]: http(infuraUrl('base-mainnet')),
  },
  ssr: true,
})
