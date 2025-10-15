import { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'
import Image from 'next/image'
import { getProfile, RenownProfile } from '../../services/switchboard'
import styles from '../../styles/Home.module.css'
import RenownLight from '../../assets/images/Renown-light.svg'

interface ProfilePageProps {
  profile: RenownProfile | null
  error?: string
}

const DEFAULT_DRIVE_ID = process.env.NEXT_PUBLIC_RENOWN_DRIVE_ID || 'renown-profiles'

const ProfilePage: NextPage<ProfilePageProps> = ({ profile, error }) => {
  if (error) {
    return (
      <div className={styles.container}>
        <Head>
          <title>Profile Not Found - Renown</title>
          <meta content="Profile not found" name="description" />
          <link href="/favicon.ico" rel="icon" />
        </Head>

        <main className={styles.main}>
          <div className="flex min-h-screen flex-col items-center justify-center">
            <h1 className="text-red-500 mb-4 text-2xl font-bold">Error</h1>
            <p className="text-gray-400">{error}</p>
          </div>
        </main>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className={styles.container}>
        <Head>
          <title>Profile Not Found - Renown</title>
          <meta content="Profile not found" name="description" />
          <link href="/favicon.ico" rel="icon" />
        </Head>

        <main className={styles.main}>
          <div className="flex min-h-screen flex-col items-center justify-center">
            <h1 className="mb-4 text-2xl font-bold text-gray-400">Profile Not Found</h1>
            <p className="text-gray-500">
              The profile you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
          </div>
        </main>
      </div>
    )
  }

  const displayName = profile.username || 'Anonymous'
  const truncatedAddress = profile.ethAddress
    ? `${profile.ethAddress.slice(0, 6)}...${profile.ethAddress.slice(-4)}`
    : null

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <Head>
        <title>{displayName} - Renown Profile</title>
        <meta content={`${displayName}'s Renown profile`} name="description" />
        <link href="/favicon.ico" rel="icon" />
      </Head>

      {/* Header */}
      <header className="absolute left-0 right-0 top-0 z-10 p-6">
        <Image src={RenownLight} alt="Renown" width={154} height={48} />
      </header>

      {/* Main Content */}
      <main className="flex min-h-screen items-center justify-center px-4 pb-12 pt-24">
        <div className="w-full max-w-2xl">
          {/* Profile Card */}
          <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-lg">
            {/* Profile Header */}
            <div className="h-32 bg-gradient-to-r from-purple-600 to-blue-600" />

            {/* Profile Content */}
            <div className="-mt-16 p-8">
              {/* Avatar */}
              <div className="mb-4 flex justify-center">
                {profile.userImage ? (
                  <img
                    src={profile.userImage}
                    alt={displayName}
                    className="h-32 w-32 rounded-full border-4 border-white object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg">
                    <span className="text-5xl font-bold text-white">
                      {displayName[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Username */}
              <h1 className="mb-2 text-center text-3xl font-bold text-white">{displayName}</h1>

              {/* ETH Address */}
              {truncatedAddress && (
                <p className="mb-6 text-center font-mono text-sm text-gray-300">
                  {truncatedAddress}
                </p>
              )}

              {/* Profile Details */}
              <div className="mt-8 space-y-4">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Document ID</span>
                    <span className="break-all font-mono text-sm text-white">
                      {profile.documentId}
                    </span>
                  </div>
                </div>

                {profile.ethAddress && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">ETH Address</span>
                      <span className="break-all font-mono text-xs text-white">
                        {profile.ethAddress}
                      </span>
                    </div>
                  </div>
                )}

                {profile.createdAt && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Member Since</span>
                      <span className="text-sm text-white">
                        {new Date(profile.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps<ProfilePageProps> = async (context) => {
  const { id } = context.params as { id: string }

  if (!id) {
    return {
      props: {
        profile: null,
        error: 'No profile identifier provided',
      },
    }
  }

  try {
    // Try to fetch by ID first, then by username, then by ethAddress
    let profile = await getProfile({
      driveId: DEFAULT_DRIVE_ID,
      id,
    })

    if (!profile) {
      profile = await getProfile({
        driveId: DEFAULT_DRIVE_ID,
        username: id,
      })
    }

    if (!profile) {
      // Check if it looks like an eth address
      if (id.startsWith('0x')) {
        profile = await getProfile({
          driveId: DEFAULT_DRIVE_ID,
          ethAddress: id,
        })
      }
    }

    return {
      props: {
        profile,
      },
    }
  } catch (error) {
    console.error('Error fetching profile:', error)
    return {
      props: {
        profile: null,
        error: 'Failed to fetch profile',
      },
    }
  }
}

export default ProfilePage
