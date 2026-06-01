import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Renown } from '@powerhousedao/reactor-browser/renown'
import { AuthRootProvider } from '../services/wallet'
import { Analytics } from '../components/analytics/analytics'
import '@rainbow-me/rainbowkit/styles.css'

const inter = Inter({ subsets: ['latin'] })

const queryClient = new QueryClient()

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <main className={inter.className}>
        <QueryClientProvider client={queryClient}>
          <AuthRootProvider>
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
          </AuthRootProvider>
        </QueryClientProvider>
      </main>
    </ThemeProvider>
  )
}

export default MyApp
