import '../styles/globals.css'
import App from 'next/app'
import type { AppContext, AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Renown } from '@powerhousedao/reactor-browser/renown'
import { AuthRootProvider } from '../services/wallet'
import { Analytics } from '../components/analytics/analytics'
import { readProfileHint } from '../services/analytics'
import '@rainbow-me/rainbowkit/styles.css'

const inter = Inter({ subsets: ['latin'] })

const queryClient = new QueryClient()

type MyAppProps = AppProps & {
  /** Wallet from the `op_profile` cookie — seeds OpenPanel's first pageview. */
  initialProfileId?: string
}

function MyApp({ Component, pageProps, initialProfileId }: MyAppProps) {
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
            <Analytics initialProfileId={initialProfileId} />
            <Component {...pageProps} />
          </AuthRootProvider>
        </QueryClientProvider>
      </main>
    </ThemeProvider>
  )
}

/**
 * Reads the `op_profile` cookie so `<Analytics />` can seed OpenPanel with the
 * returning user's wallet before the session restores — the Pages Router
 * equivalent of Vetra's server-layout `cookies()` read.
 *
 * Note: defining `getInitialProps` on `_app` opts the app out of Automatic
 * Static Optimization. Renown is served by a Node server (Docker), so every
 * page is SSR'd anyway and the trade-off is acceptable.
 */
MyApp.getInitialProps = async (appContext: AppContext) => {
  const appProps = await App.getInitialProps(appContext)

  // Server render: raw Cookie header. Client-side transition: document.cookie
  // (keeps the prop stable so the already-executed init script isn't churned).
  const cookieHeader =
    appContext.ctx.req?.headers.cookie ??
    (typeof document !== 'undefined' ? document.cookie : undefined)

  return { ...appProps, initialProfileId: readProfileHint(cookieHeader) }
}

export default MyApp
