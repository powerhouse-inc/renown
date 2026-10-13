import { buttonClasses } from '../site/primitives'

/** A page body for signed-out visitors: what the page is for and a sign-in button. */
export function SignInPanel({ title, text, login }: { title: string; text: string; login: () => void }) {
  return (
    <div className="border-hairline bg-surface-1 shadow-card rounded-panel mx-auto max-w-lg border px-6 py-12 text-center md:px-10">
      <h1 className="text-ink text-h2">{title}</h1>
      <p className="text-ink-muted mt-4 leading-7">{text}</p>
      <button type="button" onClick={login} className={buttonClasses('primary', 'lg', 'mt-8')}>
        Sign in
      </button>
    </div>
  )
}
