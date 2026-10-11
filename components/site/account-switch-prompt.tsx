import { useState } from 'react'
import { shortAddress } from './account-links'
import { buttonClasses, Container } from './primitives'
import { useInjectedAccount } from './use-injected-account'
import type { SiteAuth } from './use-site-auth'

// "Stay as" is remembered for the tab (sessionStorage), per session/wallet pair,
// so the prompt does not come back on every page of the visit.
const STAY_KEY = 'renown:stay-signed-in-as'

function readStay(): string | null {
  try {
    return sessionStorage.getItem(STAY_KEY)
  } catch {
    return null
  }
}

function writeStay(value: string): void {
  try {
    sessionStorage.setItem(STAY_KEY, value)
  } catch {
    // Storage blocked: the choice holds until the next page load.
  }
}

/**
 * Under the header: the wallet in the browser switched to another account than
 * the one signed in to Renown. Offers to sign in as the new account or to stay;
 * never signs out by itself. Only asks the wallet while someone is signed in.
 */
export function AccountSwitchPrompt({ auth }: { auth: SiteAuth }) {
  const signedIn = auth.state === 'signed-in'
  const wallet = useInjectedAccount(signedIn)
  const [stay, setStay] = useState<string | null>(readStay)
  const session = signedIn ? auth.address.toLowerCase() : null
  const pair = session && wallet ? `${session}:${wallet}` : null
  const show = auth.state === 'signed-in' && wallet !== null && wallet !== session && stay !== pair

  return (
    // The live region is always there, so the prompt is announced when it appears.
    <div aria-live="polite">
      {show && (
        <div role="region" aria-label="Wallet account changed" className="border-hairline bg-background border-t">
          <Container className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
            <p className="text-ink min-w-0 flex-1 basis-64 text-sm">
              You switched to {shortAddress(wallet)} in your wallet. You are signed in as {shortAddress(auth.address)}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={auth.switchAccount} className={buttonClasses('primary', 'md')}>
                Sign in as {shortAddress(wallet)}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!pair) return
                  writeStay(pair)
                  setStay(pair)
                }}
                className={buttonClasses('secondary', 'md')}
              >
                Stay as {shortAddress(auth.address)}
              </button>
            </div>
          </Container>
        </div>
      )}
    </div>
  )
}
