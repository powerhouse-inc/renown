import type { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { AppCover } from '../../components/app/app-cover'
import { AppLogo } from '../../components/app/app-logo'
import { AppStatsSection } from '../../components/app/app-stats'
import { MarkdownLite } from '../../components/app/markdown-lite'
import { ProfileAvatar } from '../../components/profile/profile-avatar'
import { ProfileLinks } from '../../components/profile/profile-links'
import { profileName, shortAddress } from '../../components/profile/profile-summary'
import { NotFoundPage } from '../../components/ui/not-found-page'
import { SiteLayout } from '../../components/site/site-layout'
import { APP_DID_RE, fetchAppProfile, type RenownAppProfile } from '../../services/app-profiles'
import { getAppStats, type AppStats } from '../../services/app-stats'
import { getProfile, type RenownProfile } from '../../services/switchboard'
import { profilePath } from '../../utils/profile-url'
import { ogImageUrl } from '../../utils/seo'
import { siteOrigin } from '../../utils/site-origin'

interface AppPageProps {
  app: RenownAppProfile | null
  /** Public stats; null when none or when the stats read failed (never breaks the page). */
  stats: AppStats | null
  /** The publisher's Renown profile, when it has one. */
  publisher: RenownProfile | null
  /** Lowercase wallet of the publisher, from publisherDid. */
  publisherAddress: string | null
  canonicalUrl: string | null
  ogImage: string | null
  error?: string
}

const PKH_RE = /^did:pkh:eip155:\d+:(0x[0-9a-fA-F]{40})$/

function hostOf(url: string): string | null {
  try {
    const { protocol, host } = new URL(url)
    return protocol === 'https:' || protocol === 'http:' ? host.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

function Publisher({ publisher, address }: { publisher: RenownProfile | null; address: string }) {
  const name = publisher
    ? profileName({ displayName: publisher.displayName, username: publisher.username, address })
    : shortAddress(address)
  const href = publisher ? profilePath(publisher) : `/profile/${address}`
  return (
    <Link
      href={href}
      className="bg-secondary/60 hover:bg-secondary inline-flex items-center gap-3 rounded-full py-1.5 pr-4 pl-1.5 transition-colors"
    >
      <ProfileAvatar
        documentId={publisher?.documentId}
        avatar={publisher?.avatar}
        userImage={publisher?.userImage}
        seed={address}
        alt=""
        className="h-8 w-8"
      />
      <span className="text-sm">
        <span className="text-muted-foreground">Published by </span>
        <span className="text-foreground font-semibold">{name}</span>
      </span>
    </Link>
  )
}

const AppPage: NextPage<AppPageProps> = ({ app, stats, publisher, publisherAddress, canonicalUrl, ogImage, error }) => {
  if (error) return <NotFoundPage title="Something went wrong" message={error} />
  if (!app) return <NotFoundPage title="App not found" message="No app on Renown has this identity." />

  const name = app.name || 'Untitled app'
  const title = app.tagline ? `${name} — ${app.tagline}` : name
  const description = app.tagline || `${name} on Renown`
  const website = app.website ? hostOf(app.website) : null

  return (
    <SiteLayout>
      <Head>
        <title>{`${title} - Renown`}</title>
        <meta name="description" content={description} />
        {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
      </Head>

      <div className="relative flex justify-center px-4 pt-12 pb-20 md:pt-16">
        <article className="w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-200 bg-white/80 shadow-2xl backdrop-blur-lg dark:border-white/20 dark:bg-white/10">
          <AppCover documentId={app.documentId} coverRef={app.coverRef} seed={app.appDid} />
          <div className="space-y-8 px-6 pb-8 sm:px-10">
            <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-start">
              <AppLogo documentId={app.documentId} logoRef={app.logoRef} legacyLogo={app.logo} name={name} />
              <div className="min-w-0 flex-1 space-y-1 sm:mt-14">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-foreground text-3xl font-bold break-words">{name}</h1>
                  {app.category && (
                    <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold">{app.category}</span>
                  )}
                </div>
                {app.tagline && <p className="text-muted-foreground text-lg">{app.tagline}</p>}
              </div>
              {app.website && website && (
                <a
                  href={app.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="bg-primary text-primary-foreground! hover:bg-primary/85 inline-flex shrink-0 items-center gap-2 self-start rounded-lg sm:mt-14 px-4 py-2 text-sm font-semibold transition-colors"
                >
                  {website}
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M7 17 17 7M8 7h9v9" />
                  </svg>
                </a>
              )}
            </div>

            {publisherAddress && <Publisher publisher={publisher} address={publisherAddress} />}

            {app.description && <MarkdownLite text={app.description} />}

            <div className="flex justify-start">
              <ProfileLinks links={app.links} align="start" />
            </div>

            {stats && <AppStatsSection stats={stats} />}

            <p className="text-muted-foreground border-t border-gray-200 pt-4 font-mono text-xs break-all dark:border-white/10" title="App identity">
              {app.appDid}
            </p>
          </div>
        </article>
      </div>
    </SiteLayout>
  )
}

export const getServerSideProps: GetServerSideProps<AppPageProps> = async (context) => {
  const did = String(context.params?.did ?? '')
  const empty: AppPageProps = { app: null, stats: null, publisher: null, publisherAddress: null, canonicalUrl: null, ogImage: null }
  let app: RenownAppProfile | null = null
  if (APP_DID_RE.test(did)) {
    try {
      app = await fetchAppProfile(did)
    } catch (error) {
      // An outage is not "no such app": a 404 would make crawlers drop valid pages.
      console.error('Failed to fetch app profile from switchboard:', error)
      context.res.statusCode = 503
      context.res.setHeader('Cache-Control', 'no-store')
      context.res.setHeader('Retry-After', '30')
      return { props: { ...empty, error: 'Apps are temporarily unavailable. Please try again in a moment.' } }
    }
  }
  if (!app) {
    context.res.statusCode = 404
    return { props: empty }
  }

  const publisherAddress = PKH_RE.exec(app.publisherDid ?? '')?.[1]?.toLowerCase() ?? null
  const [publisher, stats] = await Promise.all([
    publisherAddress ? getProfile({ driveId: `renown-${publisherAddress}`, ethAddress: publisherAddress }) : Promise.resolve(null),
    getAppStats(did),
  ])
  const origin = siteOrigin(context.req.headers.host)
  const ogImage = ogImageUrl({ variant: 'app', did }, origin)
  context.res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
  return {
    props: { app, stats, publisher, publisherAddress, canonicalUrl: `${origin}/app/${did}`, ogImage },
  }
}

export default AppPage
