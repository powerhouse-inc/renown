// Browser upload of a prepared avatar through renown-package's gated upload
// route (POST <switchboard>/api/@powerhousedao/renown-package/media/uploads),
// authorized by the signed-in user's Renown bearer. The switchboard's raw
// /attachments routes are closed to the public.
import { sha256Hex } from '../utils/image-crop'
import { packageRoutesBase, switchboardOrigin } from './media'

export class AvatarUploadError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AvatarUploadError'
  }
}

interface UploadTarget {
  method: 'PUT'
  url: string
  headers: Record<string, string>
}

interface ReserveResponse {
  ref: string
  deduped?: boolean
  reservationId?: string
  uploadTarget?: UploadTarget | null
  code?: string
  error?: string
}

/**
 * Uploads `blob` (≤ 2 MB PNG/JPEG/WebP) and returns its attachment ref.
 * @throws {AvatarUploadError} with the route's error code when it refuses.
 */
export async function uploadAvatar(blob: Blob, bearer: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const sha256 = await sha256Hex(blob)
  const reserve = await fetchImpl(`${packageRoutesBase()}/media/uploads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ purpose: 'avatar', mimeType: blob.type, sizeBytes: blob.size, sha256 }),
  })
  const body = (await reserve.json().catch(() => ({}))) as ReserveResponse
  if (!reserve.ok) {
    throw new AvatarUploadError(body.error ?? `Upload refused (${reserve.status})`, body.code)
  }
  if (body.deduped) return body.ref

  // S3: PUT to the presigned target with exactly its headers (it pins the
  // length, type and checksum). Filesystem switchboards (local development)
  // take the bytes on their own reservation route.
  const put = body.uploadTarget
    ? await fetchImpl(body.uploadTarget.url, { method: 'PUT', headers: body.uploadTarget.headers, body: blob })
    : await fetchImpl(`${switchboardOrigin()}/attachments/reservations/${encodeURIComponent(body.reservationId ?? '')}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/octet-stream' },
        body: blob,
      })
  if (!put.ok) throw new AvatarUploadError(`Upload failed (${put.status})`, 'UPLOAD_FAILED')
  return body.ref
}
