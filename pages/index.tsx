import type { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { WebFlow } from '../components/auth/web-flow'
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
import { useIsClient } from '../hooks/useIsClient'
import { listAppProfiles } from '../services/app-profiles'
import { fetchNetworkStats } from '../services/network-stats'
import { parseExpiresInDays } from '../utils/credential-validity'
import { parseReturnUrl } from '../utils/return-url'
import { publicOrigin } from '../utils/seo'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../utils/with-timeout'
import styles from '../styles/Home.module.css'

type HomeProps = { mode: 'auth' } | ({ mode: 'site' } & HomePageData)

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
            <WebFlow appId={appId} deeplink={deeplink} returnUrl={returnUrl} expiresInDays={expiresInDays} />
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
  // Imported here so shiki stays server-only.
  const { highlight } = await import('../lib/highlight')
  const [featuredApps, pulse, teaser] = await Promise.all([
    withTimeout(listAppProfiles({ limit: 6 }), SSR_DATA_TIMEOUT_MS)
      .then((page) => page.items)
      .catch((error: unknown) => {
        console.error('Homepage: featured apps unavailable:', error)
        return []
      }),
    withTimeout(fetchNetworkStats(), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
      console.error('Homepage: network stats unavailable:', error)
      return null
    }),
    highlight(TEASER_CODE, 'ts').catch((error: unknown) => {
      console.error('Homepage: highlighting failed, showing plain code:', error)
      return { code: TEASER_CODE, html: '' }
    }),
  ])
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  return { props: { mode: 'site', featuredApps, pulse, teaser } }
}

export default Home
