import type { NextPage } from 'next'
import { Inbox } from '../components/notifications/inbox'
import { PageMeta } from '../components/site/page-meta'
import { Container } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'

const NotificationsPage: NextPage = () => (
  <SiteLayout>
    <PageMeta
      title="Notifications"
      description="Your organisation notifications on Renown."
      path="/notifications"
      noindex
    />
    <Container className="min-h-[60vh] max-w-[760px] pt-12 pb-24 md:pt-16">
      <Inbox />
    </Container>
  </SiteLayout>
)

export default NotificationsPage
