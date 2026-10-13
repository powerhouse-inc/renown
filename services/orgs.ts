// Renown organisations, read from renown-package's renown-orgs subgraph
// (<switchboard>/graphql/renown-orgs). Public reads carry nothing; reads about
// the visitor send the Renown bearer. Signed writes do not go through here:
// services/org-client-write.ts posts them to /api/org/<mutation>. The one
// bearer write is markNotificationsRead (it changes only the caller's inbox).
import { ClientError, GraphQLClient } from 'graphql-request'
import {
  isOrgErrorCode,
  orgForbiddenReason,
  type OrgFailureCode,
  type OrgForbiddenReason,
} from '../lib/orgs/errors'
import { switchboardOrigin } from './media'
import type { OrgRole } from './org-signed-messages'

export type { OrgRole }
export { orgForbiddenReason, type OrgForbiddenReason }

export type OrgMemberStatus =
  | 'INVITED'
  | 'ACTIVE'
  | 'DECLINED'
  | 'LEFT'
  | 'REMOVED'
  | 'REVOKED'
  | 'EXPIRED'

export interface OrgLink {
  id: string
  label: string
  url: string
}

export interface OrgAppScope {
  all: boolean
  appDids: string[]
}

export interface OrgSummary {
  id: string
  did: string
  handle: string
  name: string
  /** attachment://v1:<sha256>; served at /media/<id>/avatar. */
  avatar: string | null
  verifiedDomains: string[]
}

export interface OrgApp {
  appDid: string
  addedAt: string
  frozen: boolean
}

export interface OrgTeam {
  id: string
  orgId: string
  slug: string
  name: string
  appDids: string[]
  memberAddresses: string[]
}

export interface OrgMembership {
  orgId: string
  address: string
  role: OrgRole
  status: OrgMemberStatus
  appScope: OrgAppScope
  effectiveScope: OrgAppScope
  teams: string[]
}

export interface Organization extends OrgSummary {
  bio: string | null
  website: string | null
  links: OrgLink[]
  listed: boolean
  membersPublic: boolean
  archived: boolean
  takenDown: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  /** Another organisation with a verified domain and the same name. */
  notAffiliatedWith: OrgSummary | null
  ownerCount: number
  memberCount: number
  securityWarnings: 'SINGLE_OWNER'[]
  apps: OrgApp[]
  /** Only for active members; [] otherwise. */
  teams: OrgTeam[]
  /** The caller's ACTIVE membership, when the request proves an address. */
  viewerMembership: OrgMembership | null
}

export type OrgCard = Pick<
  Organization,
  | 'id'
  | 'did'
  | 'handle'
  | 'name'
  | 'bio'
  | 'avatar'
  | 'verifiedDomains'
  | 'memberCount'
  | 'archived'
  | 'takenDown'
  | 'notAffiliatedWith'
>

export interface OrgAffiliation {
  org: OrgSummary & { archived: boolean }
  role: OrgRole
  hidden: boolean
}

export interface OrgSearchPage {
  items: OrgCard[]
  next: string | null
}

export interface OrgMember {
  /** The membership record id; also the invite id while INVITED. */
  id: string
  orgId: string
  address: string
  role: OrgRole
  status: OrgMemberStatus
  appScope: OrgAppScope
  hidden: boolean
  invitedBy: string | null
  invitedAt: string
  joinedAt: string | null
  endedAt: string | null
  updatedAt: string
  expiresAt: string | null
  teams: string[]
  handle: string | null
  displayName: string | null
  avatar: string | null
}

export interface OrgInvite {
  id: string
  orgId: string
  org: OrgSummary
  address: string
  role: OrgRole
  status: OrgMemberStatus
  invitedBy: string | null
  createdAt: string
  expiresAt: string
}

export interface OrgInviteLink {
  id: string
  orgId: string
  role: OrgRole
  maxUses: number
  uses: number
  expiresAt: string
  revoked: boolean
  createdBy: string
  createdAt: string
}

export interface OrgInviteLinkCreated {
  link: OrgInviteLink
  /** Shown once. */
  token: string
}

export interface OrgInviteLinkPreview {
  org: OrgSummary
  role: OrgRole
  expiresAt: string
  expired: boolean
  revoked: boolean
  full: boolean
  usable: boolean
}

export interface OrgHandleAvailability {
  handle: string
  available: boolean
  reason: 'INVALID' | 'RESERVED' | 'TAKEN' | null
}

export type OrgNotificationKind =
  | 'INVITED'
  | 'INVITE_ACCEPTED'
  | 'ROLE_CHANGED'
  | 'REMOVED'
  | 'PROPOSAL_CREATED'
  | 'PROPOSAL_NEEDS_APPROVAL'
  | 'PROPOSAL_EXECUTED'
  | 'PROPOSAL_CANCELLED'
  | 'RECOVERY_STARTED'
  | 'APP_TRANSFER_REQUEST'
  | 'APP_TRANSFER_DONE'
  | 'APP_FROZEN'
  | 'DOMAIN_LAPSED'
  | 'DELEGATION_ADDED'

export interface OrgNotification {
  id: string
  kind: OrgNotificationKind
  orgId: string
  org: OrgSummary | null
  /** JSON object. */
  payload: string
  createdAt: string
  readAt: string | null
}

export interface OrgNotificationPage {
  items: OrgNotification[]
  next: string | null
}

export interface OrganizationStats {
  orgId: string
  apps: number
  /** Sum of each app's 30-day active users: an upper bound. */
  activeUsers30d: number
  activeDelegations: number
  attestations30d: number
}

export type OrgProposalKind =
  | 'ADD_OWNER'
  | 'REMOVE_OWNER'
  | 'TRANSFER_APP_OUT'
  | 'CHANGE_HANDLE'
  | 'DELETE_ORG'
  | 'RECOVER'
  | 'FREEZE_APP'
  | 'UNFREEZE_APP'
export type OrgProposalStatus = 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED'
export type OrgPartyKind = 'PERSON' | 'ORG'

export interface OrgProposalPayload {
  address: string | null
  demoteToAdmin: boolean | null
  appDid: string | null
  toKind: OrgPartyKind | null
  toId: string | null
  handle: string | null
  domain: string | null
}

export interface OrgProposal {
  id: string
  orgId: string
  kind: OrgProposalKind
  payload: OrgProposalPayload
  proposer: string
  approvals: string[]
  threshold: number
  status: OrgProposalStatus
  createdAt: string
  executableAt: string | null
  expiresAt: string
  executedAt: string | null
  reason: string | null
}

const SCOPE_FIELDS = 'all appDids'
export const ORG_SUMMARY_FIELDS = 'id did handle name avatar verifiedDomains'
export const TEAM_FIELDS = 'id orgId slug name appDids memberAddresses'
export const MEMBERSHIP_FIELDS = `orgId address role status appScope { ${SCOPE_FIELDS} } effectiveScope { ${SCOPE_FIELDS} } teams`
export const ORG_FIELDS = `id did handle name bio website avatar links { id label url } listed membersPublic archived takenDown createdBy createdAt updatedAt verifiedDomains notAffiliatedWith { ${ORG_SUMMARY_FIELDS} } ownerCount memberCount securityWarnings apps { appDid addedAt frozen } teams { ${TEAM_FIELDS} } viewerMembership { ${MEMBERSHIP_FIELDS} }`
export const ORG_CARD_FIELDS = `id did handle name bio avatar verifiedDomains memberCount archived takenDown notAffiliatedWith { ${ORG_SUMMARY_FIELDS} }`
export const MEMBER_FIELDS = `id orgId address role status appScope { ${SCOPE_FIELDS} } hidden invitedBy invitedAt joinedAt endedAt updatedAt expiresAt teams handle displayName avatar`
export const INVITE_FIELDS = `id orgId org { ${ORG_SUMMARY_FIELDS} } address role status invitedBy createdAt expiresAt`
export const LINK_FIELDS = 'id orgId role maxUses uses expiresAt revoked createdBy createdAt'
export const PROPOSAL_FIELDS =
  'id orgId kind payload { address demoteToAdmin appDid toKind toId handle domain } proposer approvals threshold status createdAt executableAt expiresAt executedAt reason'
export const NOTIFICATION_FIELDS = `id kind orgId org { ${ORG_SUMMARY_FIELDS} } payload createdAt readAt`

/** A refused or failed renown-orgs request. `field` names the bad argument of a BAD_USER_INPUT. */
export class OrgApiError extends Error {
  constructor(
    readonly code: OrgFailureCode,
    message: string,
    readonly field: string | null = null,
    /** True only when the server answered HTTP 401 (invalid or expired bearer). */
    readonly unauthenticated = false,
  ) {
    super(message)
    this.name = 'OrgApiError'
  }

  /** On FORBIDDEN: replayed signature, archived/taken-down organisation, or denied. */
  get reason(): OrgForbiddenReason | null {
    return this.unauthenticated ? null : orgForbiddenReason(this.code, this.message)
  }
}

/** Any thrown value as an OrgApiError: the GraphQL error's code and field, else NETWORK. */
export function toOrgApiError(error: unknown): OrgApiError {
  if (error instanceof OrgApiError) return error
  if (error instanceof ClientError) {
    const first = error.response.errors?.[0]
    if (error.response.status === 401)
      return new OrgApiError('FORBIDDEN', 'Sign in again', null, true)
    const extensions = (first?.extensions ?? {}) as { code?: unknown; field?: unknown }
    if (first && isOrgErrorCode(extensions.code)) {
      return new OrgApiError(
        extensions.code,
        first.message,
        typeof extensions.field === 'string' ? extensions.field : null,
      )
    }
  }
  return new OrgApiError('NETWORK', 'Renown did not answer')
}

/**
 * Runs a bearer read; when it fails with an HTTP 401 it retries once with a
 * fresh bearer (getBearer({ fresh: true })). Plain FORBIDDEN and every other
 * error pass through, and there is never a second retry. Signed writes are
 * never wrapped: the backend accepts each signature once, so a write is
 * re-signed by the user, not retried here.
 */
export async function withBearer<T>(
  getBearer: (options?: { fresh?: boolean }) => Promise<string | null>,
  read: (bearer: string | null) => Promise<T>,
): Promise<T> {
  try {
    return await read(await getBearer())
  } catch (error) {
    if (!toOrgApiError(error).unauthenticated) throw error
    return read(await getBearer({ fresh: true }))
  }
}

export function orgsEndpoint(): string {
  return `${switchboardOrigin()}/graphql/renown-orgs`
}

/** The part of an incoming server-side request that identifies the visitor (Node's IncomingMessage fits). */
export interface OrgServerRequest {
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string | undefined } | null
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/
const IPV6 = /^(?=.*:.*:)[0-9a-f:]{2,39}$|^::ffff:(?:\d{1,3}\.){3}\d{1,3}$/i

/** An IPv4 or IPv6 literal (no node:net: this module also runs in the browser). */
function isIpLiteral(value: string): boolean {
  return IPV4.test(value) || (IPV6.test(value) && !value.includes(':::'))
}

function firstValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}

/**
 * The visitor's address, from sources the visitor cannot set: x-vercel-forwarded-for
 * (Vercel sets it; first value), x-real-ip (set by the proxy), the LAST hop of
 * x-forwarded-for (the proxy appends the real peer; earlier hops are client-controlled),
 * then the socket's address. null when none is an IP literal.
 */
export function visitorIp(request: OrgServerRequest): string | null {
  const forwarded = firstValue(request.headers['x-forwarded-for'])?.split(',')
  const candidates = [
    firstValue(request.headers['x-vercel-forwarded-for'])?.split(',')[0],
    firstValue(request.headers['x-real-ip']),
    forwarded?.[forwarded.length - 1],
    request.socket?.remoteAddress,
  ]
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value && isIpLiteral(value)) return value
  }
  return null
}

/**
 * Headers for a server-side (SSR / API route) read: the trusted-read token
 * (server-only env, only when set) and the visitor's IP, so renown-orgs
 * rate-limits per visitor, not per renown.id server. Never sent from the browser.
 */
export function serverReadHeaders(
  request: OrgServerRequest,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = env.RENOWN_TRUSTED_READ_TOKEN
  if (token) headers['X-Renown-Read-Token'] = token
  const ip = visitorIp(request)
  if (ip) headers['X-Renown-Client-IP'] = ip
  return headers
}

/** True for a refused-for-volume answer; SSR pages map it to 503, never to an empty listing. */
export function isOrgRateLimited(error: unknown): boolean {
  return error instanceof OrgApiError && error.code === 'RATE_LIMITED'
}

/** One renown-orgs request. Throws OrgApiError. `request` is the incoming SSR request, for server-side reads only. */
export async function orgsRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { bearer?: string | null; endpoint?: string; request?: OrgServerRequest | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(typeof window === 'undefined' && options.request ? serverReadHeaders(options.request) : {}),
    ...(options.bearer ? { Authorization: `Bearer ${options.bearer}` } : {}),
  }
  const client = new GraphQLClient(options.endpoint ?? orgsEndpoint(), { headers })
  try {
    return await client.request<T>(query, variables)
  } catch (error) {
    throw toOrgApiError(error)
  }
}

export const ORGS_PAGE_SIZE = 24
export const ORG_QUERY_MAX = 40

/** The `q` parameter as searched: the first value, trimmed, at most 40 characters (code points). */
export function parseOrgQuery(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return Array.from((value ?? '').trim())
    .slice(0, ORG_QUERY_MAX)
    .join('')
    .trim()
}

/** A blank query lists every listed organisation; otherwise 2 characters are needed. */
export function isOrgSearchable(query: string): boolean {
  return query === '' || Array.from(query).length >= 2
}

/** An organisation by id or handle; null when there is none. `request`: the incoming SSR request (D23). */
export async function fetchOrganization(
  ref: { id: string } | { handle: string },
  bearer?: string | null,
  request?: OrgServerRequest | null,
): Promise<Organization | null> {
  const data = await orgsRequest<{ organization: Organization | null }>(
    `query OrgByRef($id: String, $handle: String) { organization(id: $id, handle: $handle) { ${ORG_FIELDS} } }`,
    ref,
    { bearer, request },
  )
  return data.organization
}

/** One page of listed organisations; a blank query lists them all. */
export async function searchOrganizations(
  query: string,
  after: string | null = null,
  request?: OrgServerRequest | null,
): Promise<OrgSearchPage> {
  const data = await orgsRequest<{ organizationSearch: OrgSearchPage }>(
    `query OrgSearch($query: String, $limit: Int, $after: String) { organizationSearch(query: $query, limit: $limit, after: $after) { items { ${ORG_CARD_FIELDS} } next } }`,
    { query, limit: ORGS_PAGE_SIZE, after },
    { request },
  )
  return data.organizationSearch
}

/** Public memberships of `address`; with that address's bearer, all its ACTIVE ones (hidden included). */
export async function organizationsByMember(
  address: string,
  bearer?: string | null,
  request?: OrgServerRequest | null,
): Promise<OrgAffiliation[]> {
  const data = await orgsRequest<{ organizationsByMember: OrgAffiliation[] }>(
    `query OrgsByMember($address: String!) { organizationsByMember(address: $address) { role hidden org { ${ORG_SUMMARY_FIELDS} archived } } }`,
    { address: address.toLowerCase() },
    { bearer, request },
  )
  return data.organizationsByMember
}

/** The public member list, or (for members, with their bearer) every active member. */
export async function organizationMembers(
  orgId: string,
  includeInactive: boolean,
  bearer?: string | null,
  request?: OrgServerRequest | null,
): Promise<OrgMember[]> {
  const data = await orgsRequest<{ organizationMembers: OrgMember[] }>(
    `query OrgMembers($orgId: String!, $includeInactive: Boolean) { organizationMembers(orgId: $orgId, includeInactive: $includeInactive) { ${MEMBER_FIELDS} } }`,
    includeInactive ? { orgId, includeInactive } : { orgId },
    { bearer, request },
  )
  return data.organizationMembers
}

export async function orgInvites(orgId: string, bearer: string | null): Promise<OrgInvite[]> {
  const data = await orgsRequest<{ orgInvites: OrgInvite[] }>(
    `query OrgInvites($orgId: String!) { orgInvites(orgId: $orgId) { ${INVITE_FIELDS} } }`,
    { orgId },
    { bearer },
  )
  return data.orgInvites
}

export async function orgInviteLinks(
  orgId: string,
  bearer: string | null,
): Promise<OrgInviteLink[]> {
  const data = await orgsRequest<{ orgInviteLinks: OrgInviteLink[] }>(
    `query OrgInviteLinks($orgId: String!) { orgInviteLinks(orgId: $orgId) { ${LINK_FIELDS} } }`,
    { orgId },
    { bearer },
  )
  return data.orgInviteLinks
}

export async function myOrgInvites(bearer: string | null): Promise<OrgInvite[]> {
  const data = await orgsRequest<{ myOrgInvites: OrgInvite[] }>(
    `query MyOrgInvites { myOrgInvites { ${INVITE_FIELDS} } }`,
    {},
    { bearer },
  )
  return data.myOrgInvites
}

/** The public preview of an invite link; null when the token is unknown. */
export async function orgInviteLinkPreview(token: string): Promise<OrgInviteLinkPreview | null> {
  const data = await orgsRequest<{ orgInviteLink: OrgInviteLinkPreview | null }>(
    `query OrgInviteLinkPreview($token: String!) { orgInviteLink(token: $token) { org { ${ORG_SUMMARY_FIELDS} } role expiresAt expired revoked full usable } }`,
    { token },
  )
  return data.orgInviteLink
}

export async function orgHandleAvailability(handle: string): Promise<OrgHandleAvailability> {
  const data = await orgsRequest<{ orgHandleAvailability: OrgHandleAvailability }>(
    `query OrgHandleAvailability($handle: String!) { orgHandleAvailability(handle: $handle) { handle available reason } }`,
    { handle },
  )
  return data.orgHandleAvailability
}

export async function myNotifications(
  options: { unreadOnly: boolean; after: string | null },
  bearer: string | null,
): Promise<OrgNotificationPage> {
  const data = await orgsRequest<{ myNotifications: OrgNotificationPage }>(
    `query MyNotifications($unreadOnly: Boolean, $limit: Int, $after: String) { myNotifications(unreadOnly: $unreadOnly, limit: $limit, after: $after) { items { ${NOTIFICATION_FIELDS} } next } }`,
    { unreadOnly: options.unreadOnly, limit: 30, after: options.after },
    { bearer },
  )
  return data.myNotifications
}

export async function myUnreadNotificationCount(bearer: string | null): Promise<number> {
  const data = await orgsRequest<{ myUnreadNotificationCount: number }>(
    'query MyUnreadNotificationCount { myUnreadNotificationCount }',
    {},
    { bearer },
  )
  return data.myUnreadNotificationCount
}

/** Marks the caller's own notifications read (bearer write; Rulings 3). Returns how many changed. */
export async function markNotificationsRead(
  target: { ids: string[] } | { all: true },
  bearer: string | null,
): Promise<number> {
  const data = await orgsRequest<{ markNotificationsRead: number }>(
    'mutation MarkNotificationsRead($ids: [String!], $all: Boolean) { markNotificationsRead(ids: $ids, all: $all) }',
    target,
    { bearer },
  )
  return data.markNotificationsRead
}

export async function fetchOrganizationStats(
  orgId: string,
  request?: OrgServerRequest | null,
): Promise<OrganizationStats | null> {
  const data = await orgsRequest<{ organizationStats: OrganizationStats | null }>(
    'query OrganizationStats($orgId: String!) { organizationStats(orgId: $orgId) { orgId apps activeUsers30d activeDelegations attestations30d } }',
    { orgId },
    { request },
  )
  return data.organizationStats
}

/** The did:web document JSON (a string), or null when unknown, archived or taken down. */
export async function fetchOrganizationDidDocument(
  orgId: string,
  request?: OrgServerRequest | null,
): Promise<string | null> {
  const data = await orgsRequest<{ organizationDidDocument: string | null }>(
    'query OrgDidDocument($orgId: String!) { organizationDidDocument(orgId: $orgId) }',
    { orgId },
    { request },
  )
  return data.organizationDidDocument
}
