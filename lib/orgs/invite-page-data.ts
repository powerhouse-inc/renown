// /invite/[token]'s server side: the preview, and the headers every answer
// carries. Kept out of the page so a spec can call it with a recording
// response (the dev server rewrites Cache-Control on served pages).
import { orgInviteLinkPreview, type OrgInviteLinkPreview, type OrgServerRequest } from '../../services/orgs'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'
import { INVITE_TOKEN_RE, setInviteHeaders } from './invites'

export interface InvitePageProps {
  preview: OrgInviteLinkPreview | null
  token: string
  unavailable: boolean
}

interface InviteResponse {
  statusCode: number
  setHeader(name: string, value: string): unknown
}

export async function loadInvitePage(rawToken: unknown, res: InviteResponse, req?: OrgServerRequest | null): Promise<{ props: InvitePageProps }> {
  const token = String(rawToken ?? '')
  // The URL carries a secret: never stored by a cache, never passed on as a Referer.
  setInviteHeaders(res)
  if (!INVITE_TOKEN_RE.test(token)) {
    res.statusCode = 404
    return { props: { preview: null, token: '', unavailable: false } }
  }
  try {
    const preview = await withTimeout(orgInviteLinkPreview(token, req), SSR_DATA_TIMEOUT_MS)
    if (!preview) res.statusCode = 404
    return { props: { preview, token: preview ? token : '', unavailable: false } }
  } catch (error) {
    console.error('Invite preview unavailable:', error instanceof Error ? error.name : 'error')
    res.statusCode = 503
    res.setHeader('Retry-After', '30')
    return { props: { preview: null, token: '', unavailable: true } }
  }
}
