import type { GetServerSideProps, NextPage } from 'next'
import { ProfileHero, type ProfileFact } from '../../components/profile/profile-hero'
import { ProfileIdentityPanel } from '../../components/profile/profile-identity-panel'
import { ProfileAbout, ProfileActivity, ProfileApps, ProfileEmpty } from '../../components/profile/profile-sections'
import { PageMeta } from '../../components/site/page-meta'
import { Container } from '../../components/site/primitives'
import { SiteLayout } from '../../components/site/site-layout'
import { NotFoundPage } from '../../components/ui/not-found-page'
import { profileJsonLd } from '../../lib/json-ld'
import { HERO_ART, identityArtSvgs, type IdentityArtSvgs } from '../../lib/identity-art'
import { profileCompleteness } from '../../lib/me/completeness'
import { ADDRESS_RE, memberSince, profileDisplayName, walletDid } from '../../lib/profile-identity'
import { qrCode, type QrCode } from '../../lib/qr'
import { getAppProfilesByPublisher, type RenownAppProfile } from '../../services/app-profiles'
import { getUserStats, type UserStatEntry } from '../../services/app-stats'
import { coverImageUrl, mediaUrl } from '../../services/media'
import { fetchProfile, type RenownProfile } from '../../services/switchboard'
import { DEFAULT_DRIVE_ID } from '../../utils/constants'
import { isEnsVerified } from '../../utils/ens'
import { profilePath } from '../../utils/profile-url'
import { canonicalUrl as siteCanonicalUrl, ogImageUrl } from '../../utils/seo'
import { linkTarget } from '../../utils/link-service'
import { markdownPlainText } from '../../utils/markdown-lite'
import { siteOrigin } from '../../utils/site-origin'
import { groupUserStats } from '../../utils/stat-format'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'

interface ProfilePageProps {
  profile: RenownProfile | null
  ensVerified: boolean
  /** The hero's identity art (both themes), computed here so the browser never recomputes it. */
  art: IdentityArtSvgs | null
  apps: RenownAppProfile[]
  stats: UserStatEntry[]
  /** Absolute canonical URL of this profile. */
  canonicalUrl: string | null
  /** Absolute link-preview image (the generated /api/og profile card). */
  ogImage: string | null
  /** QR code of canonicalUrl for the share menu (computed here, on the server). */
  qr: QrCode | null
  error?: string
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

const ProfilePage: NextPage<ProfilePageProps> = ({ profile, ensVerified, art, apps, stats, canonicalUrl, ogImage, qr, error }) => {
  if (error) return <NotFoundPage title="Something went wrong" message={error} />
  if (!profile || !art) {
    return <NotFoundPage title="Profile not found" message="No Renown profile has this name or address. Check the link, or browse apps to find people who publish them." />
  }

  const address = profile.ethAddress && ADDRESS_RE.test(profile.ethAddress) ? profile.ethAddress.toLowerCase() : null
  const name = profileDisplayName(profile)
  // "frank (@frank)" says the same thing twice: the handle is added only when the name differs from it.
  const ogTitle = profile.handle && profile.handle.toLowerCase() !== name.toLowerCase() ? `${name} (@${profile.handle})` : name
  const description = markdownPlainText(profile.bio ?? '') || `${name} on Renown, the identity layer of the Powerhouse network.`
  const ensName = ensVerified && profile.username && profile.username !== name ? profile.username : null
  const groups = groupUserStats(stats)
  const since = memberSince(profile.createdAt)
  const facts: ProfileFact[] = [
    ...(since ? [{ key: 'since', icon: 'calendar' as const, text: `Member since ${since}` }] : []),
    ...(apps.length > 0 ? [{ key: 'apps', icon: 'apps' as const, text: `${plural(apps.length, 'app', 'apps')} published` }] : []),
    ...(groups.length > 0 ? [{ key: 'active', icon: 'activity' as const, text: `Active in ${plural(groups.length, 'app', 'apps')}` }] : []),
  ]
  // Only http(s) links are ever shown; the rest count as no links at all.
  const links = (profile.links ?? []).filter((link) => linkTarget(link.url))
  const hasContent = Boolean(profile.bio?.trim()) || links.length > 0 || apps.length > 0 || groups.length > 0
  const path = profilePath(profile)
  const url = canonicalUrl ?? path
  const image = profile.avatar && canonicalUrl ? mediaUrl(profile.documentId, 'avatar', new URL(canonicalUrl).origin, profile.avatar) : null

  return (
    <SiteLayout>
      <PageMeta
        title={ogTitle}
        documentTitle={`${ogTitle} on Renown`}
        description={description}
        path={path}
        ogType="profile"
        preloadImage={coverImageUrl(apps[0])}
        {...(ogImage && { image: ogImage })}
        jsonLd={[profileJsonLd({ profile, name, url, image, did: address ? walletDid(address) : null })]}
      >
        {profile.handle && <meta property="profile:username" content={profile.handle} key="profile:username" />}
      </PageMeta>

      <Container className="max-w-[1120px] pt-6 pb-20 md:pt-10">
        <ProfileHero
          profile={profile}
          name={name}
          art={art}
          address={address}
          ensName={ensName}
          facts={facts}
          completeness={profileCompleteness(profile)}
          shareUrl={url}
          qr={qr}
        />
        <div className="mt-12 grid gap-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
          <div className="min-w-0 space-y-12">
            {hasContent ? (
              <>
                <ProfileAbout bio={profile.bio ?? null} links={links} />
                <ProfileApps apps={apps} />
                <ProfileActivity groups={groups} />
              </>
            ) : (
              <ProfileEmpty name={name} />
            )}
          </div>
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <ProfileIdentityPanel address={address} documentId={profile.documentId} />
          </aside>
        </div>
      </Container>
    </SiteLayout>
  )
}

/** A secondary read: bounded by the SSR budget; a failure or timeout drops its section. */
function optional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return withTimeout(promise, SSR_DATA_TIMEOUT_MS).catch(() => fallback)
}

export const getServerSideProps: GetServerSideProps<ProfilePageProps> = async (context) => {
  const id = String(context.params?.id ?? '')
  const byHandle = context.query.by === 'handle'
  const empty = { profile: null, ensVerified: false, art: null, apps: [], stats: [], canonicalUrl: null, ogImage: null, qr: null }
  if (!id) return { props: { ...empty, error: 'No profile identifier provided' } }

  let profile: RenownProfile | null
  try {
    if (byHandle) {
      profile = await fetchProfile({ driveId: DEFAULT_DRIVE_ID, handle: id.toLowerCase() })
    } else if (ADDRESS_RE.test(id)) {
      profile = await fetchProfile({ driveId: `renown-${id.toLowerCase()}`, ethAddress: id.toLowerCase() })
    } else {
      profile =
        (await fetchProfile({ driveId: DEFAULT_DRIVE_ID, id })) ??
        (await fetchProfile({ driveId: DEFAULT_DRIVE_ID, username: id }))
    }
  } catch (error) {
    // An outage is not "no such profile": a 404 would make crawlers drop valid profiles.
    console.error('Failed to fetch profile from switchboard:', error)
    context.res.statusCode = 503
    context.res.setHeader('Cache-Control', 'no-store')
    context.res.setHeader('Retry-After', '30')
    return { props: { ...empty, error: 'Profiles are temporarily unavailable. Please try again in a moment.' } }
  }
  if (!profile) {
    context.res.statusCode = 404
    return { props: empty }
  }

  // One canonical URL per profile: /@handle once a handle exists.
  if (profile.handle && !(byHandle && id === profile.handle)) {
    return { redirect: { destination: `/@${profile.handle}`, permanent: false } }
  }

  const origin = siteOrigin(context.req.headers.host)
  const address = profile.ethAddress ?? ''
  const wallet = ADDRESS_RE.test(address)
  const ogImage = wallet ? ogImageUrl({ variant: 'profile', address }, origin) : ogImageUrl({ variant: 'default' }, origin)
  context.res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
  // Secondary sections: each drops out on failure or timeout; the profile always renders.
  const [ensVerified, apps, stats] = await Promise.all([
    isEnsVerified(profile.username, profile.ethAddress),
    wallet ? optional(getAppProfilesByPublisher(address.toLowerCase()), []) : Promise.resolve([]),
    wallet ? optional(getUserStats(address), []) : Promise.resolve([]),
  ])
  // The same URL as <link rel=canonical> (PageMeta), so share, QR and JSON-LD agree with it.
  const canonicalUrl = siteCanonicalUrl(profilePath(profile))
  return {
    props: {
      profile,
      ensVerified,
      // Seeded like ProfileHero: the lowercase wallet, else the document id.
      art: identityArtSvgs(wallet ? address.toLowerCase() : profile.documentId, { ...HERO_ART, idPrefix: 'profile' }),
      apps,
      stats,
      canonicalUrl,
      ogImage,
      qr: qrCode(canonicalUrl),
    },
  }
}

export default ProfilePage
