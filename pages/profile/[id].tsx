import type { GetServerSideProps, NextPage } from 'next'
import { ProfileStats } from '../../components/profile/profile-stats'
import { getUserStats, type UserStatEntry } from '../../services/app-stats'
import Head from 'next/head'
import PageBackground from '../../components/ui/page-background'
import { AppProfileCard } from '../../components/app/app-profile-card'
import { getAppProfilesByPublisher, type RenownAppProfile } from '../../services/app-profiles'
import { NotFoundPage } from '../../components/ui/not-found-page'
import RenownCard from '../../components/ui/renown-card'
import { CopyAddress } from '../../components/profile/copy-address'
import { OwnProfileActions } from '../../components/profile/own-profile-actions'
import { ProfileSummary, profileName } from '../../components/profile/profile-summary'
import { mediaUrl } from '../../services/media'
import { fetchProfile, type RenownProfile } from '../../services/switchboard'
import { DEFAULT_DRIVE_ID } from '../../utils/constants'
import { isEnsVerified } from '../../utils/ens'
import { profilePath } from '../../utils/profile-url'
import { siteOrigin } from '../../utils/site-origin'

interface ProfilePageProps {
  profile: RenownProfile | null
  ensVerified: boolean
  apps: RenownAppProfile[]
  stats: UserStatEntry[]
  /** Absolute canonical URL of this profile. */
  canonicalUrl: string | null
  /** Absolute image for link previews, if the profile has one. */
  ogImage: string | null
  error?: string
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

const ProfilePage: NextPage<ProfilePageProps> = ({ profile, ensVerified, apps, stats, canonicalUrl, ogImage, error }) => {
  if (error) return <NotFoundPage title="Something went wrong" message={error} />
  if (!profile) {
    return <NotFoundPage title="Profile not found" message="The profile you're looking for doesn't exist or has been removed." />
  }

  const address = profile.ethAddress ?? ''
  const name = profileName({ displayName: profile.displayName, username: profile.username, address: address || profile.documentId })
  const title = profile.handle ? `${name} (@${profile.handle})` : name
  const description = profile.bio || `${name} on Renown`

  return (
    <PageBackground>
      <Head>
        <title>{`${title} - Renown`}</title>
        <meta name="description" content={description} />
        {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
        <meta property="og:type" content="profile" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
        {ogImage && <meta property="og:image" content={ogImage} />}
        {profile.handle && <meta property="profile:username" content={profile.handle} />}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
      </Head>

      <main className="relative flex min-h-screen items-center justify-center px-4 pt-24 pb-12">
        <div className="w-full max-w-2xl">
          <RenownCard>
            <div className="space-y-8 p-8">
              <ProfileSummary
                profile={{
                  documentId: profile.documentId,
                  address: address || profile.documentId,
                  displayName: profile.displayName,
                  username: profile.username,
                  handle: profile.handle,
                  bio: profile.bio,
                  links: profile.links,
                  avatar: profile.avatar,
                  userImage: profile.userImage,
                  ensVerified,
                  isPublisher: apps.length > 0,
                }}
              />
              {apps.length > 0 && (
                <section aria-labelledby="apps-published" className="space-y-3">
                  <h2 id="apps-published" className="text-foreground px-1 text-lg font-semibold">
                    Apps published
                  </h2>
                  <div className="grid gap-3">
                    {apps.map((app) => (
                      <AppProfileCard key={app.appDid} app={app} />
                    ))}
                  </div>
                </section>
              )}
              <ProfileStats stats={stats} />
              <div className="space-y-3">
                {ADDRESS_RE.test(address) && <CopyAddress address={address} />}
                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
                  {profile.createdAt && (
                    <span>
                      Member since{' '}
                      {new Date(profile.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                    </span>
                  )}
                  <span className="font-mono text-xs" title="RenownID">
                    {profile.documentId}
                  </span>
                </div>
              </div>
              {ADDRESS_RE.test(address) && <OwnProfileActions address={address} />}
            </div>
          </RenownCard>
        </div>
      </main>
    </PageBackground>
  )
}

export const getServerSideProps: GetServerSideProps<ProfilePageProps> = async (context) => {
  const id = String(context.params?.id ?? '')
  const byHandle = context.query.by === 'handle'
  const empty = { profile: null, ensVerified: false, apps: [], stats: [], canonicalUrl: null, ogImage: null }
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
  const ogImage = profile.avatar
    ? mediaUrl(profile.documentId, 'avatar', origin)
    : profile.userImage && /^https:\/\//i.test(profile.userImage)
      ? profile.userImage
      : null
  context.res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
  const address = profile.ethAddress ?? ''
  const wallet = ADDRESS_RE.test(address)
  const [ensVerified, apps, stats] = await Promise.all([
    isEnsVerified(profile.username, profile.ethAddress),
    wallet ? getAppProfilesByPublisher(address.toLowerCase()) : Promise.resolve([]),
    // Stats are decoration: a failed read must never break the page.
    wallet ? getUserStats(address).catch(() => []) : Promise.resolve([]),
  ])
  return {
    props: {
      profile,
      ensVerified,
      apps,
      stats,
      canonicalUrl: `${origin}${profilePath(profile)}`,
      ogImage,
    },
  }
}

export default ProfilePage
