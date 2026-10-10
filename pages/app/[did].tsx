import type { GetServerSideProps, NextPage } from 'next'
import { AppTile } from '../../components/app/app-tile'
import { MarkdownLite } from '../../components/app/markdown-lite'
import { AppHero } from '../../components/app-page/app-hero'
import { AppIdentityPanel } from '../../components/app-page/app-identity-panel'
import { MoreByPublisher, PublisherCard, publisherName } from '../../components/app-page/app-publisher'
import { AppStatsSection } from '../../components/app-page/app-stats'
import { LinkChips } from '../../components/identity/link-chip'
import { PageSection } from '../../components/identity/page-section'
import { PageMeta } from '../../components/site/page-meta'
import { Container } from '../../components/site/primitives'
import { SiteLayout } from '../../components/site/site-layout'
import { NotFoundPage } from '../../components/ui/not-found-page'
import { HERO_ART, identityArtSvgs, PUBLISHER_ART, type IdentityArtSvgs } from '../../lib/identity-art'
import { appJsonLd } from '../../lib/json-ld'
import { qrCode, type QrCode } from '../../lib/qr'
import { APP_DID_RE, fetchAppProfile, getAppProfilesByPublisher, listAppProfiles, type RenownAppProfile } from '../../services/app-profiles'
import { getAppStats, type AppStats } from '../../services/app-stats'
import { mediaUrl } from '../../services/media'
import { getProfile, type RenownProfile } from '../../services/switchboard'
import { linkTarget } from '../../utils/link-service'
import { clipText, markdownPlainText } from '../../utils/markdown-lite'
import { profilePath } from '../../utils/profile-url'
import { canonicalUrl as siteCanonicalUrl, ogImageUrl } from '../../utils/seo'
import { siteOrigin } from '../../utils/site-origin'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'

interface AppPageProps {
  app: RenownAppProfile | null
  /** The hero's identity art (both themes), computed here so the browser never recomputes it. */
  art: IdentityArtSvgs | null
  /** The publisher card's art; null without a publisher. */
  publisherArt: IdentityArtSvgs | null
  /** Public stats; null when the stats read failed or timed out (the section drops out). */
  stats: AppStats | null
  /** The publisher's Renown profile, when it has one. */
  publisher: RenownProfile | null
  /** Lowercase wallet of the publisher, from publisherDid. */
  publisherAddress: string | null
  /** The publisher's other apps (this one excluded), at most 4. */
  moreByPublisher: RenownAppProfile[]
  /** Other apps in the same category (this one excluded), at most 3. */
  moreInCategory: RenownAppProfile[]
  /** Absolute canonical URL (utils/seo canonicalUrl), shared by <link rel=canonical>, share, QR and JSON-LD. */
  canonicalUrl: string | null
  ogImage: string | null
  /** QR code of canonicalUrl for the share menu (computed on the server). */
  qr: QrCode | null
  error?: string
}

const PKH_RE = /^did:pkh:eip155:\d+:(0x[0-9a-fA-F]{40})$/

const AppPage: NextPage<AppPageProps> = ({ app, art, publisherArt, stats, publisher, publisherAddress, moreByPublisher, moreInCategory, canonicalUrl, ogImage, qr, error }) => {
  if (error) return <NotFoundPage title="Something went wrong" message={error} />
  if (!app || !art) return <NotFoundPage title="App not found" message="No app on Renown has this identity. Check the link, or browse the directory." />

  const name = app.name?.trim() || 'Untitled app'
  const description =
    clipText(app.tagline ?? '') || markdownPlainText(app.description ?? '') || `${name}, an app with a verified identity on Renown.`
  const target = app.website ? linkTarget(app.website) : null
  const website = app.website && target ? { url: app.website, host: target.host } : null
  const path = `/app/${app.appDid}`
  const url = canonicalUrl ?? path
  const origin = canonicalUrl ? new URL(canonicalUrl).origin : ''
  const image = app.logoRef && origin ? mediaUrl(app.documentId, 'logo', origin, app.logoRef) : null
  const pubName = publisherAddress ? publisherName(publisher, publisherAddress) : null
  const publisherLd =
    publisherAddress && pubName ? { name: pubName, url: `${origin}${publisher ? profilePath(publisher) : `/profile/${publisherAddress}`}` } : null

  // Only http(s) links are ever shown; the rest count as no links at all.
  const links = app.links.filter((link) => linkTarget(link.url))
  const hasOverview = Boolean(app.description) || links.length > 0
  const hasRelated = Boolean(app.category) && moreInCategory.length > 0
  const hasMain = hasOverview || stats !== null || hasRelated
  const overview = hasOverview && (
    // "Overview" when there is prose; a section of only links is titled for what it holds.
    <PageSection id="app-overview" title={app.description ? 'Overview' : 'Links'}>
      {app.description && <MarkdownLite text={app.description} headingBase={3} className="max-w-[68ch] text-[1.0625rem] leading-7" />}
      {links.length > 0 && (
        <div className={app.description ? 'mt-6' : undefined}>
          <LinkChips links={links} />
        </div>
      )}
    </PageSection>
  )
  const related = hasRelated && (
    <PageSection id="more-in-category" title={`More in ${app.category}`}>
      <ul className="grid gap-5 sm:grid-cols-2">
        {moreInCategory.map((other) => (
          <li key={other.appDid}>
            <AppTile app={other} />
          </li>
        ))}
      </ul>
    </PageSection>
  )
  const sideSections = (
    <>
      {publisherAddress && publisherArt && <PublisherCard publisher={publisher} address={publisherAddress} art={publisherArt} />}
      {pubName && <MoreByPublisher apps={moreByPublisher} name={pubName} />}
      <AppIdentityPanel appDid={app.appDid} />
    </>
  )

  return (
    <SiteLayout>
      <PageMeta
        title={name}
        documentTitle={`${name} on Renown`}
        description={description}
        path={path}
        {...(ogImage && { image: ogImage })}
        jsonLd={[appJsonLd({ app, name, url, image, publisher: publisherLd })]}
      />

      <Container className="max-w-[1120px] pt-6 pb-20 md:pt-10">
        <AppHero app={app} name={name} art={art} website={website} shareUrl={url} qr={qr} />
        {hasMain ? (
          <div data-layout="split" className="mt-12 grid gap-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
            <div data-column="main" className="min-w-0 space-y-12">
              {overview}
              {stats && <AppStatsSection stats={stats} appName={name} />}
              {related}
            </div>
            <aside data-column="aside" className="min-w-0 space-y-10">
              {sideSections}
            </aside>
          </div>
        ) : (
          // Nothing for a main column: one calm column instead of an empty half page.
          <div data-layout="single" className="mt-12 max-w-[560px] space-y-10 sm:px-8">
            {sideSections}
          </div>
        )}
      </Container>
    </SiteLayout>
  )
}

/** A secondary read: bounded by the SSR budget; a failure or timeout drops its section. */
function optional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return withTimeout(promise, SSR_DATA_TIMEOUT_MS).catch(() => fallback)
}

export const getServerSideProps: GetServerSideProps<AppPageProps> = async (context) => {
  const did = String(context.params?.did ?? '')
  const empty: AppPageProps = {
    app: null,
    art: null,
    publisherArt: null,
    stats: null,
    publisher: null,
    publisherAddress: null,
    moreByPublisher: [],
    moreInCategory: [],
    canonicalUrl: null,
    ogImage: null,
    qr: null,
  }
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
  const others = (apps: RenownAppProfile[]) => apps.filter((other) => other.appDid !== app.appDid)
  const [publisher, stats, byPublisher, inCategory] = await Promise.all([
    publisherAddress ? optional(getProfile({ driveId: `renown-${publisherAddress}`, ethAddress: publisherAddress }), null) : Promise.resolve(null),
    optional(getAppStats(did), null),
    publisherAddress ? optional(getAppProfilesByPublisher(publisherAddress), []) : Promise.resolve([]),
    app.category ? optional(listAppProfiles({ limit: 4, category: app.category }).then((page) => page.items), []) : Promise.resolve([]),
  ])
  const origin = siteOrigin(context.req.headers.host)
  // The same URL as <link rel=canonical> (PageMeta), so share, QR and JSON-LD agree with it.
  const canonicalUrl = siteCanonicalUrl(`/app/${did}`)
  context.res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
  return {
    props: {
      app,
      art: identityArtSvgs(app.appDid, { ...HERO_ART, idPrefix: 'app' }),
      publisherArt: publisherAddress ? identityArtSvgs(publisherAddress, { ...PUBLISHER_ART, idPrefix: 'publisher' }) : null,
      stats,
      publisher,
      publisherAddress,
      moreByPublisher: others(byPublisher).slice(0, 4),
      moreInCategory: others(inCategory).slice(0, 3),
      canonicalUrl,
      ogImage: ogImageUrl({ variant: 'app', did }, origin),
      qr: qrCode(canonicalUrl),
    },
  }
}

export default AppPage
