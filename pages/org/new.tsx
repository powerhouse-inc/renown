import type { NextPage } from 'next'
import { OrgBodyLoading } from '../../components/org/org-body-loading'
import { PageMeta } from '../../components/site/page-meta'
import { Container } from '../../components/site/primitives'
import { SiteLayout } from '../../components/site/site-layout'
import { withLazyWalletShell } from '../../components/wallet/lazy-wallet-shell'

// The form with the wallet stack, loaded in the browser only.
const CreateOrgBody = withLazyWalletShell(
  () => import('../../components/org-new/create-org-body').then((m) => m.CreateOrgBody),
  OrgBodyLoading,
)

const NewOrgPage: NextPage = () => (
  <SiteLayout>
    <PageMeta title="Create an organisation" description="Create an organisation on Renown: a shared identity for a team that publishes apps." path="/org/new" noindex />
    <Container className="min-h-[60vh] pt-12 pb-24 md:pt-16">
      <CreateOrgBody />
    </Container>
  </SiteLayout>
)

export default NewOrgPage
