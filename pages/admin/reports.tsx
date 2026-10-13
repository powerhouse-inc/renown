import type { NextPage } from 'next'
import { OrgBodyLoading } from '../../components/org/org-body-loading'
import { PageMeta } from '../../components/site/page-meta'
import { SiteLayout } from '../../components/site/site-layout'
import { withLazyWalletShell } from '../../components/wallet/lazy-wallet-shell'

// Platform admins only; who is one is known only to the switchboard.
const ReportsBody = withLazyWalletShell(() => import('../../components/admin/reports-body').then((m) => m.ReportsBody), OrgBodyLoading)

const AdminReportsPage: NextPage = () => (
  <SiteLayout>
    <PageMeta title="Reports" noindex />
    <ReportsBody />
  </SiteLayout>
)

export default AdminReportsPage
