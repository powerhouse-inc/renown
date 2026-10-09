import { useRenownAuth } from '@powerhousedao/reactor-browser/renown'
import Link from 'next/link'

/** "Edit profile" for the signed-in owner of the profile being viewed; nothing for anyone else. */
export function OwnProfileActions({ address }: { address: string }) {
  const { address: signedIn } = useRenownAuth()
  if (!signedIn || signedIn.toLowerCase() !== address.toLowerCase()) return null
  return (
    <div className="flex justify-center">
      <Link
        href="/profile/edit"
        className="bg-primary text-primary-foreground hover:bg-primary/80 rounded-lg px-5 py-2 text-sm font-semibold transition-colors"
      >
        Edit profile
      </Link>
    </div>
  )
}
