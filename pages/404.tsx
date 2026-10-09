import { ErrorState } from '../components/site/error-state'
import { PageMeta } from '../components/site/page-meta'
import { SiteLayout } from '../components/site/site-layout'

export default function NotFound() {
  return (
    <SiteLayout>
      <PageMeta title="Page not found" noindex />
      <ErrorState code="404" title="This page is not on the network" message="The link may be old or mistyped. Profiles live at renown.id/@handle and apps at renown.id/app/<DID>." />
    </SiteLayout>
  )
}
