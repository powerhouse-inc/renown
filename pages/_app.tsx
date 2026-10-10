import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Renown } from '@powerhousedao/reactor-browser/renown'
import { Analytics } from '../components/analytics/analytics'

const inter = Inter({ subsets: ['latin'] })

const queryClient = new QueryClient()

// The wallet stack (wagmi, Privy, RainbowKit) is not mounted here: only the
// routes that sign with a wallet load it (components/wallet/lazy-wallet-shell.tsx).
// <Renown> alone restores the Renown session on every page.
function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <div className={inter.className}>
        <QueryClientProvider client={queryClient}>
          <Renown
            appName="renown-app"
            url={process.env.NEXT_PUBLIC_RENOWN_URL || 'https://www.renown.id'}
            onError={(error) => {
              // useRenownInit rejects synchronously during SSR — suppress that noise.
              if (error instanceof Error && error.message === 'window is undefined') return
              console.error(error)
            }}
          />
          <Analytics />
          <Component {...pageProps} />
        </QueryClientProvider>
      </div>
    </ThemeProvider>
  )
}

export default MyApp
