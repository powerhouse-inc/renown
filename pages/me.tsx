import type { NextPage } from 'next'
import { MeLoading } from '../components/me/me-loading'
import { PageMeta } from '../components/site/page-meta'
import { Container } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'
import { withLazyWalletShell } from '../components/wallet/lazy-wallet-shell'

// The dashboard with the wallet stack, loaded in the browser only.
const MeBody = withLazyWalletShell(
  () => import('../components/me/me-page-body').then((m) => m.MePageBody),
  MeLoading,
)

const MePage: NextPage = () => (
  <SiteLayout>
    <PageMeta
      title="Your Renown"
      description="Your Renown identity, profile and the apps you have approved."
      path="/me"
      noindex
    />
    <Container className="min-h-[60vh] pt-12 pb-24 md:pt-16 md:pb-32">
      <MeBody />
    </Container>
  </SiteLayout>
)

export default MePage
