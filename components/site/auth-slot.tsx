import { buttonClasses } from './primitives'
import { AccountMenu } from './account-menu'
import type { SiteAuth } from './use-site-auth'

/** Header auth control: a placeholder while the session restores, "Sign in", or the account menu. */
export function AuthSlot({ auth }: { auth: SiteAuth }) {
  if (auth.state === 'loading') {
    return <span aria-hidden="true" className="bg-surface-2 block h-10 w-[92px] animate-pulse rounded-full" />
  }
  if (auth.state === 'signed-out') {
    return (
      <button type="button" onClick={auth.login} className={buttonClasses('secondary', 'md')}>
        Sign in
      </button>
    )
  }
  return (
    <AccountMenu
      address={auth.address}
      displayName={auth.displayName}
      avatarUrl={auth.avatarUrl}
      profile={auth.profile}
      onSignOut={auth.logout}
    />
  )
}
