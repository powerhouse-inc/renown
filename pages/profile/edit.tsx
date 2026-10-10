import type { NextPage } from 'next'
import Head from 'next/head'
import { EditProfileLoading } from '../../components/profile-edit/edit-profile-loading'
import { SiteLayout } from '../../components/site/site-layout'
import { withLazyWalletShell } from '../../components/wallet/lazy-wallet-shell'

// The editor with the wallet stack, loaded in the browser only.
const EditProfileBody = withLazyWalletShell(
  () => import('../../components/profile-edit/edit-profile-body').then((m) => m.EditProfileBody),
  EditProfileLoading,
)

const EditProfilePage: NextPage = () => (
  <SiteLayout>
    <Head>
      <title>Edit profile - Renown</title>
      <meta name="robots" content="noindex" />
    </Head>
    <div className="relative mx-auto w-full max-w-5xl px-4 pt-12 pb-20 md:pt-16">
      <EditProfileBody />
    </div>
  </SiteLayout>
)

export default EditProfilePage
