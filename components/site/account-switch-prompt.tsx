import { useEffect, useRef, useState } from 'react'
import { shortAddress } from './account-links'
import { buttonClasses, Container } from './primitives'
import { useInjectedAccount } from './use-injected-account'
import type { SiteAuth } from './use-site-auth'

// "Stay as" is remembered for the tab (sessionStorage), per session/wallet pair,
// so the prompt does not come back on every page of the visit.
const STAY_KEY = 'renown:stay-signed-in-as'

// Set (localStorage, per session address) once this browser's injected wallet
// has shown the session's own account. Only then does another account in that
// wallet mean "you switched": a session made with email, a phone wallet or
// another browser wallet never prompts.
const pairedKey = (session: string) => `renown:injected-session:${session}`

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

function readPaired(session: string): boolean {
  try {
    return localStorage.getItem(pairedKey(session)) === '1'
  } catch {
    return false
  }
}

function writePaired(session: string): void {
  try {
    localStorage.setItem(pairedKey(session), '1')
  } catch {
    // Storage blocked: the pairing holds for this page (state below).
  }
}

/** The header's account menu button (or, below 768 px, the menu button): where focus goes after "Stay". */
function headerFocusTarget(from: HTMLElement | null): HTMLElement | null {
  const header = from?.closest('header')
  if (!header) return null
  const candidates = header.querySelectorAll<HTMLElement>('button[aria-label^="Account menu for "], button[aria-label="Open menu"]')
  return Array.from(candidates).find((element) => element.getClientRects().length > 0) ?? null
}

/**
 * Under the header: the wallet in the browser switched to another account than
 * the one signed in to Renown. Offers to sign in as the new account or to stay;
 * never signs out by itself. Only asks the wallet while someone is signed in,
 * and only prompts once that wallet has been seen on the session's account.
 */
export function AccountSwitchPrompt({ auth }: { auth: SiteAuth }) {
  const signedIn = auth.state === 'signed-in'
  const wallet = useInjectedAccount(signedIn)
  const [stay, setStay] = useState<string | null>(readStay)
  const [seen, setSeen] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const regionRef = useRef<HTMLDivElement>(null)
  const session = signedIn ? auth.address.toLowerCase() : null
  const pair = session && wallet ? `${session}:${wallet}` : null

  // Remembered in state too (adjusted during render), for when storage is blocked.
  if (session && wallet === session && seen !== session) setSeen(session)
  useEffect(() => {
    if (session && wallet === session) writePaired(session)
  }, [session, wallet])

  // wallet is null on the server and until an effect runs, so storage is only read in the browser.
  const paired = session !== null && wallet !== null && (seen === session || readPaired(session))
  const show = auth.state === 'signed-in' && paired && wallet !== session && stay !== pair

  return (
    // The live region is always there, so the prompt is announced when it appears.
    <div aria-live="polite">
      {show && (
        <div ref={regionRef} role="region" aria-label="Wallet account changed" className="border-hairline bg-background border-t">
          <Container className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
            <div className="min-w-0 flex-1 basis-64 text-sm">
              <p className="text-ink">
                You switched to {shortAddress(wallet)} in your wallet. You are signed in as {shortAddress(auth.address)}.
              </p>
              {failed && <p className="text-destructive mt-1">Could not sign out. Try again.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setFailed(false)
                  auth.switchAccount().catch(() => setFailed(true))
                }}
                className={buttonClasses('primary', 'md')}
              >
                Sign in as {shortAddress(wallet)}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!pair) return
                  // Find the target before the prompt (and the focused button) unmounts.
                  const target = headerFocusTarget(regionRef.current)
                  writeStay(pair)
                  setStay(pair)
                  setFailed(false)
                  target?.focus()
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
