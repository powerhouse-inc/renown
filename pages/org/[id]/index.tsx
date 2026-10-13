import type { GetServerSideProps, NextPage } from 'next'
import { NotFoundPage } from '../../../components/ui/not-found-page'
import { orgPath } from '../../../lib/orgs/format'
import { orgRef } from '../../../lib/orgs/handles'
import { fetchOrganization } from '../../../services/orgs'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../../../utils/with-timeout'

interface Props {
  unavailable: boolean
}

/** /org/<id or handle>: the canonical organisation URL is /@handle. */
const OrgById: NextPage<Props> = ({ unavailable }) =>
  unavailable ? (
    <NotFoundPage title="Something went wrong" message="Organisations are temporarily unavailable. Please try again in a moment." />
  ) : (
    <NotFoundPage title="Organisation not found" message="No organisation on Renown has this name or id. Check the link, or browse the directory." />
  )

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, req, res }) => {
  const ref = String(params?.id ?? '')
  try {
    const org = ref ? await withTimeout(fetchOrganization(orgRef(ref), null, req), SSR_DATA_TIMEOUT_MS) : null
    if (org) return { redirect: { destination: orgPath(org.handle), permanent: false } }
    res.statusCode = 404
    return { props: { unavailable: false } }
  } catch (error) {
    // An outage, timeout or RATE_LIMITED answer: 503, never a cacheable 404.
    console.error('Failed to fetch organization from switchboard:', error instanceof Error ? error.message : error)
    res.statusCode = 503
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Retry-After', '30')
    return { props: { unavailable: true } }
  }
}

export default OrgById
