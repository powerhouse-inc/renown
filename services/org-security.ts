// Organisation security, apps and integrations from renown-orgs (renown-package
// A2 and A3): proposals, domains, delegations under org rules, service
// accounts, app transfers, release attestations, webhooks, sign-in clients,
// the audit log and moderation reports. Reads about an organisation send the
// viewer's bearer; release attestations are public.
import {
  orgsRequest,
  ORG_SUMMARY_FIELDS,
  PROPOSAL_FIELDS,
  type OrgMemberStatus,
  type OrgPartyKind,
  type OrgProposal,
  type OrgRole,
  type OrgServerRequest,
  type OrgSummary,
} from './orgs'

export type OrgDomainStatus = 'PENDING' | 'VERIFIED' | 'LAPSED'

export interface OrgDomain {
  id: string
  orgId: string
  domain: string
  status: OrgDomainStatus
  verifiedAt: string | null
  lastCheckedAt: string | null
  failures: number
  createdAt: string
  /** _renown.<domain> */
  txtName: string
  /** renown-org=<orgId>;token=<random> */
  txtValue: string
  /** https://<domain>/.well-known/renown.json */
  wellKnownUrl: string
  wellKnownJson: string
}

export type AppTransferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED'

export interface AppTransfer {
  id: string
  appDid: string
  fromKind: OrgPartyKind
  fromId: string
  toKind: OrgPartyKind
  toId: string
  status: AppTransferStatus
  createdAt: string
  expiresAt: string
  decidedAt: string | null
  decidedBy: string | null
  proposalId: string | null
}

export type OrgCredentialReason = 'ISSUER_NOT_MEMBER' | 'ISSUER_NOT_PUBLISHER' | 'SUSPENDED' | 'APP_FROZEN'

export interface OrgCredentialStatus {
  credentialId: string
  appDid: string | null
  orgId: string | null
  /** Whether the organisation's rules let the delegation count (revocation and expiry are separate). */
  counts: boolean
  reason: OrgCredentialReason | null
}

export interface OrgCredential {
  credentialId: string
  documentId: string
  appDid: string
  issuer: string
  issuerRole: OrgRole | null
  issuerStatus: OrgMemberStatus | null
  issuanceDate: string
  expirationDate: string | null
  revoked: boolean
  status: OrgCredentialStatus
}

export interface OrgWorkload {
  did: string
  repository: string
  productionBranch: string
  ownerAddress: string
  disabled: boolean
  createdAt: string
}

export interface ReleaseAttestation {
  id: string
  appDid: string
  version: string
  artifactDigest: string
  /** "" for person-owned apps. */
  orgId: string
  signer: string
  signerRole: OrgRole | null
  signerStillMember: boolean
  issuedAt: string
  signature: string
  createdAt: string
}

export interface ReleaseAttestationPage {
  items: ReleaseAttestation[]
  next: string | null
}

export type OrgWebhookDeliveryStatus = 'PENDING' | 'PAUSED' | 'DELIVERED' | 'FAILED'

export interface OrgWebhook {
  id: string
  orgId: string
  url: string
  events: string[]
  enabled: boolean
  consecutiveFailures: number
  createdAt: string
}

export interface OrgWebhookCreated {
  webhook: OrgWebhook
  /** Shown once. */
  secret: string
}

export interface OrgWebhookDelivery {
  id: string
  webhookId: string
  eventId: string
  eventType: string
  status: OrgWebhookDeliveryStatus
  attempts: number
  responseStatus: number | null
  lastError: string | null
  createdAt: string
  nextAttemptAt: string | null
  deliveredAt: string | null
}

export type OrgOidcClientStatus = 'ACTIVE' | 'DISABLED'

export interface OrgOidcClient {
  clientId: string
  orgId: string
  name: string
  redirectUris: string[]
  status: OrgOidcClientStatus
  createdAt: string
}

export interface OrgOidcClientCredentials {
  clientId: string
  /** Shown once. */
  clientSecret: string
}

export interface OrgAuditEntry {
  id: string
  orgId: string
  at: string
  /** Lowercase address, or "system". */
  actor: string
  action: string
  /** JSON object. */
  details: string
}

export interface OrgAuditPage {
  items: OrgAuditEntry[]
  next: string | null
}

export type OrgReportReason = 'IMPERSONATION' | 'HANDLE_DISPUTE' | 'SPAM' | 'ABUSE' | 'OTHER'
export type OrgReportStatus = 'OPEN' | 'RESOLVED'
export type OrgReportResolution = 'DISMISS' | 'TAKE_DOWN' | 'RELEASE_HANDLE' | 'RESTORE'

export interface OrgReport {
  id: string
  orgId: string
  org: OrgSummary | null
  reporter: string
  reason: OrgReportReason
  details: string | null
  status: OrgReportStatus
  resolution: OrgReportResolution | null
  resolvedBy: string | null
  resolvedAt: string | null
  note: string | null
  createdAt: string
}

export const DOMAIN_FIELDS = 'id orgId domain status verifiedAt lastCheckedAt failures createdAt txtName txtValue wellKnownUrl wellKnownJson'
export const TRANSFER_FIELDS = 'id appDid fromKind fromId toKind toId status createdAt expiresAt decidedAt decidedBy proposalId'
export const CREDENTIAL_STATUS_FIELDS = 'credentialId appDid orgId counts reason'
export const ORG_CREDENTIAL_FIELDS = `credentialId documentId appDid issuer issuerRole issuerStatus issuanceDate expirationDate revoked status { ${CREDENTIAL_STATUS_FIELDS} }`
export const WORKLOAD_FIELDS = 'did repository productionBranch ownerAddress disabled createdAt'
export const ATTESTATION_FIELDS = 'id appDid version artifactDigest orgId signer signerRole signerStillMember issuedAt signature createdAt'
export const WEBHOOK_FIELDS = 'id orgId url events enabled consecutiveFailures createdAt'
export const DELIVERY_FIELDS = 'id webhookId eventId eventType status attempts responseStatus lastError createdAt nextAttemptAt deliveredAt'
export const OIDC_CLIENT_FIELDS = 'clientId orgId name redirectUris status createdAt'
export const AUDIT_FIELDS = 'id orgId at actor action details'
export const REPORT_FIELDS = `id orgId org { ${ORG_SUMMARY_FIELDS} } reporter reason details status resolution resolvedBy resolvedAt note createdAt`

export async function orgProposals(orgId: string, bearer: string | null): Promise<OrgProposal[]> {
  const data = await orgsRequest<{ orgProposals: OrgProposal[] }>(
    `query OrgProposals($orgId: String!) { orgProposals(orgId: $orgId) { ${PROPOSAL_FIELDS} } }`,
    { orgId },
    { bearer },
  )
  return data.orgProposals
}

export async function orgDomains(orgId: string, bearer: string | null): Promise<OrgDomain[]> {
  const data = await orgsRequest<{ orgDomains: OrgDomain[] }>(`query OrgDomains($orgId: String!) { orgDomains(orgId: $orgId) { ${DOMAIN_FIELDS} } }`, { orgId }, { bearer })
  return data.orgDomains
}

export async function orgCredentials(orgId: string, bearer: string | null): Promise<OrgCredential[]> {
  const data = await orgsRequest<{ orgCredentials: OrgCredential[] }>(
    `query OrgCredentials($orgId: String!) { orgCredentials(orgId: $orgId) { ${ORG_CREDENTIAL_FIELDS} } }`,
    { orgId },
    { bearer },
  )
  return data.orgCredentials
}

export async function orgWorkloads(orgId: string, bearer: string | null): Promise<OrgWorkload[]> {
  const data = await orgsRequest<{ orgWorkloads: OrgWorkload[] }>(`query OrgWorkloads($orgId: String!) { orgWorkloads(orgId: $orgId) { ${WORKLOAD_FIELDS} } }`, { orgId }, { bearer })
  return data.orgWorkloads
}

/** Transfers of one app, one organisation, or one wallet (exactly one filter). */
export async function appTransfers(filter: { appDid?: string; orgId?: string; address?: string }, bearer: string | null): Promise<AppTransfer[]> {
  const data = await orgsRequest<{ appTransfers: AppTransfer[] }>(
    `query AppTransfers($appDid: String, $orgId: String, $address: String) { appTransfers(appDid: $appDid, orgId: $orgId, address: $address) { ${TRANSFER_FIELDS} } }`,
    filter,
    { bearer },
  )
  return data.appTransfers
}

/** An app's release attestations, newest first (public; limit 1-50). */
export async function releaseAttestations(appDid: string, limit = 1, request?: OrgServerRequest | null): Promise<ReleaseAttestationPage> {
  const data = await orgsRequest<{ releaseAttestations: ReleaseAttestationPage }>(
    `query ReleaseAttestations($appDid: String!, $limit: Int) { releaseAttestations(appDid: $appDid, limit: $limit) { items { ${ATTESTATION_FIELDS} } next } }`,
    { appDid, limit },
    { request },
  )
  return data.releaseAttestations
}

export async function orgWebhooks(orgId: string, bearer: string | null): Promise<OrgWebhook[]> {
  const data = await orgsRequest<{ orgWebhooks: OrgWebhook[] }>(`query OrgWebhooks($orgId: String!) { orgWebhooks(orgId: $orgId) { ${WEBHOOK_FIELDS} } }`, { orgId }, { bearer })
  return data.orgWebhooks
}

export async function orgWebhookDeliveries(orgId: string, webhookId: string, bearer: string | null): Promise<OrgWebhookDelivery[]> {
  const data = await orgsRequest<{ orgWebhookDeliveries: OrgWebhookDelivery[] }>(
    `query OrgWebhookDeliveries($orgId: String!, $webhookId: String!, $limit: Int) { orgWebhookDeliveries(orgId: $orgId, webhookId: $webhookId, limit: $limit) { ${DELIVERY_FIELDS} } }`,
    { orgId, webhookId, limit: 20 },
    { bearer },
  )
  return data.orgWebhookDeliveries
}

export async function orgOidcClients(orgId: string, bearer: string | null): Promise<OrgOidcClient[]> {
  const data = await orgsRequest<{ orgOidcClients: OrgOidcClient[] }>(
    `query OrgOidcClients($orgId: String!) { orgOidcClients(orgId: $orgId) { ${OIDC_CLIENT_FIELDS} } }`,
    { orgId },
    { bearer },
  )
  return data.orgOidcClients
}

export async function orgAuditLog(orgId: string, after: string | null, bearer: string | null): Promise<OrgAuditPage> {
  const data = await orgsRequest<{ orgAuditLog: OrgAuditPage }>(
    `query OrgAuditLog($orgId: String!, $limit: Int, $after: String) { orgAuditLog(orgId: $orgId, limit: $limit, after: $after) { items { ${AUDIT_FIELDS} } next } }`,
    { orgId, limit: 50, after },
    { bearer },
  )
  return data.orgAuditLog
}

/** The newest 10 000 audit entries as a JSON array (a string). */
export async function orgAuditExport(orgId: string, bearer: string | null): Promise<string> {
  const data = await orgsRequest<{ orgAuditExport: string }>('query OrgAuditExport($orgId: String!) { orgAuditExport(orgId: $orgId) }', { orgId }, { bearer })
  return data.orgAuditExport
}

/** Platform admins only. */
export async function orgReports(status: OrgReportStatus, bearer: string | null): Promise<OrgReport[]> {
  const data = await orgsRequest<{ orgReports: OrgReport[] }>(`query OrgReports($status: OrgReportStatus) { orgReports(status: $status) { ${REPORT_FIELDS} } }`, { status }, { bearer })
  return data.orgReports
}
