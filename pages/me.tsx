import type { NextPage } from 'next'
import { MeDashboard } from '../components/me/me-dashboard'
import { useMeSession } from '../components/me/use-me-session'
import { PageMeta } from '../components/site/page-meta'
import { buttonClasses, Container } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'

function SignInPanel({ login }: { login: () => void }) {
  return (
    <div className="border-hairline bg-surface-1 shadow-card rounded-panel mx-auto max-w-lg border px-6 py-12 text-center md:px-10">
      <h1 className="text-ink text-h2">Your Renown</h1>
      <p className="text-ink-muted mt-4 leading-7">
        Sign in to see your identity and every app you have approved, revoke access and download your data.
      </p>
      <button type="button" onClick={login} className={buttonClasses('primary', 'lg', 'mt-8')}>
        Sign in
      </button>
    </div>
  )
}

const MePage: NextPage = () => {
  const session = useMeSession()
  return (
    <SiteLayout>
      <PageMeta
        title="Your Renown"
        description="Your Renown identity, profile and the apps you have approved."
        path="/me"
        noindex
      />
      <Container className="min-h-[60vh] pt-12 pb-24 md:pt-16 md:pb-32">
        {session.state === 'loading' && (
          <p role="status" className="text-ink-muted py-24 text-center">
            Loading your Renown…
          </p>
        )}
        {session.state === 'signed-out' && <SignInPanel login={session.login} />}
        {session.state === 'signed-in' && <MeDashboard key={session.address} session={session} />}
      </Container>
    </SiteLayout>
  )
}

export default MePage
