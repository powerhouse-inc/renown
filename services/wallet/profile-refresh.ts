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
  username: string
  userImage: string | null
  signature: Hex
  timestamp: string
}

export type ProfileRefreshOutcome = 'skipped' | 'unchanged' | 'updated'

/**
 * Bring the stored profile in line with the wallet's ENS name and avatar.
 *
 * Issuance only seeds a profile that doesn't exist yet, so a changed ENS name
 * on an existing profile needs its own signed update. Only runs with a real
 * ENS name (never the short-address fallback), and only signs, which prompts
 * an external wallet, when the stored fields differ. A profile the read model
 * doesn't show yet was just seeded by issuance with these same fields.
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
  const userImage = params.ensAvatar ?? null

  let timer: ReturnType<typeof setTimeout> | undefined
  const stored = await Promise.race([
    readProfile(address),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out reading the stored profile')), PROFILE_READ_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timer))
  if (!stored) return 'unchanged'
  if (stored.username === ensName && (stored.userImage ?? null) === userImage) return 'unchanged'

  const timestamp = new Date().toISOString()
  const signature = await signer.signMessage(
    await profileMessage(address, { username: ensName, userImage }, timestamp),
  )
  void updateProfile({ address, username: ensName, userImage, signature, timestamp }).catch((e) => {
    console.warn('Failed to update the Renown profile:', e)
  })
  return 'updated'
}
