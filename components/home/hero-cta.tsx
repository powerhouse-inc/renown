import { useRenownAuth } from '@powerhousedao/reactor-browser/renown'
import { ButtonLink, buttonClasses } from '../site/primitives'

/** Primary CTA: starts the Renown login, or links to /me once signed in. */
export function HeroCta() {
  const { user, login } = useRenownAuth()
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {user ? (
        <ButtonLink href="/me" size="lg">
          Go to your Renown
        </ButtonLink>
      ) : (
        <button type="button" onClick={() => void login()} className={buttonClasses('primary', 'lg')}>
          Create your Renown ID
        </button>
      )}
      <ButtonLink href="/developers" variant="secondary" size="lg">
        Build with Renown
      </ButtonLink>
    </div>
  )
}
