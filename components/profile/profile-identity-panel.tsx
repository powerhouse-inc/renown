import Link from 'next/link'
import { walletDid } from '../../lib/profile-identity'
import { CopyRow } from '../identity/copy-row'
import { IdentityPanel } from '../identity/identity-panel'

/** "Check this identity": DID, address (with Etherscan) and the profile document id. */
export function ProfileIdentityPanel({ address, documentId }: { address: string | null; documentId: string }) {
  return (
    <IdentityPanel
      title="Check this identity"
      footer={
        <>
          Every change to this profile is a signed operation, so anyone can check who made it.{' '}
          <Link href="/trust" className="text-primary-ink font-semibold hover:underline">
            How verification works
          </Link>
        </>
      }
    >
      {address && (
        <>
          <CopyRow label="DID" value={walletDid(address)} />
          <CopyRow label="Address" value={address} link={{ href: `https://etherscan.io/address/${address}`, label: 'View on Etherscan' }} />
        </>
      )}
      <p className="text-ink-muted border-hairline border-t py-3 text-xs first:border-t-0 first:pt-0">
        Profile document <span className="font-mono break-all">{documentId}</span>
      </p>
    </IdentityPanel>
  )
}
