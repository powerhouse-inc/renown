// /me's content. It reads the wallet session (signature fallback for revoke,
// the e2e stand-in session), so pages/me.tsx loads it inside the wallet shell.
import { buttonClasses } from '../site/primitives'
import { MeDashboard } from './me-dashboard'
import { MeLoading } from './me-loading'
import { useMeSession } from './use-me-session'

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

export function MePageBody() {
  const session = useMeSession()
  if (session.state === 'loading') return <MeLoading error={null} />
  if (session.state === 'signed-out') return <SignInPanel login={session.login} />
  return <MeDashboard key={session.address} session={session} />
}
