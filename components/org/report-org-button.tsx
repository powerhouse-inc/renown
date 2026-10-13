import { useCallback, useRef, useState } from 'react'
import { buttonClasses } from '../site/primitives'
import { withLazyWalletShell, type WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'

function DialogLoading({ error }: WalletFallbackProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-panel p-6">{error ? <WalletLoadError /> : <p role="status">Loading…</p>}</div>
    </div>
  )
}

// The wallet stack and the dialog download only when someone presses Report:
// the organisation page itself stays a marketing page.
const ReportDialog = withLazyWalletShell(() => import('./report-org-dialog').then((m) => m.ReportOrgDialog), DialogLoading)

/** "Report" on an organisation page. */
export function ReportOrgButton({ org }: { org: { id: string; name: string } }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    // The dialog unmounts rather than closing itself: hand focus back to the button.
    button.current?.focus()
  }, [])
  return (
    <>
      <button ref={button} type="button" onClick={() => setOpen(true)} className={buttonClasses('ghost', 'md')}>
        Report
      </button>
      {open && <ReportDialog orgId={org.id} orgName={org.name} onClose={close} />}
    </>
  )
}
