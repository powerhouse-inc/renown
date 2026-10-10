import Link from 'next/link'
import { CopyRow } from '../identity/copy-row'
import { IdentityPanel } from '../identity/identity-panel'

/** "Check this app": the app DID with copy, and how apps prove their identity. */
export function AppIdentityPanel({ appDid }: { appDid: string }) {
  return (
    <IdentityPanel
      title="Check this app"
      footer={
        <>
          Apps prove who they are by signing with the key behind this DID.{' '}
          <Link href="/developers" className="text-primary-ink font-semibold hover:underline">
            How app identities work
          </Link>
        </>
      }
    >
      <CopyRow label="App DID" value={appDid} />
    </IdentityPanel>
  )
}
