import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useNow } from '../../hooks/use-now'
import { useRemote } from '../../hooks/use-remote'
import { shortDid } from '../../lib/orgs/format'
import { UNCONFIRMED_CHECKING_TEXT } from '../../lib/orgs/errors'
import { expiryText } from '../../lib/orgs/members'
import { partyText, personTransfers } from '../../lib/orgs/transfers'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import { appTransfers, type AppTransfer } from '../../services/org-security'
import { RemoteView } from '../org-manage/manage-ui'
import { buttonClasses } from '../site/primitives'
import type { MeSession } from './use-me-session'
import { withBearer } from '../../services/orgs'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

/** Apps offered to this wallet, and apps it offered to an organisation (spec 3.7). */
export function AppTransfers({ session, onToast }: { session: SignedIn; onToast: (tone: 'success' | 'error', text: string) => void }) {
  const { address, getBearer } = session
  const load = useCallback(async () => withBearer(getBearer, (bearer) => appTransfers({ address: address.toLowerCase() }, bearer)), [address, getBearer])
  const transfers = useRemote(`me-transfers:${address.toLowerCase()}`, load)
  const now = useNow()
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(transfer: AppTransfer, accept: boolean, success: string) {
    setBusy(transfer.id)
    const result = await orgWriter(sessionSigner(session)).write(accept ? 'acceptAppTransfer' : 'declineAppTransfer', { transferId: transfer.id })
    setBusy(null)
    if (result.ok) {
      onToast('success', success)
      transfers.reload()
    } else if (result.unconfirmed) {
      // A lost answer may have been applied: re-read before anyone retries.
      onToast('error', UNCONFIRMED_CHECKING_TEXT)
      transfers.reload()
    } else {
      onToast('error', result.message)
    }
  }

  return (
    <section id="app-transfers" aria-labelledby="app-transfers-title" className="scroll-mt-24">
      <h2 id="app-transfers-title" className="text-ink text-h3">
        App transfers
      </h2>
      <div className="mt-4">
        <RemoteView remote={transfers.state} what="app transfers" onRetry={transfers.reload}>
          {(list) => {
            const { incoming, outgoing } = personTransfers(list, address)
            if (incoming.length === 0 && outgoing.length === 0) return <p className="text-ink-muted text-sm">No app transfers are waiting.</p>
            return (
              <ul className="border-hairline bg-surface-1 rounded-card divide-hairline divide-y border">
                {incoming.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <p className="text-ink min-w-0 text-sm break-words">
                      <Link href={`/app/${t.appDid}`} className="font-mono underline-offset-4 hover:underline">
                        {shortDid(t.appDid)}
                      </Link>{' '}
                      offered to you by {partyText(t.fromKind, t.fromId)}
                      <span className="text-ink-muted">, {expiryText(t.expiresAt, now).toLowerCase()}</span>
                    </p>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy === t.id} onClick={() => void decide(t, true, 'The app is yours now.')} className={buttonClasses('primary', 'md')}>
                        Accept {shortDid(t.appDid)}
                      </button>
                      <button type="button" disabled={busy === t.id} onClick={() => void decide(t, false, 'Transfer declined.')} className={buttonClasses('ghost', 'md')}>
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
                {outgoing.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <p className="text-ink min-w-0 text-sm break-words">
                      <span className="font-mono">{shortDid(t.appDid)}</span> offered to {partyText(t.toKind, t.toId)}, waiting for its admins
                    </p>
                    <button type="button" disabled={busy === t.id} onClick={() => void decide(t, false, 'Transfer cancelled.')} className={buttonClasses('ghost', 'md')}>
                      Cancel the transfer
                    </button>
                  </li>
                ))}
              </ul>
            )
          }}
        </RemoteView>
      </div>
    </section>
  )
}
