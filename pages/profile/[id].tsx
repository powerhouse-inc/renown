import type { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'
import PageBackground from '../../components/ui/page-background'
import RenownCard from '../../components/ui/renown-card'
import { CopyAddress } from '../../components/profile/copy-address'
import { OwnProfileActions } from '../../components/profile/own-profile-actions'
import { ProfileSummary, profileName } from '../../components/profile/profile-summary'
import { mediaUrl } from '../../services/media'
import { fetchProfile, type RenownProfile } from '../../services/switchboard'
import { DEFAULT_DRIVE_ID } from '../../utils/constants'
import { isEnsVerified } from '../../utils/ens'
import { profilePath } from '../../utils/profile-url'

interface ProfilePageProps {
  profile: RenownProfile | null
  ensVerified: boolean
  /** Absolute canonical URL of this profile. */
  canonicalUrl: string | null
  /** Absolute image for link previews, if the profile has one. */
  ogImage: string | null
  error?: string
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

function siteOrigin(host: string | undefined): string {
  const configured = process.env.NEXT_PUBLIC_RENOWN_URL
  if (configured) return configured.replace(/\/+$/, '')
  return host ? `https://${host}` : 'https://www.renown.id'
}

function NotFound({ title, message }: { title: string; message: string }) {
  return (
    <PageBackground>
      <Head>
        <title>{`${title} - Renown`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="relative flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-foreground mb-2 text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
      </main>
    </PageBackground>
  )
}

const ProfilePage: NextPage<ProfilePageProps> = ({ profile, ensVerified, canonicalUrl, ogImage, error }) => {
  if (error) return <NotFound title="Something went wrong" message={error} />
  if (!profile) {
    return <NotFound title="Profile not found" message="The profile you're looking for doesn't exist or has been removed." />
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
                }}
              />
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
  const empty = { profile: null, ensVerified: false, canonicalUrl: null, ogImage: null }
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
  return {
    props: {
      profile,
      ensVerified: await isEnsVerified(profile.username, profile.ethAddress),
      canonicalUrl: `${origin}${profilePath(profile)}`,
      ogImage,
    },
  }
}

export default ProfilePage
