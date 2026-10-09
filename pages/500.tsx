import { ErrorState } from '../components/site/error-state'
import { PageMeta } from '../components/site/page-meta'
import { SiteLayout } from '../components/site/site-layout'

export default function ServerError() {
  return (
    <SiteLayout>
      <PageMeta title="Something went wrong" noindex />
      <ErrorState code="500" title="Renown hit an error" message="The page could not be loaded. Try again in a moment; if it keeps failing, the service may be down for maintenance." />
    </SiteLayout>
  )
}
