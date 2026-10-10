// The text lines of the profile link-preview card. Pure.
import { profileDisplayName, shortAddress } from '../profile-identity'

export interface ProfileCardText {
  /** The card title: the same name the profile page shows (profileDisplayName). */
  name: string
  /** "@handle", unless the title already is the handle. */
  handleLine: string | null
  /** "0x2bbe…3ac6 on Renown", unless the title already is the short address. */
  addressLine: string | null
}

/** Name, handle and address lines for `address`'s card; no line repeats the title. */
export function profileCardText(
  profile: { displayName: string | null; username: string | null; handle: string | null },
  address: string,
): ProfileCardText {
  const lower = address.toLowerCase()
  const name = profileDisplayName({ ...profile, ethAddress: lower, documentId: lower })
  const short = shortAddress(lower)
  return {
    name,
    handleLine: profile.handle && profile.handle.toLowerCase() !== name.toLowerCase() ? `@${profile.handle}` : null,
    addressLine: name === short ? null : `${short} on Renown`,
  }
}
