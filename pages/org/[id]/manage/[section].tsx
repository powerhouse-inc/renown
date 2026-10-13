import type { GetServerSideProps, NextPage } from 'next'
import { ManageLoading } from '../../../../components/org-manage/manage-loading'
import { PageMeta } from '../../../../components/site/page-meta'
import { Container } from '../../../../components/site/primitives'
import { SiteLayout } from '../../../../components/site/site-layout'
import { withLazyWalletShell } from '../../../../components/wallet/lazy-wallet-shell'
import { manageSection } from '../../../../lib/orgs/manage-sections'

interface ManagePageProps {
  /** The org handle (or id) from the URL. */
  reference: string
  section: string
  label: string
}

// The manage body with the wallet stack, loaded in the browser only.
const ManageBody = withLazyWalletShell(
  () => import('../../../../components/org-manage/manage-body').then((m) => m.ManageBody),
  ManageLoading,
)

const ManagePage: NextPage<ManagePageProps> = ({ reference, section, label }) => (
  <SiteLayout>
    <PageMeta
      title={`${label} - Manage organisation`}
      description="Manage an organisation on Renown."
      noindex
    />
    <Container className="min-h-[60vh] max-w-[1120px] pt-10 pb-24 md:pt-14">
      <ManageBody reference={reference} section={section} />
    </Container>
  </SiteLayout>
)

export const getServerSideProps: GetServerSideProps<ManagePageProps> = async ({ params, res }) => {
  const meta = manageSection(String(params?.section ?? ''))
  if (!meta) return { notFound: true }
  res.setHeader('Cache-Control', 'private, no-store')
  return { props: { reference: String(params?.id ?? ''), section: meta.key, label: meta.label } }
}

export default ManagePage
