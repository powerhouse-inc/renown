import type { Hex } from 'viem'
import { profileMessage } from '../renown-signed-messages'
import type { Signer } from './types'

/** How long login waits for the stored profile before giving up on the refresh. */
const PROFILE_READ_TIMEOUT_MS = 3_000

export interface StoredProfile {
  username?: string | null
  userImage?: string | null
}

/** Request body for a signed profile update (`POST /api/profile/update`). */
export interface UpdateProfileBody {
  address: Hex
  username: string | null
  userImage: string | null
  signature: Hex
  timestamp: string
}

export type ProfileRefreshOutcome = 'skipped' | 'unchanged' | 'updated'

/** The short-address username issuance seeds when a wallet has no ENS name ("0x1234...abcd"). */
const PLACEHOLDER_USERNAME = /^0x[0-9a-fA-F]{4}\.\.\.[0-9a-fA-F]{4}$/

/** True when the stored username is unset or only the short-address placeholder. */
export function isUsernameEmpty(username: string | null | undefined): boolean {
  return !username || PLACEHOLDER_USERNAME.test(username)
}

/**
 * Fill a stored profile's missing username/avatar from the wallet's ENS.
 *
 * ENS only fills gaps (a missing username counts the short-address
 * placeholder issuance seeds): a username or image the profile already has — set by
 * the user in the profile editor, or by an earlier ENS fill — is never
 * overwritten. Issuance seeds a profile that doesn't exist yet, so a profile
 * the read model doesn't show yet needs nothing. Only signs (which prompts an
 * external wallet) when something is actually filled.
 *
 * The update is sent without waiting for its response, so the only delay it
 * can add to login is the signature prompt.
 */
export async function refreshProfile(params: {
  address: Hex
  ensName?: string | null
  ensAvatar?: string | null
  signer: Signer
  readProfile: (address: Hex) => Promise<StoredProfile | null>
  updateProfile: (body: UpdateProfileBody) => Promise<void>
}): Promise<ProfileRefreshOutcome> {
  const { address, ensName, signer, readProfile, updateProfile } = params
  if (!ensName) return 'skipped'

  let timer: ReturnType<typeof setTimeout> | undefined
  const stored = await Promise.race([
    readProfile(address),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out reading the stored profile')), PROFILE_READ_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timer))
  if (!stored) return 'unchanged'

  // null in the signed payload means "leave unchanged".
  const username = isUsernameEmpty(stored.username) ? ensName : null
  const userImage = stored.userImage || !params.ensAvatar ? null : params.ensAvatar
  if (username === null && userImage === null) return 'unchanged'

  const timestamp = new Date().toISOString()
  const signature = await signer.signMessage(await profileMessage(address, { username, userImage }, timestamp))
  void updateProfile({ address, username, userImage, signature, timestamp }).catch((e) => {
    console.warn('Failed to update the Renown profile:', e)
  })
  return 'updated'
}
