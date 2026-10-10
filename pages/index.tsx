import type { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { AuthFlowLoading } from '../components/auth/auth-flow-loading'
import { DevelopersTeaser, TEASER_CODE } from '../components/home/developers-teaser'
import { EcosystemStrip } from '../components/home/ecosystem-strip'
import { FeaturedApps } from '../components/home/featured-apps'
import { FinalCta } from '../components/home/final-cta'
import { Hero } from '../components/home/hero'
import { HowItWorks } from '../components/home/how-it-works'
import { NetworkPulseSection } from '../components/home/network-pulse'
import { Pillars } from '../components/home/pillars'
import type { HomePageData } from '../components/home/types'
import { PageMeta } from '../components/site/page-meta'
import { SiteLayout } from '../components/site/site-layout'
import { withLazyWalletShell } from '../components/wallet/lazy-wallet-shell'
import { useIsClient } from '../hooks/useIsClient'
import { listAppProfiles } from '../services/app-profiles'
import { fetchNetworkStats } from '../services/network-stats'
import { listingCacheControl } from '../utils/cache-control'
import { parseExpiresInDays } from '../utils/credential-validity'
import { parseReturnUrl } from '../utils/return-url'
import { publicOrigin } from '../utils/seo'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../utils/with-timeout'
import styles from '../styles/Home.module.css'

type HomeProps = { mode: 'auth' } | ({ mode: 'site' } & HomePageData)

// The sign-in flow and the wallet stack load only on `/?app=` / `/?connect=`:
// the marketing homepage ships no wallet code.
const LazyWebFlow = withLazyWalletShell(
  () => import('../components/auth/web-flow').then((m) => m.WebFlow),
  AuthFlowLoading,
)

/** `/?app=` / `/?connect=`: the sign-in flow, exactly as before, in the minimal auth chrome. */
function AuthHome() {
  const router = useRouter()
  const connectId = router.query['connect']?.toString()
  const appId = router.query['app']?.toString() || connectId
  const deeplink = router.query['deeplink']?.toString()
  const returnUrl = parseReturnUrl(router.query['returnUrl'])
  const expiresInDays = parseExpiresInDays(router.query['expiresInDays'])
  const isClient = useIsClient()

  return (
    <SiteLayout variant="auth">
      <div className={styles.container}>
        <Head>
          <title>Renown</title>
          <meta content="Created by Powerhouse" name="description" />
        </Head>
        <div className={styles.main}>
          {appId && isClient && (
            <LazyWebFlow appId={appId} deeplink={deeplink} returnUrl={returnUrl} expiresInDays={expiresInDays} />
          )}
        </div>
      </div>
    </SiteLayout>
  )
}

function jsonLd(origin: string): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Renown',
      url: origin,
      logo: `${origin}/favicon.ico`,
      parentOrganization: { '@type': 'Organization', name: 'Powerhouse', url: 'https://www.powerhouse.inc' },
      sameAs: ['https://github.com/powerhouse-inc', 'https://x.com/PowerhouseDAO'],
    },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Renown', url: origin },
  ]
}

function MarketingHome({ featuredApps, pulse, teaser }: HomePageData) {
  return (
    <SiteLayout>
      <PageMeta path="/" jsonLd={jsonLd(publicOrigin())} />
      <Hero apps={featuredApps} />
      <Pillars />
      <HowItWorks />
      <FeaturedApps apps={featuredApps} />
      <NetworkPulseSection pulse={pulse} />
      <DevelopersTeaser code={teaser} />
      <EcosystemStrip />
      <FinalCta />
    </SiteLayout>
  )
}

const Home: NextPage<HomeProps> = (props) => {
  const router = useRouter()
  const inAuthFlow = Boolean(router.query['app'] || router.query['connect'])
  if (inAuthFlow || props.mode === 'auth') return <AuthHome />
  return <MarketingHome featuredApps={props.featuredApps} pulse={props.pulse} teaser={props.teaser} />
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async ({ query, res }) => {
  if (query['app'] || query['connect']) return { props: { mode: 'auth' } }
  let featuredFailed = false
  let pulseFailed = false
  const [featuredApps, pulse, teaser] = await Promise.all([
    withTimeout(listAppProfiles({ limit: 6 }), SSR_DATA_TIMEOUT_MS)
      .then((page) => page.items)
      .catch((error: unknown) => {
        console.error('Homepage: featured apps unavailable:', error)
        featuredFailed = true
        return []
      }),
    withTimeout(fetchNetworkStats(), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
      console.error('Homepage: network stats unavailable:', error)
      pulseFailed = true
      return null
    }),
    // Imported here so shiki stays server-only; a failed import or highlight shows plain code.
    import('../lib/highlight')
      .then(({ highlight }) => highlight(TEASER_CODE, 'ts'))
      .catch((error: unknown) => {
        console.error('Homepage: highlighting failed, showing plain code:', error)
        return { code: TEASER_CODE, html: '' }
      }),
  ])
  // An outage must not be cached at the edge: the next visitor retries.
  res.setHeader('Cache-Control', listingCacheControl(!featuredFailed && !pulseFailed))
  return { props: { mode: 'site', featuredApps, pulse, teaser } }
}

export default Home
