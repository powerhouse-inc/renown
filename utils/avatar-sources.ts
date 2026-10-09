import { mediaUrl } from '../services/media'

/** Only images a page can safely load: http(s) URLs and inline images. */
export function isSafeImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^data:image\/(png|jpeg|webp|gif);/i.test(url)
}

interface AvatarSourceInput {
  documentId?: string | null
  /** attachment://v1:<sha256> of the uploaded avatar, if the profile has one. */
  avatar?: string | null
  userImage?: string | null
  previewUrl?: string | null
}

/**
 * Image candidates in order of preference: local preview → uploaded avatar
 * (versioned /media URL, only when an avatar is set) → external image.
 */
export function avatarSources({ documentId, avatar, userImage, previewUrl }: AvatarSourceInput): string[] {
  return [
    previewUrl,
    avatar && documentId ? mediaUrl(documentId, 'avatar', '', avatar) : null,
    userImage && isSafeImageUrl(userImage) ? userImage : null,
  ].filter((src): src is string => !!src)
}
