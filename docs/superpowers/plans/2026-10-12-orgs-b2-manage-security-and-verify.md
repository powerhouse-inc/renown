# Renown Organisations B2 — renown.id security, integrations, app provenance and verify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the renown.id half of organisations: the manage sections for apps (transfers in and out, freeze proposals), security (single-owner warning, owners, proposals with countdowns, delegations with suspend, service accounts, recovery explainer), domains, webhooks, sign-in (OIDC) clients and the audit log; the org publisher, release sign-off, contacts and frozen banner on app pages; the `/apps?org=` filter; organisation rules and release attestations on `/verify`; the Report button and the platform admins' `/admin/reports`.

**Architecture:** Everything plugs into B1: new manage sections register in `MANAGE_SECTIONS` and `SECTION_COMPONENTS` and get the shell's `ManageContext` (signed writes through `ctx.run`, bearer reads through `ctx.getBearer`); new mutations join `ORG_MUTATIONS`, so `/api/org/<mutation>` forwards them with no route change. Reads live in `services/org-security.ts`; pure rules (proposal stages and countdowns, credential reasons, transfers, domains, webhooks, OIDC redirect URIs, audit wording, contacts) live in `lib/orgs/*` and `lib/apps/contacts.ts` with Node-worker tests. App provenance and `/verify`'s organisation lookups use their own query documents, so a switchboard without them only loses those parts.

**Tech Stack:** Next 16.2.6 pages router (webpack), React 19.2.6, Tailwind v4 tokens, graphql-request 7, viem 2.48.4 (`recoverTypedDataAddress`, loaded on demand; `signTypedData` in tests), `@renown/sdk` 6.2.3 (existing `/verify` checks), Playwright 1.57 with the stub switchboard, pnpm 10, Node 24.

**Spec:** `/home/f/projects/renown-package-orgs/docs/superpowers/specs/2026-10-12-renown-organisations-design.md` — section 5 (sub-project B) and sections 3.5–3.12 (behaviour). Binding API: the "Appendix — API contract" and "Rulings" of `/home/f/projects/renown-package-orgs/docs/superpowers/plans/2026-10-12-orgs-a1-core.md` (A2 and A3 SDL blocks, the attestation EIP-712 types, the webhook payload), plus A2 rulings 1–16 and A3 rulings 1–9 in `2026-10-12-orgs-a2-security-apps.md` and `2026-10-12-orgs-a3-integrations.md`. This plan builds on B1, `docs/superpowers/plans/2026-10-12-orgs-b1-public-and-membership.md`, whose tasks must be done first.

**Code repo:** `/home/f/projects/renown-orgs`, branch `feat/organisations` with B1 merged in. All paths are relative to it.

## Rulings

B1's rulings hold. In addition:

1. **One registry each.** B2 inserts its sections into `MANAGE_SECTIONS` in this order: members, teams, **apps**, **security**, **domains**, **webhooks**, **oidc** ("Sign-in clients"), **audit** ("Audit log"), settings; and its mutations into `ORG_MUTATIONS` (`approveOrgProposal`, `cancelOrgProposal`, `executeOrgProposal`, `addOrgDomain`, `checkOrgDomain`, `removeOrgDomain`, `proposeAppTransfer`, `acceptAppTransfer`, `declineAppTransfer`, `suspendOrgCredentials`, `unsuspendOrgCredential`, `setOrgWorkloadDisabled`, `createOrgWebhook`, `updateOrgWebhook`, `deleteOrgWebhook`, `testOrgWebhook`, `registerOrgOidcClient`, `updateOrgOidcClient`, `rotateOrgOidcClientSecret`, `reportOrganization`, `resolveOrgReport`). `startOrgRecovery`, `attestRelease` and `markNotificationsRead` are not in the registry (recovery has no UI, attestations come from CLIs, the inbox uses the bearer).
2. **Who sees what** (A2 ruling 2, spec 3.2): apps for every active member (owners propose freeze, unfreeze and transfer out; admins accept, decline or cancel transfers; anyone who personally publishes an app may bring it in); security, domains, webhooks, sign-in clients and audit log for admins and owners; inside security only owners propose, approve, cancel and execute, and admins suspend credentials and disable service accounts. The UI hides what the switchboard would refuse; the switchboard decides.
3. **Proposal stages** are computed in the browser from `executableAt`, `expiresAt` and `threshold` (`lib/orgs/proposals.ts`), refreshed every 30 s: "Needs N more owner approvals", "Can run in 1 day 4 hours", "Ready to run", "Expired". Execute shows only when ready; a late refusal (`PROPOSAL_NOT_EXECUTABLE`) shows the switchboard's own text.
4. **Secrets are shown once**: the webhook secret and an OIDC client secret appear in a "copy it now" region after the write that returned them, are kept only in component state (gone on navigation), never logged and never sent to analytics.
5. **Transfers.** Person → org: the person proposes from the org's apps section ("Bring an app you publish", preselected by `?bring=<appDid>`, the link target for vetra.io's "Transfer to organisation"); org admins accept. Org → anyone: an owner's `TRANSFER_APP_OUT` proposal; once it runs, the recipient accepts (an org's admins in its apps section, a person on `/me#app-transfers`). The source side cancels a pending transfer with `declineAppTransfer` (A2 ruling 12).
6. **App page provenance** comes from a separate `query AppProvenance` on renown-stats (`frozen supportContact securityContact publisherOrg {…}`) and `releaseAttestations(appDid, limit: 1)`; a failure drops only those parts. When `publisherOrg` is set, the org card replaces the person card (the person card already disappears: `publisherDid` is then the org's `did:web`), "More apps by" reads `appProfilesByPublisher(orgDid)`, and JSON-LD names the org. Contacts render only as an email (`mailto:`) or an https URL; anything else is not shown.
7. **`/apps?org=<handle>`** resolves the handle on the server, lists `appProfiles(orgId)` (B1's `AppProfilesByOrg` document), shows a "Published by <name>" chip with a link back to all apps, and hides the category chips while filtered; an unknown handle shows "No organisation has the handle @<handle>." and no apps.
8. **`/verify`.** A JSON paste with string `appDid`, `version`, `artifactDigest`, `orgId`, `issuedAt`, `signer` and `signature` is a release attestation (extra fields such as `id` are ignored). It is checked offline with viem's `recoverTypedDataAddress` (domain `{name: "Renown Release", version: "1", chainId: 1}`), then with the existing smart-wallet fallback on chain 1, then cross-checked against `releaseAttestations(appDid, limit: 50)` by signature. Credentials, tokens and operations whose authorising credential belongs to an organisation app get an "Allowed by the organisation" check from `orgCredentialStatus(credentialId)`: `counts: false` turns a genuine verdict into "Revoked" with the reason in plain words; a failed lookup turns it into "Could not check". The app card names the publishing organisation. Only the credential id and the app DID leave the browser for these checks.
9. **Reports.** The org page's Report button is marketing-safe: the dialog body loads with `withLazyWalletShell` only after the click. `/admin/reports` is client-only inside the wallet shell; signed-out visitors and anyone the switchboard answers `FORBIDDEN` see the 404 content (HTTP 200, `noindex`, because the session lives in the browser). Resolutions are signed.
10. **Recovery has no UI** beyond the explainer in Security (spec 5 lists only an explainer): a domain controller starts it with `startOrgRecovery` through the API; owners see and cancel the resulting `RECOVER` proposal in Security like any other.
11. **Audit export** downloads `orgAuditExport` as `renown-<handle>-audit-<YYYY-MM-DD>.json`, built in the browser from the string the switchboard returns (it is already JSON).

## Global Constraints

- Conventional commits (`feat(orgs): …`, `test(orgs): …`, `ci: …`); **no `Co-Authored-By` or "Generated with" lines** in commits or PR descriptions.
- After every task: `pnpm lint` and `pnpm build` (runs `node scripts/check-wallet-chunks.mjs`) pass, and the task's specs pass with `pnpm exec playwright test e2e/<file> --reporter=line 2>&1 | tail -20`. Keep command output short.
- The wallet shell stays lazy: `/profile/[id]` (org pages), `/app/[did]`, `/apps` and `/verify` stay in `MARKETING_PAGES` and load no wallet code up front.
- Analytics only through `services/analytics`; no secrets, tokens, addresses or handles in event properties. B2 adds no events.
- API names, arguments, enums and error codes exactly as in the A2/A3 SDL blocks of the A1 appendix.
- Copy: UK spelling, sentence case, no ALL-CAPS, no "→", no middle dots. The `/verify` attestation summary follows the spec's sentence ("Release 1.4 of <App> — published by Acme, signed off by Alice").
- Code style: the repo's Prettier; relative imports; no new dependencies; `react-hooks` 7 rules (no synchronous `setState` in effect bodies; no `Date.now()`/`new Date()` during render outside `useState` initialisers and `useNow`).
- Staging first: B1 and B2 deploy together to `deploy/staging`, then `main`.

## Review Focus

1. **A proposal whose wait ends while the page is open.** Expected: the countdown reaches "Ready to run" and Execute appears without a reload; executing early is refused with the switchboard's message. Pinned in Task 1 ("stages: approvals, waiting, ready, expired") and Task 3 ("shows countdowns and offers Execute only when ready").
2. **A secret shown once** (webhook, OIDC client). Expected: visible right after creation with a copy button, gone after leaving the section, never in the URL. Pinned in Task 4 ("shows the webhook secret once") and Task 5 ("shows the client secret once and again only after a rotation").
3. **A delegation signed by a member who has since been removed, pasted into `/verify`.** Expected: "Revoked" with "… is no longer a member of Acme", not "Genuine". Pinned in Task 7 ("a credential whose issuer left the organisation no longer counts").
4. **An app page against a switchboard that does not know `publisherOrg`/contacts yet.** Expected: the page renders as before (the provenance query fails on its own). Pinned in Task 6 ("still renders when provenance cannot be read").
5. **A non-admin (or signed-out visitor) opening `/admin/reports`.** Expected: the 404 content and no report data. Pinned in Task 8 ("shows the 404 content to everyone but platform admins").

---

## File Structure

| File | Responsibility |
| --- | --- |
| `services/org-security.ts` | A2/A3 types, field selections and reads (proposals, domains, credentials, workloads, transfers, attestations, webhooks, deliveries, OIDC clients, audit, reports) |
| `services/org-mutations.ts` | + the B2 mutations |
| `lib/orgs/proposals.ts`, `lib/orgs/credentials.ts`, `lib/orgs/transfers.ts` | proposal stages, countdowns, permissions; credential reasons; transfer directions |
| `lib/orgs/domains.ts`, `lib/orgs/webhooks.ts`, `lib/orgs/oidc.ts`, `lib/orgs/audit.ts` | per-section pure rules |
| `components/org-manage/apps-section.tsx`, `security-section.tsx` (+ `proposals-panel.tsx`, `delegations-panel.tsx`, `workloads-panel.tsx`, `owners-panel.tsx`), `domains-section.tsx`, `webhooks-section.tsx`, `oidc-section.tsx`, `audit-section.tsx`, `secret-once.tsx` | the manage sections |
| `components/me/app-transfers.tsx` | pending app transfers to and from the wallet on `/me` |
| `services/app-profiles.ts`, `lib/apps/contacts.ts`, `components/app-page/org-publisher-card.tsx`, `app-contacts.tsx`, `frozen-banner.tsx`, `pages/app/[did].tsx` | app page provenance |
| `pages/apps.tsx`, `components/apps/use-app-directory.ts`, `components/apps/org-filter-chip.tsx`, `utils/app-directory.ts` | `/apps?org=` |
| `lib/verify/types.ts`, `detect.ts`, `org-lookups.ts`, `org-rules.ts`, `attestation.ts`, `parties.ts`, `credential.ts`, `token.ts`, `operation.ts`, `run.ts`, `lookups.ts`, `components/verify/party-cards.tsx` | `/verify` organisation rules and release attestations |
| `components/org/report-org-button.tsx`, `components/org/report-org-dialog.tsx`, `components/org/org-page.tsx`, `pages/admin/reports.tsx`, `components/admin/reports-body.tsx` | reports and moderation |
| `e2e/support/org-fixtures.ts`, `e2e/support/org-manage.ts`, `e2e/support/stub-switchboard.mjs` | builders, stats-read helper, stub defaults |
| `e2e/org-security-client.spec.ts`, `e2e/org-manage-apps.spec.ts`, `e2e/org-manage-security.spec.ts`, `e2e/org-manage-integrations.spec.ts`, `e2e/org-manage-oidc-audit.spec.ts`, `e2e/app-provenance.spec.ts`, `e2e/verify-orgs.spec.ts`, `e2e/org-reports.spec.ts`, `e2e/layout-invariants.spec.ts`, `.github/workflows/e2e.yml` | tests and CI |

---

### Task 1: Security client core — reads, mutations, pure rules, fixtures

**Files:**
- Create: `services/org-security.ts`, `lib/orgs/proposals.ts`, `lib/orgs/credentials.ts`, `lib/orgs/transfers.ts`
- Modify: `services/org-mutations.ts` (B2 mutations), `e2e/support/stub-switchboard.mjs` (`DEFAULT_DATA`), `e2e/support/org-fixtures.ts` (builders, `serveStatsReads`), `e2e/support/org-manage.ts` (`search` option)
- Test: `e2e/org-security-client.spec.ts`

**Interfaces:**
- Consumes: `orgsRequest`, `ORG_SUMMARY_FIELDS`, `PROPOSAL_FIELDS`, `OrgSummary`, `OrgRole`, `OrgMemberStatus`, `OrgPartyKind`, `OrgProposal`, `OrgProposalKind`, `OrgProposalStatus` (B1 `services/orgs.ts`); `ORG_MUTATIONS`, `mutationDocument`, `argsProblem` (B1); `shortAddress`, `shortDid` (B1 `lib/orgs/format.ts`).
- Produces:
  - `services/org-security.ts`: types `OrgDomainStatus`, `OrgDomain`, `AppTransferStatus`, `AppTransfer`, `OrgCredentialReason`, `OrgCredentialStatus`, `OrgCredential`, `OrgWorkload`, `ReleaseAttestation`, `ReleaseAttestationPage`, `OrgWebhookDeliveryStatus`, `OrgWebhook`, `OrgWebhookCreated`, `OrgWebhookDelivery`, `OrgOidcClientStatus`, `OrgOidcClient`, `OrgOidcClientCredentials`, `OrgAuditEntry`, `OrgAuditPage`, `OrgReportReason`, `OrgReportStatus`, `OrgReportResolution`, `OrgReport`; field strings `DOMAIN_FIELDS`, `TRANSFER_FIELDS`, `CREDENTIAL_STATUS_FIELDS`, `ORG_CREDENTIAL_FIELDS`, `WORKLOAD_FIELDS`, `ATTESTATION_FIELDS`, `WEBHOOK_FIELDS`, `DELIVERY_FIELDS`, `OIDC_CLIENT_FIELDS`, `AUDIT_FIELDS`, `REPORT_FIELDS`; reads `orgProposals(orgId, bearer)`, `orgDomains(orgId, bearer)`, `orgCredentials(orgId, bearer)`, `orgWorkloads(orgId, bearer)`, `appTransfers(filter: { appDid?: string; orgId?: string; address?: string }, bearer)`, `releaseAttestations(appDid, limit?)`, `orgWebhooks(orgId, bearer)`, `orgWebhookDeliveries(orgId, webhookId, bearer)`, `orgOidcClients(orgId, bearer)`, `orgAuditLog(orgId, after, bearer)`, `orgAuditExport(orgId, bearer)`, `orgReports(status, bearer)`.
  - `lib/orgs/proposals.ts`: `PROPOSAL_KIND_LABELS`, `PROPOSAL_STATUS_LABELS`, `proposalSummary(p, appName?): string`, `type ProposalStage`, `proposalStage(p, now): ProposalStage`, `countdown(untilIso, now): string`, `stageText(stage, now): string`, `canApprove(p, viewer, role)`, `canCancel(p, viewer, role)`, `canExecute(p, viewer, role, now)`.
  - `lib/orgs/credentials.ts`: `CREDENTIAL_REASON_TEXT`, `credentialStateText(c: OrgCredential): string`, `canUnsuspend(c): boolean`.
  - `lib/orgs/transfers.ts`: `transferDirection(t, orgId): 'in' | 'out' | null`, `personTransfers(list, address): { incoming; outgoing }`, `partyText(kind, id): string`.
  - `e2e/support/org-fixtures.ts`: `orgDomain`, `appTransfer`, `orgCredential`, `orgWorkload`, `orgWebhook`, `orgDelivery`, `orgOidcClient`, `auditEntry`, `orgReport`, `releaseAttestation`, `appProfile`, `serveStatsReads(page, answers)`.
  - `e2e/support/org-manage.ts`: `openManagePage(…, { search? })` appends `?<search>` to the URL.

- [ ] **Step 1: Write the failing test**

Create `e2e/org-security-client.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { parse } from 'graphql'
import { canUnsuspend, credentialStateText } from '../lib/orgs/credentials'
import { canApprove, canCancel, canExecute, countdown, proposalStage, proposalSummary, stageText } from '../lib/orgs/proposals'
import { partyText, personTransfers, transferDirection } from '../lib/orgs/transfers'
import { argsProblem, mutationDocument, ORG_MUTATIONS, type OrgMutationName } from '../services/org-mutations'
import { APP_DID_A, appTransfer, orgCredential, orgProposal } from './support/org-fixtures'

const OWNER = '0x0a000000000000000000000000000000000000a1'
const OTHER = '0x0b000000000000000000000000000000000000b2'
const now = new Date('2026-10-12T12:00:00.000Z')

test.describe('proposals', () => {
  test('stages: approvals, waiting, ready, expired', () => {
    const base = orgProposal({ orgId: 'o', createdAt: '2026-10-12T00:00:00.000Z', expiresAt: '2026-10-26T00:00:00.000Z', threshold: 2, approvals: [OWNER] })
    expect(proposalStage(base, now)).toEqual({ stage: 'approvals', missing: 1 })
    expect(stageText(proposalStage(base, now), now)).toBe('Needs 1 more owner approval')
    const waiting = { ...base, executableAt: '2026-10-13T16:30:00.000Z' }
    expect(proposalStage(waiting, now)).toEqual({ stage: 'waiting', until: '2026-10-13T16:30:00.000Z' })
    expect(stageText(proposalStage(waiting, now), now)).toBe('Can run in 1 day 4 hours')
    expect(proposalStage({ ...base, executableAt: '2026-10-12T11:00:00.000Z' }, now)).toEqual({ stage: 'ready' })
    expect(proposalStage({ ...base, expiresAt: '2026-10-12T11:00:00.000Z' }, now)).toEqual({ stage: 'expired' })
    expect(proposalStage({ ...base, executableAt: '2026-10-27T00:00:00.000Z' }, now)).toEqual({ stage: 'expired' })
    expect(proposalStage({ ...base, status: 'EXECUTED' }, now)).toEqual({ stage: 'closed' })
  })

  test('countdowns read like a person would say them', () => {
    expect(countdown('2026-10-12T12:00:30.000Z', now)).toBe('less than a minute')
    expect(countdown('2026-10-12T12:01:00.000Z', now)).toBe('1 minute')
    expect(countdown('2026-10-12T14:05:00.000Z', now)).toBe('2 hours 5 minutes')
    expect(countdown('2026-10-14T12:00:00.000Z', now)).toBe('2 days')
    expect(countdown('2026-10-12T11:00:00.000Z', now)).toBe('now')
  })

  test('who may approve, cancel and execute', () => {
    const p = orgProposal({ orgId: 'o', proposer: OWNER, approvals: [OWNER], threshold: 2, expiresAt: '2026-10-26T00:00:00.000Z' })
    expect(canApprove(p, OWNER, 'OWNER')).toBe(false)
    expect(canApprove(p, OTHER, 'OWNER')).toBe(true)
    expect(canApprove(p, OTHER, 'ADMIN')).toBe(false)
    expect(canCancel(p, OTHER, 'ADMIN')).toBe(false)
    expect(canCancel(p, OWNER, 'ADMIN')).toBe(true)
    expect(canExecute(p, OWNER, 'OWNER', now)).toBe(false)
    expect(canExecute({ ...p, executableAt: '2026-10-12T11:00:00.000Z' }, OTHER, 'OWNER', now)).toBe(true)
  })

  test('summaries name the change', () => {
    const blank = { address: null, demoteToAdmin: null, appDid: null, toKind: null, toId: null, handle: null, domain: null }
    const p = (kind: Parameters<typeof orgProposal>[0]['kind'], payload: Partial<typeof blank>) => orgProposal({ orgId: 'o', kind, payload: { ...blank, ...payload } })
    expect(proposalSummary(p('ADD_OWNER', { address: OTHER }))).toBe('Make 0x0b00…00b2 an owner')
    expect(proposalSummary(p('REMOVE_OWNER', { address: OTHER, demoteToAdmin: true }))).toBe('Demote 0x0b00…00b2 to admin')
    expect(proposalSummary(p('REMOVE_OWNER', { address: OTHER, demoteToAdmin: false }))).toBe('Remove 0x0b00…00b2 from the organisation')
    expect(proposalSummary(p('CHANGE_HANDLE', { handle: 'acme-two' }))).toBe('Change the handle to @acme-two')
    expect(proposalSummary(p('FREEZE_APP', { appDid: APP_DID_A }), () => 'Acme Ledger')).toBe('Freeze Acme Ledger')
    expect(proposalSummary(p('TRANSFER_APP_OUT', { appDid: APP_DID_A, toKind: 'PERSON', toId: OTHER }), () => 'Acme Ledger')).toBe('Transfer Acme Ledger to 0x0b00…00b2')
    expect(proposalSummary(p('RECOVER', { address: OTHER, domain: 'acme.example' }))).toBe('Recover the organisation for 0x0b00…00b2 through acme.example')
  })
})

test.describe('credentials and transfers', () => {
  test('a credential says whether it counts and why not', () => {
    expect(credentialStateText(orgCredential({}))).toBe('Counts')
    expect(credentialStateText(orgCredential({ revoked: true }))).toBe('Revoked by its issuer')
    const suspended = orgCredential({ status: { credentialId: 'c1', appDid: APP_DID_A, orgId: 'o', counts: false, reason: 'SUSPENDED' } })
    expect(credentialStateText(suspended)).toBe('Suspended by the organisation')
    expect(canUnsuspend(suspended)).toBe(true)
    expect(credentialStateText(orgCredential({ status: { credentialId: 'c1', appDid: APP_DID_A, orgId: 'o', counts: false, reason: 'ISSUER_NOT_MEMBER' } }))).toBe(
      'Its issuer is no longer a member',
    )
  })

  test('transfers in, out and to a person', () => {
    const incoming = appTransfer({ id: 't1', fromKind: 'PERSON', fromId: OTHER, toKind: 'ORG', toId: 'org-1' })
    const outgoing = appTransfer({ id: 't2', fromKind: 'ORG', fromId: 'org-1', toKind: 'PERSON', toId: OTHER })
    expect(transferDirection(incoming, 'org-1')).toBe('in')
    expect(transferDirection(outgoing, 'org-1')).toBe('out')
    expect(transferDirection(outgoing, 'org-2')).toBeNull()
    expect(personTransfers([incoming, outgoing, { ...outgoing, id: 't3', status: 'ACCEPTED' }], OTHER)).toEqual({ incoming: [outgoing], outgoing: [incoming] })
    expect(partyText('PERSON', OTHER)).toBe('0x0b00…00b2')
    expect(partyText('ORG', 'org-1')).toBe('an organisation')
  })
})

test.describe('B2 mutations', () => {
  test('are registered with their contract arguments and parse', () => {
    for (const name of Object.keys(ORG_MUTATIONS) as OrgMutationName[]) expect(() => parse(mutationDocument(name)), name).not.toThrow()
    expect(mutationDocument('suspendOrgCredentials')).toBe(
      'mutation SuspendOrgCredentials($orgId: String!, $credentialIds: [String!], $memberAddress: String, $auth: OrgAuthInput) { suspendOrgCredentials(orgId: $orgId, credentialIds: $credentialIds, memberAddress: $memberAddress, auth: $auth) }',
    )
    expect(argsProblem('acceptAppTransfer', { transferId: 't1' })).toBeNull()
    expect(argsProblem('resolveOrgReport', { reportId: 'r1' })).toBe('resolution')
    expect(argsProblem('createOrgWebhook', { orgId: 'o', url: 'https://hooks.example', events: ['member.joined'] })).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-security-client.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../lib/orgs/credentials'`.

- [ ] **Step 3: The reads**

Create `services/org-security.ts`:

```ts
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

export type OrgWebhookDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED'

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
export async function releaseAttestations(appDid: string, limit = 1): Promise<ReleaseAttestationPage> {
  const data = await orgsRequest<{ releaseAttestations: ReleaseAttestationPage }>(
    `query ReleaseAttestations($appDid: String!, $limit: Int) { releaseAttestations(appDid: $appDid, limit: $limit) { items { ${ATTESTATION_FIELDS} } next } }`,
    { appDid, limit },
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
```

- [ ] **Step 4: The B2 mutations**

In `services/org-mutations.ts`, extend the import:

```ts
import {
  DELIVERY_FIELDS,
  DOMAIN_FIELDS,
  OIDC_CLIENT_FIELDS,
  REPORT_FIELDS,
  TRANSFER_FIELDS,
  WEBHOOK_FIELDS,
  WORKLOAD_FIELDS,
} from './org-security'
```

and add to `ORG_MUTATIONS`, after `proposeOrgChange`:

```ts
  approveOrgProposal: { args: { orgId: 'String!', proposalId: 'String!' }, select: PROPOSAL_FIELDS },
  cancelOrgProposal: { args: { orgId: 'String!', proposalId: 'String!' }, select: PROPOSAL_FIELDS },
  executeOrgProposal: { args: { orgId: 'String!', proposalId: 'String!' }, select: PROPOSAL_FIELDS },
  addOrgDomain: { args: { orgId: 'String!', domain: 'String!' }, select: DOMAIN_FIELDS },
  checkOrgDomain: { args: { orgId: 'String!', domainId: 'String!' }, select: DOMAIN_FIELDS },
  removeOrgDomain: { args: { orgId: 'String!', domainId: 'String!' }, select: '' },
  proposeAppTransfer: { args: { appDid: 'String!', toOrgId: 'String!' }, select: TRANSFER_FIELDS },
  acceptAppTransfer: { args: { transferId: 'String!' }, select: TRANSFER_FIELDS },
  declineAppTransfer: { args: { transferId: 'String!' }, select: TRANSFER_FIELDS },
  suspendOrgCredentials: { args: { orgId: 'String!', credentialIds: '[String!]', memberAddress: 'String' }, select: '' },
  unsuspendOrgCredential: { args: { orgId: 'String!', credentialId: 'String!' }, select: '' },
  setOrgWorkloadDisabled: { args: { orgId: 'String!', did: 'String!', disabled: 'Boolean!' }, select: WORKLOAD_FIELDS },
  createOrgWebhook: { args: { orgId: 'String!', url: 'String!', events: '[String!]!' }, select: `webhook { ${WEBHOOK_FIELDS} } secret` },
  updateOrgWebhook: {
    args: { orgId: 'String!', webhookId: 'String!', url: 'String', events: '[String!]', enabled: 'Boolean' },
    select: WEBHOOK_FIELDS,
  },
  deleteOrgWebhook: { args: { orgId: 'String!', webhookId: 'String!' }, select: '' },
  testOrgWebhook: { args: { orgId: 'String!', webhookId: 'String!' }, select: DELIVERY_FIELDS },
  registerOrgOidcClient: { args: { orgId: 'String!', name: 'String!', redirectUris: '[String!]!' }, select: 'clientId clientSecret' },
  updateOrgOidcClient: {
    args: { orgId: 'String!', clientId: 'String!', name: 'String', addRedirectUris: '[String!]', removeRedirectUris: '[String!]', status: 'OrgOidcClientStatus' },
    select: OIDC_CLIENT_FIELDS,
  },
  rotateOrgOidcClientSecret: { args: { orgId: 'String!', clientId: 'String!' }, select: 'clientId clientSecret' },
  reportOrganization: { args: { orgId: 'String!', reason: 'OrgReportReason!', details: 'String' }, select: '' },
  resolveOrgReport: { args: { reportId: 'String!', resolution: 'OrgReportResolution!', note: 'String' }, select: REPORT_FIELDS },
```

(`org-security.ts` imports only `services/orgs.ts`, so there is no import cycle. B1's specs use `resolveOrgReport` as their "unregistered mutation" example; now that it is registered, change `e2e/org-write.spec.ts`'s `request.post('/api/org/resolveOrgReport', …)` to `/api/org/startOrgRecovery` and `e2e/org-client.spec.ts`'s `expect(isOrgMutationName('resolveOrgReport')).toBe(false)` to `expect(isOrgMutationName('startOrgRecovery')).toBe(false)`; `startOrgRecovery` stays unregistered.)

- [ ] **Step 5: The pure rules**

Create `lib/orgs/proposals.ts`:

```ts
// Proposals as the security section shows them (renown-package A2 ruling 1):
// what each would do, where it stands, and who may act on it. Pure.
import type { OrgProposal, OrgProposalKind, OrgProposalStatus, OrgRole } from '../../services/orgs'
import { shortAddress, shortDid } from './format'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const PROPOSAL_KIND_LABELS: Record<OrgProposalKind, string> = {
  ADD_OWNER: 'Add an owner',
  REMOVE_OWNER: 'Remove an owner',
  TRANSFER_APP_OUT: 'Transfer an app out',
  CHANGE_HANDLE: 'Change the handle',
  DELETE_ORG: 'Delete the organisation',
  RECOVER: 'Recover the organisation',
  FREEZE_APP: 'Freeze an app',
  UNFREEZE_APP: 'Unfreeze an app',
}

export const PROPOSAL_STATUS_LABELS: Record<OrgProposalStatus, string> = {
  PENDING: 'Pending',
  EXECUTED: 'Carried out',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  FAILED: 'Failed',
}

/** One line on what the proposal would do. `appName` names an app DID when the caller knows it. */
export function proposalSummary(p: OrgProposal, appName: (did: string) => string = shortDid): string {
  const q = p.payload
  const who = q.address ? shortAddress(q.address) : null
  const app = q.appDid ? appName(q.appDid) : 'an app'
  switch (p.kind) {
    case 'ADD_OWNER':
      return `Make ${who ?? 'a member'} an owner`
    case 'REMOVE_OWNER':
      return q.demoteToAdmin ? `Demote ${who ?? 'an owner'} to admin` : `Remove ${who ?? 'an owner'} from the organisation`
    case 'TRANSFER_APP_OUT':
      return `Transfer ${app} to ${q.toKind === 'ORG' ? 'another organisation' : q.toId ? shortAddress(q.toId) : 'someone else'}`
    case 'CHANGE_HANDLE':
      return `Change the handle to @${q.handle ?? '…'}`
    case 'DELETE_ORG':
      return 'Delete the organisation'
    case 'RECOVER':
      return `Recover the organisation for ${who ?? 'a new owner'} through ${q.domain ?? 'a verified domain'}`
    case 'FREEZE_APP':
      return `Freeze ${app}`
    case 'UNFREEZE_APP':
      return `Unfreeze ${app}`
  }
}

export type ProposalStage =
  | { stage: 'approvals'; missing: number }
  | { stage: 'waiting'; until: string }
  | { stage: 'ready' }
  | { stage: 'expired' }
  | { stage: 'closed' }

/** Where a proposal stands at `now`: still collecting approvals, waiting out its delay, ready to run, or past it. */
export function proposalStage(p: OrgProposal, now: Date): ProposalStage {
  if (p.status !== 'PENDING') return { stage: 'closed' }
  const t = now.getTime()
  const expires = Date.parse(p.expiresAt)
  if (p.executableAt === null) {
    return t >= expires ? { stage: 'expired' } : { stage: 'approvals', missing: Math.max(1, p.threshold - p.approvals.length) }
  }
  const at = Date.parse(p.executableAt)
  // Matured after its expiry: it can never run (A2 ruling 1).
  if (at > expires) return { stage: 'expired' }
  return at > t ? { stage: 'waiting', until: p.executableAt } : { stage: 'ready' }
}

function unit(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** "1 day 4 hours", "2 hours 5 minutes", "12 minutes", "less than a minute", "now". */
export function countdown(untilIso: string, now: Date): string {
  const ms = Date.parse(untilIso) - now.getTime()
  if (ms <= 0) return 'now'
  if (ms < MINUTE) return 'less than a minute'
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const minutes = Math.floor((ms % HOUR) / MINUTE)
  if (days > 0) return hours > 0 ? `${unit(days, 'day')} ${unit(hours, 'hour')}` : unit(days, 'day')
  if (hours > 0) return minutes > 0 ? `${unit(hours, 'hour')} ${unit(minutes, 'minute')}` : unit(hours, 'hour')
  return unit(minutes, 'minute')
}

export function stageText(stage: ProposalStage, now: Date): string {
  switch (stage.stage) {
    case 'approvals':
      return `Needs ${stage.missing} more owner approval${stage.missing === 1 ? '' : 's'}`
    case 'waiting':
      return `Can run in ${countdown(stage.until, now)}`
    case 'ready':
      return 'Ready to run'
    case 'expired':
      return 'Expired'
    case 'closed':
      return ''
  }
}

const lower = (value: string) => value.toLowerCase()

/** Owners approve proposals that still need approvals and that they have not approved. */
export function canApprove(p: OrgProposal, viewer: string, role: OrgRole): boolean {
  return role === 'OWNER' && p.status === 'PENDING' && p.kind !== 'RECOVER' && p.executableAt === null && !p.approvals.map(lower).includes(lower(viewer))
}

/** Any owner cancels; the proposer may always withdraw their own. */
export function canCancel(p: OrgProposal, viewer: string, role: OrgRole): boolean {
  return p.status === 'PENDING' && (role === 'OWNER' || lower(p.proposer) === lower(viewer))
}

export function canExecute(p: OrgProposal, viewer: string, role: OrgRole, now: Date): boolean {
  return canCancel(p, viewer, role) && proposalStage(p, now).stage === 'ready'
}
```

Create `lib/orgs/credentials.ts`:

```ts
// Delegations under organisation rules (renown-package A2 ruling 11). Pure.
import type { OrgCredential, OrgCredentialReason } from '../../services/org-security'

export const CREDENTIAL_REASON_TEXT: Record<OrgCredentialReason, string> = {
  ISSUER_NOT_MEMBER: 'Its issuer is no longer a member',
  ISSUER_NOT_PUBLISHER: 'Its issuer may no longer publish this app',
  SUSPENDED: 'Suspended by the organisation',
  APP_FROZEN: 'The app is frozen',
}

export function credentialStateText(credential: OrgCredential): string {
  if (credential.revoked) return 'Revoked by its issuer'
  if (credential.status.counts) return 'Counts'
  return credential.status.reason ? CREDENTIAL_REASON_TEXT[credential.status.reason] : 'Does not count'
}

/** Only an explicit suspension can be lifted (the other reasons follow from membership or a freeze). */
export function canUnsuspend(credential: OrgCredential): boolean {
  return credential.status.reason === 'SUSPENDED'
}
```

Create `lib/orgs/transfers.ts`:

```ts
// App transfers as each side sees them (renown-package A2 ruling 12). Pure.
import type { AppTransfer } from '../../services/org-security'
import type { OrgPartyKind } from '../../services/orgs'
import { shortAddress } from './format'

/** 'in' when the organisation receives the app, 'out' when it gives it away. */
export function transferDirection(transfer: AppTransfer, orgId: string): 'in' | 'out' | null {
  if (transfer.toKind === 'ORG' && transfer.toId === orgId) return 'in'
  if (transfer.fromKind === 'ORG' && transfer.fromId === orgId) return 'out'
  return null
}

/** A wallet's pending transfers: apps offered to it, and apps it offered to an organisation. */
export function personTransfers(list: AppTransfer[], address: string): { incoming: AppTransfer[]; outgoing: AppTransfer[] } {
  const me = address.toLowerCase()
  const pending = list.filter((t) => t.status === 'PENDING')
  return {
    incoming: pending.filter((t) => t.toKind === 'PERSON' && t.toId.toLowerCase() === me),
    outgoing: pending.filter((t) => t.fromKind === 'PERSON' && t.fromId.toLowerCase() === me),
  }
}

export function partyText(kind: OrgPartyKind, id: string): string {
  return kind === 'PERSON' ? shortAddress(id.toLowerCase()) : 'an organisation'
}
```

- [ ] **Step 6: Stub defaults and test support**

In `e2e/support/stub-switchboard.mjs`, add to `DEFAULT_DATA` after `organizationDidDocument: null,`:

```js
  orgProposals: [],
  orgDomains: [],
  orgCredentials: [],
  orgCredentialStatus: null,
  orgWorkloads: [],
  appTransfers: [],
  releaseAttestations: { items: [], next: null },
  releaseAttestation: null,
  orgWebhooks: [],
  orgWebhookDeliveries: [],
  orgOidcClients: [],
  orgAuditLog: { items: [], next: null },
  orgAuditExport: '[]',
  orgReports: [],
```

In `e2e/support/org-fixtures.ts`, add to the type imports from `../../services/org-security` (`AppTransfer`, `OrgAuditEntry`, `OrgCredential`, `OrgDomain`, `OrgOidcClient`, `OrgReport`, `OrgWebhook`, `OrgWebhookDelivery`, `OrgWorkload`, `ReleaseAttestation`) and `import type { RenownAppProfile } from '../../services/app-profiles'`, then append:

```ts
export function orgDomain(over: Partial<OrgDomain> = {}): OrgDomain {
  const orgId = over.orgId ?? 'org-fixture'
  const domain = over.domain ?? 'acme.example'
  return {
    id: 'domain-1',
    orgId,
    domain,
    status: 'PENDING',
    verifiedAt: null,
    lastCheckedAt: null,
    failures: 0,
    createdAt: AT,
    txtName: `_renown.${domain}`,
    txtValue: `renown-org=${orgId};token=tok123`,
    wellKnownUrl: `https://${domain}/.well-known/renown.json`,
    wellKnownJson: JSON.stringify({ organizations: [{ id: orgId, token: 'tok123' }] }),
    ...over,
  }
}

export function appTransfer(over: Partial<AppTransfer> = {}): AppTransfer {
  return {
    id: 'transfer-1',
    appDid: APP_DID_A,
    fromKind: 'PERSON',
    fromId: '0x0b000000000000000000000000000000000000b2',
    toKind: 'ORG',
    toId: 'org-fixture',
    status: 'PENDING',
    createdAt: AT,
    expiresAt: '2026-10-15T10:00:00.000Z',
    decidedAt: null,
    decidedBy: null,
    proposalId: null,
    ...over,
  }
}

export function orgCredential(over: Partial<OrgCredential> = {}): OrgCredential {
  const credentialId = over.credentialId ?? 'urn:uuid:00000000-0000-4000-8000-0000000000c1'
  return {
    credentialId,
    documentId: 'doc-cred-1',
    appDid: APP_DID_A,
    issuer: '0x0b000000000000000000000000000000000000b2',
    issuerRole: 'PUBLISHER',
    issuerStatus: 'ACTIVE',
    issuanceDate: AT,
    expirationDate: '2027-10-01T10:00:00.000Z',
    revoked: false,
    status: { credentialId, appDid: APP_DID_A, orgId: 'org-fixture', counts: true, reason: null },
    ...over,
  }
}

export function orgWorkload(over: Partial<OrgWorkload> = {}): OrgWorkload {
  return {
    did: 'did:key:z6MkWorkloadFixturexxxxxxxxxxxxxxxxxxxxxxxxxxxx1',
    repository: 'acme/ledger',
    productionBranch: 'main',
    ownerAddress: '0x0b000000000000000000000000000000000000b2',
    disabled: false,
    createdAt: AT,
    ...over,
  }
}

export function orgWebhook(over: Partial<OrgWebhook> = {}): OrgWebhook {
  return { id: 'hook-1', orgId: 'org-fixture', url: 'https://hooks.acme.example/renown', events: ['member.joined'], enabled: true, consecutiveFailures: 0, createdAt: AT, ...over }
}

export function orgDelivery(over: Partial<OrgWebhookDelivery> = {}): OrgWebhookDelivery {
  return {
    id: 'delivery-1',
    webhookId: 'hook-1',
    eventId: 'event-1',
    eventType: 'member.joined',
    status: 'DELIVERED',
    attempts: 1,
    responseStatus: 200,
    lastError: null,
    createdAt: AT,
    nextAttemptAt: null,
    deliveredAt: AT,
    ...over,
  }
}

export function orgOidcClient(over: Partial<OrgOidcClient> = {}): OrgOidcClient {
  return { clientId: 'client-1', orgId: 'org-fixture', name: 'Acme intranet', redirectUris: ['https://intranet.acme.example/callback'], status: 'ACTIVE', createdAt: AT, ...over }
}

export function auditEntry(over: Partial<OrgAuditEntry> = {}): OrgAuditEntry {
  return { id: 'audit-1', orgId: 'org-fixture', at: AT, actor: '0x0a000000000000000000000000000000000000a1', action: 'inviteOrgMember', details: JSON.stringify({ address: '0x0b000000000000000000000000000000000000b2', role: 'MEMBER' }), ...over }
}

export function orgReport(over: Partial<OrgReport> = {}): OrgReport {
  return {
    id: 'report-1',
    orgId: 'org-fixture',
    org: orgSummary(),
    reporter: '0x0c000000000000000000000000000000000000c3',
    reason: 'IMPERSONATION',
    details: 'Pretends to be the real Acme.',
    status: 'OPEN',
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    note: null,
    createdAt: AT,
    ...over,
  }
}

export function releaseAttestation(over: Partial<ReleaseAttestation> = {}): ReleaseAttestation {
  return {
    id: 'att-1',
    appDid: APP_DID_A,
    version: '1.4.0',
    artifactDigest: `sha256:${'a'.repeat(64)}`,
    orgId: 'org-fixture',
    signer: '0x0b000000000000000000000000000000000000b2',
    signerRole: 'PUBLISHER',
    signerStillMember: true,
    issuedAt: AT,
    signature: '0x1234',
    createdAt: AT,
    ...over,
  }
}

export function appProfile(over: Partial<RenownAppProfile> & { appDid: string }): RenownAppProfile {
  return {
    documentId: `doc-${over.appDid.slice(-6)}`,
    name: 'Fixture app',
    tagline: null,
    logo: null,
    website: null,
    publisherDid: null,
    description: null,
    category: null,
    logoRef: null,
    coverRef: null,
    links: [],
    ...over,
  }
}

/** Like serveOrgReads, for renown-stats (<switchboard>/graphql/renown-stats). */
export async function serveStatsReads(page: Page, answers: Record<string, Answer>): Promise<void> {
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-stats**`, async (route: Route) => {
    const body = route.request().postDataJSON() as { query: string; variables?: Record<string, unknown> }
    const name = /^\s*(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1]
    const answer = name ? answers[name] : undefined
    if (!answer) return route.fallback()
    return route.fulfill({ json: { data: answer(body.variables ?? {}) } })
  })
}
```

(`route.fallback()`, not `continue()`: a later handler that does not answer a read hands it to an earlier one — e.g. `openManagePage`'s reads on top of a spec's own — and only then to the stub.)

In `e2e/support/org-manage.ts`, add `search?: string` to `openManagePage`'s options and change its `page.goto` to:

```ts
  await page.goto(`/org/acme-manage/manage/${options.section}${options.search ? `?${options.search}` : ''}`)
```

- [ ] **Step 7: Run the spec**

Run: `pnpm exec playwright test e2e/org-security-client.spec.ts e2e/org-client.spec.ts e2e/org-write.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 8: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed".

```bash
git add services/org-security.ts services/org-mutations.ts lib/orgs/proposals.ts lib/orgs/credentials.ts lib/orgs/transfers.ts e2e/support e2e/org-security-client.spec.ts e2e/org-write.spec.ts e2e/org-client.spec.ts
git commit -m "feat(orgs): security, transfer and integration client"
```

---

### Task 2: Manage apps — organisation apps, freeze and transfer proposals, transfers in and out, bring an app; transfers on `/me`

**Files:**
- Create: `components/org-manage/apps-section.tsx`, `components/me/app-transfers.tsx`
- Modify: `lib/orgs/manage-sections.ts`, `components/org-manage/section-components.tsx`, `components/me/me-dashboard.tsx`
- Test: `e2e/org-manage-apps.spec.ts`

**Interfaces:**
- Consumes: `ManageContext`, `ManageSectionProps`, `Panel`, `RemoteView`, `ConfirmButton` (B1 Task 6); `useRemote`, `orgWriter`, `sessionSigner` (B1 Task 2); `useNow` (B1 Task 6); `listAppProfiles({ orgId })`, `getAppProfilesByPublisher`, `RenownAppProfile` (`services/app-profiles.ts`); `fetchOrganization` (B1); `appTransfers`, `AppTransfer` (Task 1); `transferDirection`, `personTransfers`, `partyText` (Task 1); `shortDid`, `shortAddress`, `orgPath` (B1); `expiryText` (B1 `lib/orgs/members.ts`); `openManagePage`, `signedWrite` (B1 Task 5, `search` from Task 1); `serveStatsReads`, `serveOrgReads`, `appTransfer`, `appProfile` (Task 1).
- Produces: section `apps` (MEMBER) with panels "Apps" (list "Organisation apps"), "Transfers" (lists "Incoming transfers", "Outgoing transfers"), "Bring an app you publish"; `AppTransfers({ session, onToast })` on `/me` (section `#app-transfers`, h2 "App transfers").

- [ ] **Step 1: Write the failing test**

Create `e2e/org-manage-apps.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { APP_DID_A, APP_DID_B, appProfile, appTransfer, orgSummary, serveOrgReads, serveStatsReads } from './support/org-fixtures'
import { DAVE, openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'

const APP_DID_C = 'did:key:z6MkAcmeFixtureAppCxxxxxxxxxxxxxxxxxxxxxxxxxxx3'
const APPS = [
  { appDid: APP_DID_A, addedAt: '2026-10-02T10:00:00.000Z', frozen: false },
  { appDid: APP_DID_B, addedAt: '2026-10-03T10:00:00.000Z', frozen: true },
]

async function answer(name: string, variables: string, value: unknown) {
  await fixtureStub({ match: `mutation ${name}`, variables, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
}

async function serveApps(page: import('@playwright/test').Page, transfers: (orgId: string) => unknown[]) {
  await serveStatsReads(page, {
    AppProfilesByOrg: () => ({ appProfiles: { items: [appProfile({ appDid: APP_DID_A, name: 'Acme Ledger' }), appProfile({ appDid: APP_DID_B, name: 'Acme Vault' })], next: null } }),
    // The wallet's own person-owned app (the query's publisherDid is the wallet address).
    AppProfilesByPublisher: (v) => ({ appProfilesByPublisher: [appProfile({ appDid: APP_DID_C, name: 'My Side Project', publisherDid: `did:pkh:eip155:1:${String(v.publisherDid)}` })] }),
  })
  await serveOrgReads(page, { AppTransfers: (v) => ({ appTransfers: transfers(String(v.orgId ?? '')) }) })
}

test.describe('manage: apps', () => {
  test('an owner proposes freezing, unfreezing and transferring an app out', async ({ page }) => {
    await serveApps(page, () => [])
    const setup = await openManagePage(page, { role: 'OWNER', section: 'apps', org: { apps: APPS } })
    await answer('ProposeOrgChange', setup.orgId, { id: 'p1' })
    const apps = page.getByRole('list', { name: 'Organisation apps' })
    await expect(apps.getByRole('listitem').filter({ hasText: 'Acme Vault' }).getByText('Frozen', { exact: true })).toBeVisible()

    await apps.getByRole('button', { name: 'Propose freezing Acme Ledger' }).click()
    expect(await signedWrite(setup.wallet, 'proposeOrgChange', setup.orgId, (v) => (v.kind as string) === 'FREEZE_APP')).toEqual({
      orgId: setup.orgId,
      kind: 'FREEZE_APP',
      payload: { appDid: APP_DID_A },
    })
    await expect(apps.getByRole('button', { name: 'Propose unfreezing Acme Vault' })).toBeVisible()

    await apps.getByRole('button', { name: 'Transfer Acme Ledger out' }).click()
    await page.getByLabel('A person (wallet address)').check()
    await page.getByLabel('Recipient').fill(DAVE.toUpperCase().replace('0X', '0x'))
    await page.getByRole('button', { name: 'Propose transfer' }).click()
    expect(await signedWrite(setup.wallet, 'proposeOrgChange', setup.orgId, (v) => (v.kind as string) === 'TRANSFER_APP_OUT')).toEqual({
      orgId: setup.orgId,
      kind: 'TRANSFER_APP_OUT',
      payload: { appDid: APP_DID_A, toKind: 'PERSON', toId: DAVE },
    })
  })

  test('an admin accepts an incoming transfer and cancels an outgoing one', async ({ page }) => {
    await serveApps(page, (orgId) => [
      appTransfer({ id: 'tr-in', appDid: APP_DID_C, fromKind: 'PERSON', fromId: DAVE, toKind: 'ORG', toId: orgId }),
      appTransfer({ id: 'tr-out', appDid: APP_DID_A, fromKind: 'ORG', fromId: orgId, toKind: 'PERSON', toId: DAVE }),
    ])
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'apps', org: { apps: APPS } })
    await answer('AcceptAppTransfer', 'tr-in', appTransfer({ id: 'tr-in', status: 'ACCEPTED' }))
    await answer('DeclineAppTransfer', 'tr-out', appTransfer({ id: 'tr-out', status: 'CANCELLED' }))
    await expect(page.getByRole('button', { name: /Propose freezing/ })).toHaveCount(0)
    const incoming = page.getByRole('list', { name: 'Incoming transfers' })
    await expect(incoming).toContainText('from 0x0d00…00d4')
    await incoming.getByRole('button', { name: /^Accept/ }).click()
    expect(await signedWrite(setup.wallet, 'acceptAppTransfer', null, (v) => v.transferId === 'tr-in')).toEqual({ transferId: 'tr-in' })
    await page.getByRole('list', { name: 'Outgoing transfers' }).getByRole('button', { name: /^Cancel the transfer/ }).click()
    expect(await signedWrite(setup.wallet, 'declineAppTransfer', null, (v) => v.transferId === 'tr-out')).toEqual({ transferId: 'tr-out' })
  })

  test('a member brings an app they publish, preselected from the link', async ({ page }) => {
    await serveApps(page, () => [])
    const setup = await openManagePage(page, { role: 'MEMBER', section: 'apps', org: { apps: APPS }, search: `bring=${encodeURIComponent(APP_DID_C)}` })
    await answer('ProposeAppTransfer', APP_DID_C, appTransfer({ id: 'tr-new', appDid: APP_DID_C }))
    await expect(page.getByLabel('App to bring')).toHaveValue(APP_DID_C)
    await page.getByRole('button', { name: 'Request transfer to Acme Manage' }).click()
    expect(await signedWrite(setup.wallet, 'proposeAppTransfer', null, (v) => v.appDid === APP_DID_C)).toEqual({ appDid: APP_DID_C, toOrgId: setup.orgId })
  })
})

test.describe('/me app transfers', () => {
  test('a person accepts an app an organisation transfers to them', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-me-transfers' })
    const from = orgSummary({ id: crypto.randomUUID(), handle: 'acme-giver', name: 'Acme Giver' })
    const transferId = `tr-${crypto.randomUUID()}`
    await serveOrgReads(page, {
      AppTransfers: () => ({ appTransfers: [appTransfer({ id: transferId, fromKind: 'ORG', fromId: from.id, toKind: 'PERSON', toId: wallet.address.toLowerCase() })] }),
    })
    await answer('AcceptAppTransfer', transferId, appTransfer({ id: transferId, status: 'ACCEPTED' }))
    await page.goto('/me')
    const section = page.getByRole('region', { name: 'App transfers' })
    await expect(section).toContainText('offered to you by an organisation', { timeout: 30_000 })
    await section.getByRole('button', { name: /^Accept/ }).click()
    expect(await signedWrite(wallet, 'acceptAppTransfer', null, (v) => v.transferId === transferId)).toEqual({ transferId })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-manage-apps.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL (the `apps` section is a 404).

- [ ] **Step 3: The apps section**

Create `components/org-manage/apps-section.tsx`:

```tsx
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useState, type FormEvent } from 'react'
import { useNow } from '../../hooks/use-now'
import { useRemote } from '../../hooks/use-remote'
import { shortDid } from '../../lib/orgs/format'
import { normalizeOrgHandle } from '../../lib/orgs/handles'
import { expiryText } from '../../lib/orgs/members'
import { partyText, transferDirection } from '../../lib/orgs/transfers'
import { getAppProfilesByPublisher, listAppProfiles } from '../../services/app-profiles'
import { appTransfers, type AppTransfer } from '../../services/org-security'
import { roleAtLeast } from '../../services/org-signed-messages'
import { fetchOrganization, type OrgApp } from '../../services/orgs'
import { Field, inputClass } from '../profile-edit/field'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext, ManageSectionProps } from './manage-context'
import { Panel, RemoteView } from './manage-ui'

type AppName = (did: string) => string

function TransferOutForm({ ctx, app, name, onDone }: { ctx: ManageContext; app: OrgApp; name: string; onDone: () => void }) {
  const [kind, setKind] = useState<'PERSON' | 'ORG'>('PERSON')
  const [to, setTo] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function propose(event: FormEvent) {
    event.preventDefault()
    setProblem(null)
    let toId: string
    if (kind === 'PERSON') {
      if (!/^0x[0-9a-fA-F]{40}$/.test(to.trim())) {
        setProblem('Enter a 0x wallet address.')
        return
      }
      toId = to.trim().toLowerCase()
    } else {
      const target = await fetchOrganization({ handle: normalizeOrgHandle(to) }).catch(() => null)
      if (!target) {
        setProblem('No organisation has this handle.')
        return
      }
      toId = target.id
    }
    setBusy(true)
    const done = await ctx.run(
      'proposeOrgChange',
      { orgId: ctx.org.id, kind: 'TRANSFER_APP_OUT', payload: { appDid: app.appDid, toKind: kind, toId } },
      `Transfer of ${name} proposed. Follow it under Security.`,
    )
    setBusy(false)
    if (done) onDone()
  }

  return (
    <form onSubmit={(event) => void propose(event)} noValidate className="border-hairline rounded-card mt-3 space-y-3 border p-4">
      <fieldset>
        <legend className="text-ink text-sm font-semibold">Transfer {name} to</legend>
        <label className="text-ink mt-2 flex items-center gap-2 text-sm">
          <input type="radio" name={`to-${app.appDid}`} checked={kind === 'PERSON'} onChange={() => setKind('PERSON')} />
          A person (wallet address)
        </label>
        <label className="text-ink mt-1 flex items-center gap-2 text-sm">
          <input type="radio" name={`to-${app.appDid}`} checked={kind === 'ORG'} onChange={() => setKind('ORG')} />
          Another organisation (handle)
        </label>
      </fieldset>
      <Field id={`to-${app.appDid}`} label="Recipient" error={problem ?? undefined}>
        <input id={`to-${app.appDid}`} className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} placeholder={kind === 'PERSON' ? '0x…' : 'handle'} autoCapitalize="none" spellCheck={false} />
      </Field>
      <p className="text-ink-muted text-xs">It needs a second owner’s approval when there is one and waits 48 hours; then the recipient accepts it.</p>
      <button type="submit" disabled={busy} className={buttonClasses('primary', 'md')}>
        {busy ? 'Proposing…' : 'Propose transfer'}
      </button>
    </form>
  )
}

function OrgAppsPanel({ ctx, appName }: { ctx: ManageContext; appName: AppName }) {
  const owner = ctx.role === 'OWNER'
  const [busy, setBusy] = useState<string | null>(null)
  const [transferring, setTransferring] = useState<string | null>(null)

  async function freeze(app: OrgApp) {
    setBusy(app.appDid)
    const kind = app.frozen ? 'UNFREEZE_APP' : 'FREEZE_APP'
    await ctx.run('proposeOrgChange', { orgId: ctx.org.id, kind, payload: { appDid: app.appDid } }, `${app.frozen ? 'Unfreezing' : 'Freezing'} ${appName(app.appDid)} proposed. Follow it under Security.`)
    setBusy(null)
  }

  return (
    <Panel id="org-apps-title" title="Apps" description="Apps the organisation publishes. A frozen app’s delegations stop counting and it gets no tokens until it is unfrozen.">
      {ctx.org.apps.length === 0 ? (
        <p className="text-ink-muted text-sm">The organisation has no apps yet. Bring one in below, or create one in the organisation on Vetra.</p>
      ) : (
        <ul aria-label="Organisation apps" className="divide-hairline divide-y">
          {ctx.org.apps.map((app) => {
            const name = appName(app.appDid)
            return (
              <li key={app.appDid} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/app/${app.appDid}`} className="text-ink font-semibold break-words hover:underline">
                      {name}
                    </Link>
                    <p className="text-ink-muted font-mono text-xs break-all">{app.appDid}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {app.frozen && <Badge>Frozen</Badge>}
                    {owner && (
                      <button type="button" disabled={busy === app.appDid} onClick={() => void freeze(app)} className={buttonClasses('ghost', 'md')}>
                        {app.frozen ? `Propose unfreezing ${name}` : `Propose freezing ${name}`}
                      </button>
                    )}
                    {owner && !app.frozen && (
                      <button
                        type="button"
                        aria-expanded={transferring === app.appDid}
                        onClick={() => setTransferring(transferring === app.appDid ? null : app.appDid)}
                        className={buttonClasses('ghost', 'md')}
                      >
                        Transfer {name} out
                      </button>
                    )}
                  </div>
                </div>
                {transferring === app.appDid && <TransferOutForm ctx={ctx} app={app} name={name} onDone={() => setTransferring(null)} />}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function TransfersPanel({ ctx, appName, transfers, onChange }: { ctx: ManageContext; appName: AppName; transfers: ReturnType<typeof useRemote<AppTransfer[]>>; onChange: () => void }) {
  const admin = roleAtLeast(ctx.role, 'ADMIN')
  const now = useNow()
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(transfer: AppTransfer, accept: boolean, success: string) {
    setBusy(transfer.id)
    const done = await ctx.run(accept ? 'acceptAppTransfer' : 'declineAppTransfer', { transferId: transfer.id }, success)
    setBusy(null)
    if (done) onChange()
  }

  return (
    <Panel id="transfers-title" title="Transfers" description="Apps on their way into or out of the organisation. A transfer expires after 14 days.">
      <RemoteView remote={transfers.state} what="transfers" onRetry={transfers.reload}>
        {(list) => {
          const pending = list.filter((t) => t.status === 'PENDING')
          const incoming = pending.filter((t) => transferDirection(t, ctx.org.id) === 'in')
          const outgoing = pending.filter((t) => transferDirection(t, ctx.org.id) === 'out')
          if (incoming.length === 0 && outgoing.length === 0) return <p className="text-ink-muted text-sm">No transfers are waiting.</p>
          return (
            <div className="space-y-6">
              {incoming.length > 0 && (
                <ul aria-label="Incoming transfers" className="divide-hairline divide-y">
                  {incoming.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <p className="text-ink min-w-0 text-sm break-words">
                        {appName(t.appDid)} from {partyText(t.fromKind, t.fromId)}
                        <span className="text-ink-muted">, {expiryText(t.expiresAt, now).toLowerCase()}</span>
                      </p>
                      {admin && (
                        <div className="flex gap-2">
                          <button type="button" disabled={busy === t.id} onClick={() => void decide(t, true, `${appName(t.appDid)} now belongs to ${ctx.org.name}.`)} className={buttonClasses('primary', 'md')}>
                            Accept {appName(t.appDid)}
                          </button>
                          <button type="button" disabled={busy === t.id} onClick={() => void decide(t, false, 'Transfer declined.')} className={buttonClasses('ghost', 'md')}>
                            Decline
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {outgoing.length > 0 && (
                <ul aria-label="Outgoing transfers" className="divide-hairline divide-y">
                  {outgoing.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <p className="text-ink min-w-0 text-sm break-words">
                        {appName(t.appDid)} to {partyText(t.toKind, t.toId)}, waiting for them to accept
                      </p>
                      {admin && (
                        <button type="button" disabled={busy === t.id} onClick={() => void decide(t, false, 'Transfer cancelled.')} className={buttonClasses('ghost', 'md')}>
                          Cancel the transfer of {appName(t.appDid)}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        }}
      </RemoteView>
    </Panel>
  )
}

function BringAppPanel({ ctx, onDone }: { ctx: ManageContext; onDone: () => void }) {
  const router = useRouter()
  const { address } = ctx
  const load = useCallback(async () => {
    const mine = await getAppProfilesByPublisher(address)
    // Person-owned apps only (an org-owned app's publisherDid is the org's did:web).
    return mine.filter((app) => (app.publisherDid ?? '').toLowerCase().endsWith(`:${address}`))
  }, [address])
  const apps = useRemote(`bring:${address}`, load)
  const preselect = typeof router.query.bring === 'string' ? router.query.bring : ''
  const [chosen, setChosen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Panel id="bring-title" title="Bring an app you publish" description={`The organisation then owns the app: its profile, stats and history stay as they are. An admin of ${ctx.org.name} accepts the transfer.`}>
      <RemoteView remote={apps.state} what="apps you publish" onRetry={apps.reload}>
        {(list) => {
          const candidates = list.filter((app) => !ctx.org.apps.some((own) => own.appDid === app.appDid))
          if (candidates.length === 0) return <p className="text-ink-muted text-sm">You do not personally publish any app that could move here.</p>
          const value = chosen ?? (candidates.some((app) => app.appDid === preselect) ? preselect : candidates[0].appDid)
          return (
            <form
              noValidate
              onSubmit={async (event) => {
                event.preventDefault()
                setBusy(true)
                const done = await ctx.run('proposeAppTransfer', { appDid: value, toOrgId: ctx.org.id }, `Transfer requested. An admin of ${ctx.org.name} accepts it.`)
                setBusy(false)
                if (done) onDone()
              }}
              className="flex flex-col gap-3 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1">
                <Field id="bring-app" label="App to bring">
                  <select id="bring-app" className={inputClass} value={value} onChange={(e) => setChosen(e.target.value)}>
                    {candidates.map((app) => (
                      <option key={app.appDid} value={app.appDid}>
                        {app.name?.trim() || shortDid(app.appDid)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <button type="submit" disabled={busy} className={buttonClasses('primary', 'md', 'sm:mt-[1.625rem]')}>
                {busy ? 'Requesting…' : `Request transfer to ${ctx.org.name}`}
              </button>
            </form>
          )
        }}
      </RemoteView>
    </Panel>
  )
}

export function AppsSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const loadProfiles = useCallback(
    () => (org.apps.length > 0 ? listAppProfiles({ limit: 50, orgId: org.id }).then((page) => page.items) : Promise.resolve([])),
    [org.id, org.apps.length],
  )
  const profiles = useRemote(`org-app-profiles:${org.id}`, loadProfiles)
  const loadTransfers = useCallback(async () => appTransfers({ orgId: org.id }, await getBearer()), [org.id, getBearer])
  const transfers = useRemote(`org-transfers:${org.id}`, loadTransfers)
  const names = new Map(profiles.state.status === 'ready' ? profiles.state.value.map((p) => [p.appDid, p.name?.trim() ?? ''] as const) : [])
  const appName: AppName = (did) => names.get(did) || shortDid(did)

  return (
    <div className="mt-6 space-y-8">
      <OrgAppsPanel ctx={ctx} appName={appName} />
      <TransfersPanel
        ctx={ctx}
        appName={appName}
        transfers={transfers}
        onChange={() => {
          transfers.reload()
          ctx.reloadOrg()
        }}
      />
      <BringAppPanel ctx={ctx} onDone={transfers.reload} />
    </div>
  )
}
```

(`getAppProfilesByPublisher` already reads as `[]` on failure. The `transfers` prop type uses `ReturnType<typeof useRemote<AppTransfer[]>>` — TypeScript 5.9's instantiation expressions; if the build rejects it, type it as `{ state: Remote<AppTransfer[]>; reload: () => void }` with `import type { Remote } from '../../hooks/use-remote'`.)

- [ ] **Step 4: Transfers on `/me`**

Create `components/me/app-transfers.tsx`:

```tsx
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useNow } from '../../hooks/use-now'
import { useRemote } from '../../hooks/use-remote'
import { shortDid } from '../../lib/orgs/format'
import { expiryText } from '../../lib/orgs/members'
import { partyText, personTransfers } from '../../lib/orgs/transfers'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import { appTransfers, type AppTransfer } from '../../services/org-security'
import { RemoteView } from '../org-manage/manage-ui'
import { buttonClasses } from '../site/primitives'
import type { MeSession } from './use-me-session'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

/** Apps offered to this wallet, and apps it offered to an organisation (spec 3.7). */
export function AppTransfers({ session, onToast }: { session: SignedIn; onToast: (tone: 'success' | 'error', text: string) => void }) {
  const { address, getBearer } = session
  const load = useCallback(async () => appTransfers({ address: address.toLowerCase() }, await getBearer()), [address, getBearer])
  const transfers = useRemote(`me-transfers:${address.toLowerCase()}`, load)
  const now = useNow()
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(transfer: AppTransfer, accept: boolean, success: string) {
    setBusy(transfer.id)
    const result = await orgWriter(sessionSigner(session)).write(accept ? 'acceptAppTransfer' : 'declineAppTransfer', { transferId: transfer.id })
    setBusy(null)
    if (result.ok) {
      onToast('success', success)
      transfers.reload()
    } else {
      onToast('error', result.message)
    }
  }

  return (
    <section id="app-transfers" aria-labelledby="app-transfers-title" className="scroll-mt-24">
      <h2 id="app-transfers-title" className="text-ink text-h3">
        App transfers
      </h2>
      <div className="mt-4">
        <RemoteView remote={transfers.state} what="app transfers" onRetry={transfers.reload}>
          {(list) => {
            const { incoming, outgoing } = personTransfers(list, address)
            if (incoming.length === 0 && outgoing.length === 0) return <p className="text-ink-muted text-sm">No app transfers are waiting.</p>
            return (
              <ul className="border-hairline bg-surface-1 rounded-card divide-hairline divide-y border">
                {incoming.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <p className="text-ink min-w-0 text-sm break-words">
                      <Link href={`/app/${t.appDid}`} className="font-mono underline-offset-4 hover:underline">
                        {shortDid(t.appDid)}
                      </Link>{' '}
                      offered to you by {partyText(t.fromKind, t.fromId)}
                      <span className="text-ink-muted">, {expiryText(t.expiresAt, now).toLowerCase()}</span>
                    </p>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy === t.id} onClick={() => void decide(t, true, 'The app is yours now.')} className={buttonClasses('primary', 'md')}>
                        Accept {shortDid(t.appDid)}
                      </button>
                      <button type="button" disabled={busy === t.id} onClick={() => void decide(t, false, 'Transfer declined.')} className={buttonClasses('ghost', 'md')}>
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
                {outgoing.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <p className="text-ink min-w-0 text-sm break-words">
                      <span className="font-mono">{shortDid(t.appDid)}</span> offered to {partyText(t.toKind, t.toId)}, waiting for its admins
                    </p>
                    <button type="button" disabled={busy === t.id} onClick={() => void decide(t, false, 'Transfer cancelled.')} className={buttonClasses('ghost', 'md')}>
                      Cancel the transfer
                    </button>
                  </li>
                ))}
              </ul>
            )
          }}
        </RemoteView>
      </div>
    </section>
  )
}
```

In `components/me/me-dashboard.tsx`, add `import { AppTransfers } from './app-transfers'` and render `<AppTransfers session={session} onToast={show} />` right after `<OrgMemberships session={session} onToast={show} />`.

- [ ] **Step 5: Register the section**

In `lib/orgs/manage-sections.ts`, replace `MANAGE_SECTIONS` with:

```ts
export const MANAGE_SECTIONS: ManageSectionMeta[] = [
  { key: 'members', label: 'Members', minRole: 'MEMBER' },
  { key: 'teams', label: 'Teams', minRole: 'MEMBER' },
  { key: 'apps', label: 'Apps', minRole: 'MEMBER' },
  { key: 'settings', label: 'Settings', minRole: 'ADMIN' },
]
```

In `components/org-manage/section-components.tsx`, import `AppsSection` from `./apps-section` and add `apps: AppsSection,`.

- [ ] **Step 6: Run the specs**

Run: `pnpm exec playwright test e2e/org-manage-apps.spec.ts e2e/org-account.spec.ts e2e/me.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 7: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed".

```bash
git add components/org-manage components/me lib/orgs/manage-sections.ts e2e/org-manage-apps.spec.ts
git commit -m "feat(orgs): manage apps and app transfers"
```

### Task 3: Manage security — single-owner warning, owners, proposals with countdowns, delegations, service accounts, recovery explainer

**Files:**
- Create: `components/org-manage/proposals-panel.tsx`, `components/org-manage/delegations-panel.tsx`, `components/org-manage/security-section.tsx`
- Modify: `lib/orgs/manage-sections.ts`, `components/org-manage/section-components.tsx`
- Test: `e2e/org-manage-security.spec.ts`

**Interfaces:**
- Consumes: `ManageContext`, `ManageSectionProps`, `Panel`, `RemoteView`, `ConfirmButton` (B1); `useRemote` (B1); `useNow` (B1); `organizationMembers`, `OrgMember`, `OrgProposal` (B1); `orgProposals`, `orgCredentials`, `orgWorkloads`, `OrgCredential`, `OrgWorkload` (Task 1); `proposalSummary`, `proposalStage`, `stageText`, `canApprove`, `canCancel`, `canExecute`, `PROPOSAL_STATUS_LABELS` (Task 1); `credentialStateText`, `canUnsuspend` (Task 1); `memberLabel`, `shortAddress`, `shortDid`, `manageHref`, `roleLabel` (B1); `openManagePage`, `signedWrite`, `BOB`, `OWNER` (B1); `orgProposal`, `orgCredential`, `orgWorkload` (fixtures).
- Produces: section `security` (ADMIN) with: a "Only one owner" note when `securityWarnings` has `SINGLE_OWNER`; panel "Owners" (list "Owners", owner-only "Propose a new owner" and "Propose removing <name>"); panel "Proposals" (list "Proposals"; buttons "Approve: <summary>", "Cancel: <summary>", "Run now: <summary>"); panel "Delegations" (list "Delegations"); panel "Service accounts" (list "Service accounts"); panel "Recovery".

- [ ] **Step 1: Write the failing test**

Create `e2e/org-manage-security.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { APP_DID_A, orgCredential, orgProposal, orgWorkload } from './support/org-fixtures'
import { BOB, OWNER, openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub } from './support/stub-switchboard-client'

const blank = { address: null, demoteToAdmin: null, appDid: null, toKind: null, toId: null, handle: null, domain: null }
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()
const DAY = 86_400_000

async function answer(orgId: string, name: string, value: unknown) {
  await fixtureStub({ match: `mutation ${name}`, variables: orgId, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
}

function proposals(orgId: string) {
  return [
    orgProposal({ orgId, id: 'p-approve', kind: 'ADD_OWNER', payload: { ...blank, address: BOB }, proposer: OWNER, approvals: [OWNER], threshold: 2, createdAt: iso(-DAY), expiresAt: iso(13 * DAY) }),
    orgProposal({ orgId, id: 'p-wait', kind: 'CHANGE_HANDLE', payload: { ...blank, handle: 'acme-two' }, proposer: OWNER, approvals: [OWNER], threshold: 1, executableAt: iso(DAY + 4 * 3_600_000 + 60_000), expiresAt: iso(13 * DAY) }),
    orgProposal({ orgId, id: 'p-ready', kind: 'FREEZE_APP', payload: { ...blank, appDid: APP_DID_A }, proposer: OWNER, approvals: [OWNER], threshold: 1, executableAt: iso(-60_000), expiresAt: iso(13 * DAY) }),
    orgProposal({ orgId, id: 'p-done', kind: 'DELETE_ORG', status: 'CANCELLED', reason: 'Not now' }),
  ]
}

test.describe('manage: security', () => {
  test('an owner sees the single-owner warning, proposes an owner and approves, waits for and runs proposals', async ({ page }) => {
    const setup = await openManagePage(page, {
      role: 'OWNER',
      section: 'security',
      org: { securityWarnings: ['SINGLE_OWNER'], ownerCount: 1 },
      answers: { OrgProposals: (v) => ({ orgProposals: proposals(String(v.orgId)) }) },
    })
    for (const name of ['ProposeOrgChange', 'ApproveOrgProposal', 'ExecuteOrgProposal', 'CancelOrgProposal']) await answer(setup.orgId, name, { id: 'p' })
    await expect(page.getByRole('note')).toContainText('Only one owner')

    await page.getByLabel('New owner').selectOption(BOB)
    await page.getByRole('button', { name: 'Propose a new owner' }).click()
    expect(await signedWrite(setup.wallet, 'proposeOrgChange', setup.orgId)).toEqual({ orgId: setup.orgId, kind: 'ADD_OWNER', payload: { address: BOB } })

    const list = page.getByRole('list', { name: 'Proposals' })
    const approve = list.getByRole('listitem').filter({ hasText: 'Make 0x0b00…00b2 an owner' })
    await expect(approve).toContainText('Needs 1 more owner approval')
    await approve.getByRole('button', { name: /^Approve/ }).click()
    expect(await signedWrite(setup.wallet, 'approveOrgProposal', setup.orgId)).toEqual({ orgId: setup.orgId, proposalId: 'p-approve' })

    const waiting = list.getByRole('listitem').filter({ hasText: 'Change the handle to @acme-two' })
    await expect(waiting).toContainText('Can run in 1 day 4 hours')
    await expect(waiting.getByRole('button', { name: /^Run now/ })).toHaveCount(0)

    const ready = list.getByRole('listitem').filter({ hasText: 'Freeze' })
    await expect(ready).toContainText('Ready to run')
    await ready.getByRole('button', { name: /^Run now/ }).click()
    expect(await signedWrite(setup.wallet, 'executeOrgProposal', setup.orgId)).toEqual({ orgId: setup.orgId, proposalId: 'p-ready' })

    await waiting.getByRole('button', { name: /^Cancel/ }).click()
    await page.getByRole('button', { name: /^Yes, cancel/ }).click()
    expect(await signedWrite(setup.wallet, 'cancelOrgProposal', setup.orgId)).toEqual({ orgId: setup.orgId, proposalId: 'p-wait' })
    await expect(list.getByRole('listitem').filter({ hasText: 'Delete the organisation' })).toContainText('Cancelled')
  })

  test('an admin suspends delegations and disables a service account, but cannot approve', async ({ page }) => {
    const credential = orgCredential({ credentialId: 'urn:uuid:00000000-0000-4000-8000-0000000000d1', issuer: BOB })
    const setup = await openManagePage(page, {
      role: 'ADMIN',
      section: 'security',
      answers: {
        OrgProposals: (v) => ({ orgProposals: proposals(String(v.orgId)) }),
        OrgCredentials: () => ({
          orgCredentials: [
            credential,
            orgCredential({ credentialId: 'urn:uuid:00000000-0000-4000-8000-0000000000d2', status: { credentialId: 'x', appDid: APP_DID_A, orgId: 'o', counts: false, reason: 'SUSPENDED' } }),
          ],
        }),
        OrgWorkloads: () => ({ orgWorkloads: [orgWorkload({ repository: 'acme/ledger' })] }),
      },
    })
    await answer(setup.orgId, 'SuspendOrgCredentials', [credential.credentialId])
    await answer(setup.orgId, 'UnsuspendOrgCredential', true)
    await answer(setup.orgId, 'SetOrgWorkloadDisabled', orgWorkload({ disabled: true }))
    await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Propose a new owner' })).toHaveCount(0)

    const delegations = page.getByRole('list', { name: 'Delegations' })
    await expect(delegations).toContainText('Suspended by the organisation')
    await delegations.getByRole('button', { name: 'Suspend the delegation from 0x0b00…00b2' }).click()
    expect(await signedWrite(setup.wallet, 'suspendOrgCredentials', setup.orgId, (v) => Array.isArray(v.credentialIds))).toEqual({
      orgId: setup.orgId,
      credentialIds: [credential.credentialId],
    })
    await delegations.getByRole('button', { name: /^Lift the suspension/ }).click()
    expect(await signedWrite(setup.wallet, 'unsuspendOrgCredential', setup.orgId)).toEqual({
      orgId: setup.orgId,
      credentialId: 'urn:uuid:00000000-0000-4000-8000-0000000000d2',
    })
    await delegations.getByRole('button', { name: 'Suspend every delegation from 0x0b00…00b2' }).click()
    await page.getByRole('button', { name: 'Yes, suspend every delegation from 0x0b00…00b2' }).click()
    expect(await signedWrite(setup.wallet, 'suspendOrgCredentials', setup.orgId, (v) => typeof v.memberAddress === 'string')).toEqual({
      orgId: setup.orgId,
      memberAddress: BOB,
    })

    await page.getByRole('list', { name: 'Service accounts' }).getByRole('button', { name: 'Disable acme/ledger' }).click()
    expect(await signedWrite(setup.wallet, 'setOrgWorkloadDisabled', setup.orgId)).toMatchObject({ orgId: setup.orgId, disabled: true })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-manage-security.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL (the `security` section is a 404).

- [ ] **Step 3: Owners and proposals**

Create `components/org-manage/proposals-panel.tsx`:

```tsx
import { useCallback, useState, type FormEvent } from 'react'
import { useNow } from '../../hooks/use-now'
import { useRemote, type Remote } from '../../hooks/use-remote'
import { memberLabel, shortAddress } from '../../lib/orgs/format'
import { canApprove, canCancel, canExecute, PROPOSAL_STATUS_LABELS, proposalStage, proposalSummary, stageText } from '../../lib/orgs/proposals'
import { orgProposals } from '../../services/org-security'
import type { OrgMember, OrgProposal } from '../../services/orgs'
import { cx } from '../../utils/cx'
import { Field, inputClass } from '../profile-edit/field'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'

/** Owners, and (for owners) proposals to add or remove one. */
export function OwnersPanel({ ctx, members, onProposed }: { ctx: ManageContext; members: Remote<OrgMember[]>; onProposed: () => void }) {
  const owner = ctx.role === 'OWNER'
  const [candidate, setCandidate] = useState('')
  const [removal, setRemoval] = useState<Record<string, 'demote' | 'remove'>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function propose(key: string, payload: Record<string, unknown>, kind: 'ADD_OWNER' | 'REMOVE_OWNER', success: string) {
    setBusy(key)
    const done = await ctx.run<OrgProposal>('proposeOrgChange', { orgId: ctx.org.id, kind, payload }, success)
    setBusy(null)
    if (done) onProposed()
  }

  return (
    <Panel id="owners-title" title="Owners" description="Owners approve high-risk changes. With two or more owners, every such change needs two of them.">
      <RemoteView remote={members} what="owners" onRetry={() => undefined}>
        {(list) => {
          const active = list.filter((m) => m.status === 'ACTIVE')
          const owners = active.filter((m) => m.role === 'OWNER')
          const others = active.filter((m) => m.role !== 'OWNER')
          const chosen = candidate || others[0]?.address || ''
          return (
            <>
              <ul aria-label="Owners" className="divide-hairline divide-y">
                {owners.map((member) => {
                  const label = memberLabel(member)
                  const mode = removal[member.address] ?? 'demote'
                  return (
                    <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-ink truncate font-semibold">
                          {label}
                          {member.address === ctx.address && <span className="text-ink-muted font-normal"> (you)</span>}
                        </p>
                        <p className="text-ink-muted truncate font-mono text-xs">{member.address}</p>
                      </div>
                      {owner && owners.length > 1 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={`removal-${member.id}`} className="sr-only">
                            How to remove {label}
                          </label>
                          <select
                            id={`removal-${member.id}`}
                            className={cx(inputClass, 'w-auto')}
                            value={mode}
                            onChange={(e) => setRemoval((r) => ({ ...r, [member.address]: e.target.value === 'remove' ? 'remove' : 'demote' }))}
                          >
                            <option value="demote">Demote to admin</option>
                            <option value="remove">Remove from the organisation</option>
                          </select>
                          <button
                            type="button"
                            disabled={busy === member.address}
                            onClick={() =>
                              void propose(
                                member.address,
                                { address: member.address, demoteToAdmin: mode === 'demote' },
                                'REMOVE_OWNER',
                                `Removing ${label} as an owner was proposed.`,
                              )
                            }
                            className={buttonClasses('ghost', 'md')}
                          >
                            Propose removing {label}
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {owner && (
                <form
                  noValidate
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault()
                    if (chosen) void propose('add', { address: chosen }, 'ADD_OWNER', 'A new owner was proposed.')
                  }}
                  className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start"
                >
                  <div className="min-w-0 flex-1">
                    <Field id="new-owner" label="New owner" hint={others.length === 0 ? 'Invite someone first: only members can become owners.' : undefined}>
                      <select id="new-owner" className={inputClass} value={chosen} onChange={(e) => setCandidate(e.target.value)} disabled={others.length === 0}>
                        {others.map((member) => (
                          <option key={member.id} value={member.address}>
                            {memberLabel(member)} ({shortAddress(member.address)})
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <button type="submit" disabled={!chosen || busy === 'add'} className={buttonClasses('primary', 'md', 'sm:mt-[1.625rem]')}>
                    Propose a new owner
                  </button>
                </form>
              )}
            </>
          )
        }}
      </RemoteView>
    </Panel>
  )
}

/** Every proposal, pending first, with where it stands and what the viewer may do. */
export function ProposalsPanel({ ctx, proposals, onChange, appName }: { ctx: ManageContext; proposals: Remote<OrgProposal[]>; onChange: () => void; appName: (did: string) => string }) {
  const now = useNow(30_000)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(p: OrgProposal, name: 'approveOrgProposal' | 'cancelOrgProposal' | 'executeOrgProposal', success: string) {
    setBusy(p.id)
    const done = await ctx.run<OrgProposal>(name, { orgId: ctx.org.id, proposalId: p.id }, success)
    setBusy(null)
    if (done) {
      onChange()
      if (name === 'executeOrgProposal') ctx.reloadOrg()
    }
  }

  return (
    <Panel
      id="proposals-title"
      title="Proposals"
      description="High-risk changes wait for owners’ approval and a delay: 48 hours, 7 days for a recovery, none for freezing. Any owner can cancel before they run."
    >
      <RemoteView remote={proposals} what="proposals" onRetry={onChange}>
        {(list) => {
          if (list.length === 0) return <p className="text-ink-muted text-sm">No proposals yet.</p>
          const sorted = [...list.filter((p) => p.status === 'PENDING'), ...list.filter((p) => p.status !== 'PENDING').slice(0, 20)]
          return (
            <ul aria-label="Proposals" className="divide-hairline divide-y">
              {sorted.map((p) => {
                const summary = proposalSummary(p, appName)
                const stage = proposalStage(p, now)
                return (
                  <li key={p.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink font-semibold break-words">{summary}</p>
                        <p className="text-ink-muted mt-1 text-xs">
                          Proposed by {shortAddress(p.proposer)}, {p.approvals.length} of {p.threshold} approvals
                          {p.reason ? `. ${p.reason}` : ''}
                        </p>
                      </div>
                      {p.status === 'PENDING' ? (
                        <Badge tone={stage.stage === 'ready' ? 'signal' : 'neutral'}>{stageText(stage, now)}</Badge>
                      ) : (
                        <Badge>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
                      )}
                    </div>
                    {p.status === 'PENDING' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canApprove(p, ctx.address, ctx.role) && (
                          <button type="button" disabled={busy === p.id} onClick={() => void act(p, 'approveOrgProposal', 'Approved.')} aria-label={`Approve: ${summary}`} className={buttonClasses('primary', 'md')}>
                            Approve
                          </button>
                        )}
                        {canExecute(p, ctx.address, ctx.role, now) && (
                          <button type="button" disabled={busy === p.id} onClick={() => void act(p, 'executeOrgProposal', 'Carried out.')} aria-label={`Run now: ${summary}`} className={buttonClasses('primary', 'md')}>
                            Run now
                          </button>
                        )}
                        {canCancel(p, ctx.address, ctx.role) && (
                          <ConfirmButton label={`Cancel: ${summary}`} confirm={`Yes, cancel: ${summary}`} busy={busy === p.id} onConfirm={() => void act(p, 'cancelOrgProposal', 'Cancelled.')} />
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )
        }}
      </RemoteView>
    </Panel>
  )
}

/** The proposals read, shared by the panels that create and list them. */
export function useOrgProposals(ctx: ManageContext) {
  const { org, getBearer } = ctx
  const load = useCallback(async () => orgProposals(org.id, await getBearer()), [org.id, getBearer])
  return useRemote(`proposals:${org.id}`, load)
}
```

(`ConfirmButton` shows its `label` as text, so the cancel button reads "Cancel: <summary>"; the test matches it with `/^Cancel/`.)

- [ ] **Step 4: Delegations and service accounts**

Create `components/org-manage/delegations-panel.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { canUnsuspend, credentialStateText } from '../../lib/orgs/credentials'
import { roleLabel, shortAddress } from '../../lib/orgs/format'
import { orgCredentials, orgWorkloads, type OrgCredential, type OrgWorkload } from '../../services/org-security'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'

/** Keys members authorised for the organisation's apps, whether each still counts, and suspension. */
export function DelegationsPanel({ ctx, appName }: { ctx: ManageContext; appName: (did: string) => string }) {
  const { org, getBearer } = ctx
  const load = useCallback(async () => orgCredentials(org.id, await getBearer()), [org.id, getBearer])
  const credentials = useRemote(`credentials:${org.id}`, load)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(key: string, name: 'suspendOrgCredentials' | 'unsuspendOrgCredential', args: Record<string, unknown>, success: string) {
    setBusy(key)
    const done = await ctx.run(name, { orgId: org.id, ...args }, success)
    setBusy(null)
    if (done !== null) credentials.reload()
  }

  return (
    <Panel
      id="delegations-title"
      title="Delegations"
      description="App keys members authorised for the organisation’s apps. A delegation counts only while its issuer may publish the app, it is not suspended and the app is not frozen. Leaving or being removed suspends a member’s delegations."
    >
      <RemoteView remote={credentials.state} what="delegations" onRetry={credentials.reload}>
        {(list) => {
          if (list.length === 0) return <p className="text-ink-muted text-sm">No delegations for the organisation’s apps.</p>
          const issuers = [...new Set(list.map((c) => c.issuer.toLowerCase()))]
          return (
            <>
              <ul aria-label="Delegations" className="divide-hairline divide-y">
                {list.map((c: OrgCredential) => {
                  const issuer = shortAddress(c.issuer.toLowerCase())
                  return (
                    <li key={c.credentialId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-ink text-sm font-semibold break-words">
                          {appName(c.appDid)}, from {issuer}
                          {c.issuerRole ? ` (${roleLabel(c.issuerRole)})` : ''}
                        </p>
                        <p className="text-ink-muted font-mono text-xs break-all">{c.credentialId}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={c.status.counts && !c.revoked ? 'signal' : 'neutral'}>{credentialStateText(c)}</Badge>
                        {canUnsuspend(c) ? (
                          <button
                            type="button"
                            disabled={busy === c.credentialId}
                            onClick={() => void act(c.credentialId, 'unsuspendOrgCredential', { credentialId: c.credentialId }, 'Suspension lifted.')}
                            className={buttonClasses('ghost', 'md')}
                          >
                            Lift the suspension of the delegation from {issuer}
                          </button>
                        ) : (
                          c.status.counts &&
                          !c.revoked && (
                            <button
                              type="button"
                              disabled={busy === c.credentialId}
                              onClick={() => void act(c.credentialId, 'suspendOrgCredentials', { credentialIds: [c.credentialId] }, 'Delegation suspended.')}
                              className={buttonClasses('ghost', 'md', 'text-danger-ink')}
                            >
                              Suspend the delegation from {issuer}
                            </button>
                          )
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {issuers.map((address) => (
                  <ConfirmButton
                    key={address}
                    label={`Suspend every delegation from ${shortAddress(address)}`}
                    confirm={`Yes, suspend every delegation from ${shortAddress(address)}`}
                    busy={busy === address}
                    onConfirm={() => void act(address, 'suspendOrgCredentials', { memberAddress: address }, `Every delegation from ${shortAddress(address)} is suspended.`)}
                  />
                ))}
              </div>
            </>
          )
        }}
      </RemoteView>
    </Panel>
  )
}

/** Workload identities (CI deploy keys) registered for the organisation, with disable and enable. */
export function WorkloadsPanel({ ctx }: { ctx: ManageContext }) {
  const { org, getBearer } = ctx
  const load = useCallback(async () => orgWorkloads(org.id, await getBearer()), [org.id, getBearer])
  const workloads = useRemote(`workloads:${org.id}`, load)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(w: OrgWorkload) {
    setBusy(w.did)
    const done = await ctx.run<OrgWorkload>('setOrgWorkloadDisabled', { orgId: org.id, did: w.did, disabled: !w.disabled }, w.disabled ? `${w.repository} can get tokens again.` : `${w.repository} gets no tokens until enabled.`)
    setBusy(null)
    if (done) workloads.reload()
  }

  return (
    <Panel id="workloads-title" title="Service accounts" description="Deploy pipelines registered for the organisation’s apps. A disabled one gets no tokens.">
      <RemoteView remote={workloads.state} what="service accounts" onRetry={workloads.reload}>
        {(list) =>
          list.length === 0 ? (
            <p className="text-ink-muted text-sm">No service accounts.</p>
          ) : (
            <ul aria-label="Service accounts" className="divide-hairline divide-y">
              {list.map((w) => (
                <li key={w.did} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-ink text-sm font-semibold break-words">
                      {w.repository} <span className="text-ink-muted font-normal">({w.productionBranch})</span>
                    </p>
                    <p className="text-ink-muted font-mono text-xs break-all">{w.did}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {w.disabled && <Badge>Disabled</Badge>}
                    <button type="button" disabled={busy === w.did} onClick={() => void toggle(w)} className={buttonClasses('ghost', 'md')}>
                      {w.disabled ? `Enable ${w.repository}` : `Disable ${w.repository}`}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </RemoteView>
    </Panel>
  )
}
```

- [ ] **Step 5: The section**

Create `components/org-manage/security-section.tsx`:

```tsx
import Link from 'next/link'
import { useCallback } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { manageHref, shortDid } from '../../lib/orgs/format'
import { listAppProfiles } from '../../services/app-profiles'
import { organizationMembers } from '../../services/orgs'
import { DelegationsPanel, WorkloadsPanel } from './delegations-panel'
import type { ManageSectionProps } from './manage-context'
import { Panel } from './manage-ui'
import { OwnersPanel, ProposalsPanel, useOrgProposals } from './proposals-panel'

export function SecuritySection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const loadMembers = useCallback(async () => organizationMembers(org.id, false, await getBearer()), [org.id, getBearer])
  const members = useRemote(`security-members:${org.id}`, loadMembers)
  const proposals = useOrgProposals(ctx)
  const loadNames = useCallback(
    () => (org.apps.length > 0 ? listAppProfiles({ limit: 50, orgId: org.id }).then((page) => page.items) : Promise.resolve([])),
    [org.id, org.apps.length],
  )
  const profiles = useRemote(`security-apps:${org.id}`, loadNames)
  const names = new Map(profiles.state.status === 'ready' ? profiles.state.value.map((p) => [p.appDid, p.name?.trim() ?? ''] as const) : [])
  const appName = (did: string) => names.get(did) || shortDid(did)

  return (
    <div className="mt-6 space-y-8">
      {org.securityWarnings.includes('SINGLE_OWNER') && (
        <p role="note" className="border-caution-ink/35 bg-caution-ink/[0.07] text-ink rounded-card border px-4 py-3 text-sm leading-6">
          Only one owner. If that wallet is lost, the organisation can only be recovered through a verified domain, which takes 7 days.
          Propose a second owner below.
        </p>
      )}
      <OwnersPanel ctx={ctx} members={members.state} onProposed={proposals.reload} />
      <ProposalsPanel ctx={ctx} proposals={proposals.state} onChange={proposals.reload} appName={appName} />
      <DelegationsPanel ctx={ctx} appName={appName} />
      <WorkloadsPanel ctx={ctx} />
      <Panel id="recovery-title" title="Recovery">
        <p className="text-ink-muted max-w-[70ch] text-sm leading-6">
          If every owner loses access, whoever controls a domain verified for the organisation for at least 14 days can publish a
          recovery record naming a new owner and start a recovery. It runs after 7 days unless an owner cancels it here, and every
          owner is notified. Verify a domain under{' '}
          <Link href={manageHref(org.handle, 'domains')} className="text-primary-ink font-semibold underline-offset-4 hover:underline">
            Domains
          </Link>{' '}
          to make recovery possible.
        </p>
      </Panel>
    </div>
  )
}
```

- [ ] **Step 6: Register the section**

In `lib/orgs/manage-sections.ts`, add `{ key: 'security', label: 'Security', minRole: 'ADMIN' },` after the `apps` entry. In `components/org-manage/section-components.tsx`, import `SecuritySection` from `./security-section` and add `security: SecuritySection,`.

- [ ] **Step 7: Run the spec**

Run: `pnpm exec playwright test e2e/org-manage-security.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 8: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean.

```bash
git add components/org-manage lib/orgs/manage-sections.ts e2e/org-manage-security.spec.ts
git commit -m "feat(orgs): manage security: owners, proposals, delegations, service accounts"
```

---

### Task 4: Manage domains and webhooks (secrets shown once)

**Files:**
- Create: `lib/orgs/domains.ts`, `lib/orgs/webhooks.ts`, `components/org-manage/secret-once.tsx`, `components/org-manage/domains-section.tsx`, `components/org-manage/webhooks-section.tsx`
- Modify: `lib/orgs/manage-sections.ts`, `components/org-manage/section-components.tsx`
- Test: `e2e/org-manage-integrations.spec.ts`

**Interfaces:**
- Consumes: `ManageContext`, `Panel`, `RemoteView`, `ConfirmButton` (B1); `useRemote`, `useNow` (B1); `orgDomains`, `orgWebhooks`, `orgWebhookDeliveries`, `OrgDomain`, `OrgWebhook`, `OrgWebhookCreated`, `OrgWebhookDelivery` (Task 1); `formatDay` (`lib/verify/format.ts`); `formatRelative`.
- Produces:
  - `lib/orgs/domains.ts`: `ORG_DOMAIN_RE`, `normalizeDomain(raw): string`, `domainProblem(domain): string | null`, `domainStatusText(d: OrgDomain): string`.
  - `lib/orgs/webhooks.ts`: `ORG_WEBHOOK_EVENTS` (19), `webhookUrlProblem(url): string | null`, `MAX_WEBHOOKS = 10`.
  - `SecretOnce({ label, value, children? })` (region named `label`, copy button "Copy").
  - Sections `domains` and `webhooks` (ADMIN).

- [ ] **Step 1: Write the failing test**

Create `e2e/org-manage-integrations.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { domainProblem, normalizeDomain } from '../lib/orgs/domains'
import { ORG_WEBHOOK_EVENTS, webhookUrlProblem } from '../lib/orgs/webhooks'
import { orgDelivery, orgDomain, orgWebhook } from './support/org-fixtures'
import { openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub } from './support/stub-switchboard-client'

async function answer(orgId: string, name: string, value: unknown) {
  await fixtureStub({ match: `mutation ${name}`, variables: orgId, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
}

test.describe('domain and webhook rules', () => {
  test('domains are normalised and checked, webhooks are https', () => {
    expect(normalizeDomain(' https://WWW.Acme.Example/about ')).toBe('www.acme.example')
    expect(normalizeDomain('acme.example.')).toBe('acme.example')
    expect(domainProblem('acme')).toBe('Enter a domain such as acme.com.')
    expect(domainProblem('10.0.0.1')).toBe('Enter a domain such as acme.com.')
    expect(domainProblem('acme.example')).toBeNull()
    expect(ORG_WEBHOOK_EVENTS).toHaveLength(19)
    expect(webhookUrlProblem('http://hooks.example')).toBe('Use an https:// address.')
    expect(webhookUrlProblem('https://user:pw@hooks.example')).toBe('Leave user names and passwords out of the address.')
    expect(webhookUrlProblem('https://hooks.example/renown')).toBeNull()
  })
})

test.describe('manage: domains', () => {
  test('adds a domain, shows both proofs, checks and removes it', async ({ page }) => {
    const setup = await openManagePage(page, {
      role: 'ADMIN',
      section: 'domains',
      answers: {
        OrgDomains: (v) => ({
          orgDomains: [
            orgDomain({ orgId: String(v.orgId), id: 'd-pending', domain: 'acme.example' }),
            orgDomain({ orgId: String(v.orgId), id: 'd-ok', domain: 'verified.example', status: 'VERIFIED', verifiedAt: '2026-10-01T10:00:00.000Z' }),
          ],
        }),
      },
    })
    await answer(setup.orgId, 'AddOrgDomain', orgDomain({ orgId: setup.orgId, domain: 'new.example' }))
    await fixtureStub({ match: 'mutation CheckOrgDomain', variables: 'd-pending', response: { data: null, errors: [{ message: 'Proof missing', extensions: { code: 'DOMAIN_PROOF_MISSING' } }] } })
    await answer(setup.orgId, 'RemoveOrgDomain', true)

    await page.getByLabel('Domain').fill('https://New.Example/')
    await page.getByRole('button', { name: 'Add domain' }).click()
    expect(await signedWrite(setup.wallet, 'addOrgDomain', setup.orgId)).toEqual({ orgId: setup.orgId, domain: 'new.example' })

    const pending = page.getByRole('list', { name: 'Domains' }).getByRole('listitem').filter({ hasText: 'acme.example' })
    await expect(pending).toContainText('_renown.acme.example')
    await expect(pending).toContainText(`renown-org=${setup.orgId};token=tok123`)
    await expect(pending).toContainText('https://acme.example/.well-known/renown.json')
    await pending.getByRole('button', { name: 'Check acme.example now' }).click()
    await expect(page.getByText('Renown could not find the proof yet.')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Domains' })).toContainText('Verified since 1 October 2026')
    await pending.getByRole('button', { name: 'Remove acme.example' }).click()
    await page.getByRole('button', { name: 'Yes, remove acme.example' }).click()
    expect(await signedWrite(setup.wallet, 'removeOrgDomain', setup.orgId)).toEqual({ orgId: setup.orgId, domainId: 'd-pending' })
  })
})

test.describe('manage: webhooks', () => {
  test('shows the webhook secret once, tests, disables and lists deliveries', async ({ page }) => {
    const setup = await openManagePage(page, {
      role: 'ADMIN',
      section: 'webhooks',
      answers: {
        OrgWebhooks: (v) => ({ orgWebhooks: [orgWebhook({ orgId: String(v.orgId), id: 'hook-1' })] }),
        OrgWebhookDeliveries: () => ({ orgWebhookDeliveries: [orgDelivery({ status: 'FAILED', responseStatus: 500, lastError: 'Server error' })] }),
      },
    })
    const secret = 'whsec_E2eShownOnceAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    await answer(setup.orgId, 'CreateOrgWebhook', { webhook: orgWebhook({ orgId: setup.orgId, id: 'hook-2' }), secret })
    await answer(setup.orgId, 'TestOrgWebhook', orgDelivery({ eventType: 'ping', status: 'DELIVERED', responseStatus: 204 }))
    await answer(setup.orgId, 'UpdateOrgWebhook', orgWebhook({ orgId: setup.orgId, enabled: false }))

    await page.getByLabel('Endpoint URL').fill('https://hooks.acme.example/new')
    await page.getByLabel('member.joined').check()
    await page.getByLabel('proposal.created').check()
    await page.getByRole('button', { name: 'Add webhook' }).click()
    expect(await signedWrite(setup.wallet, 'createOrgWebhook', setup.orgId)).toEqual({
      orgId: setup.orgId,
      url: 'https://hooks.acme.example/new',
      events: ['member.joined', 'proposal.created'],
    })
    const shown = page.getByRole('region', { name: 'Webhook signing secret' })
    await expect(shown).toContainText(secret)
    expect(page.url()).not.toContain(secret)

    const hook = page.getByRole('list', { name: 'Webhooks' }).getByRole('listitem').first()
    await hook.getByRole('button', { name: 'Send a test event' }).click()
    await expect(page.getByText('Test event delivered (HTTP 204).')).toBeVisible()
    await hook.getByRole('button', { name: 'Show deliveries' }).click()
    await expect(hook.getByRole('list', { name: 'Deliveries' })).toContainText('Failed, HTTP 500')
    await hook.getByRole('button', { name: 'Disable' }).click()
    expect(await signedWrite(setup.wallet, 'updateOrgWebhook', setup.orgId)).toEqual({ orgId: setup.orgId, webhookId: 'hook-1', enabled: false })

    await page.getByRole('navigation', { name: 'Organisation settings' }).getByRole('link', { name: 'Members' }).click()
    await page.getByRole('navigation', { name: 'Organisation settings' }).getByRole('link', { name: 'Webhooks' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Webhooks' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Webhook signing secret' })).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-manage-integrations.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../lib/orgs/domains'`.

- [ ] **Step 3: Pure rules**

Create `lib/orgs/domains.ts`:

```ts
// Organisation domains (renown-package A2 ruling 7). Pure.
import { formatDay } from '../verify/format'
import type { OrgDomain } from '../../services/org-security'

/** The switchboard's rule: lowercase labels, at least two, a top-level label starting with a letter. */
export const ORG_DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/

/** What people paste ("https://Acme.com/about", "acme.com.") as a bare lowercase domain. */
export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
}

export function domainProblem(domain: string): string | null {
  return ORG_DOMAIN_RE.test(domain) ? null : 'Enter a domain such as acme.com.'
}

export function domainStatusText(domain: OrgDomain): string {
  if (domain.status === 'VERIFIED') return domain.verifiedAt ? `Verified since ${formatDay(domain.verifiedAt)}` : 'Verified'
  if (domain.status === 'LAPSED') return 'Lapsed: the proof was missing on three daily checks'
  return 'Waiting for proof'
}
```

Create `lib/orgs/webhooks.ts`:

```ts
// Organisation webhooks (renown-package A3 rulings 4 and 5). Pure.

export const ORG_WEBHOOK_EVENTS = [
  'member.invited',
  'member.joined',
  'member.left',
  'member.removed',
  'member.role_changed',
  'team.changed',
  'app.transferred_in',
  'app.transferred_out',
  'app.frozen',
  'app.unfrozen',
  'credential.suspended',
  'proposal.created',
  'proposal.approved',
  'proposal.cancelled',
  'proposal.executed',
  'domain.verified',
  'domain.lapsed',
  'release.attested',
  'org.updated',
] as const

export const MAX_WEBHOOKS = 10

export function webhookUrlProblem(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return 'Enter a full https:// address.'
  }
  if (parsed.protocol !== 'https:') return 'Use an https:// address.'
  if (parsed.username || parsed.password) return 'Leave user names and passwords out of the address.'
  if (url.trim().length > 2048) return 'Use at most 2048 characters.'
  return null
}
```

- [ ] **Step 4: The one-time secret**

Create `components/org-manage/secret-once.tsx`:

```tsx
import { useState, type ReactNode } from 'react'
import { buttonClasses } from '../site/primitives'

/** A secret Renown shows only once: kept in component state only, with a copy button. */
export function SecretOnce({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <div role="region" aria-label={label} className="border-primary/30 bg-primary/[0.05] rounded-card mt-5 border p-4">
      <p className="text-ink text-sm font-semibold">Copy it now: Renown shows it only once.</p>
      <p className="text-ink mt-2 font-mono text-[13px] break-all">{value}</p>
      <button
        type="button"
        onClick={() => {
          Promise.resolve()
            .then(() => navigator.clipboard.writeText(value))
            .then(
              () => setCopied(true),
              () => setCopied(false),
            )
        }}
        className={buttonClasses('secondary', 'md', 'mt-3')}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {children}
    </div>
  )
}
```

- [ ] **Step 5: The domains section**

Create `components/org-manage/domains-section.tsx`:

```tsx
import { useCallback, useState, type FormEvent } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { domainProblem, domainStatusText, normalizeDomain } from '../../lib/orgs/domains'
import { orgDomains, type OrgDomain } from '../../services/org-security'
import { Field, inputClass } from '../profile-edit/field'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageSectionProps } from './manage-context'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'

function Proof({ domain }: { domain: OrgDomain }) {
  const code = 'text-ink bg-code rounded-md px-2 py-1 font-mono text-[13px] break-all'
  return (
    <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
      <div className="min-w-0">
        <p className="text-ink font-semibold">Either a DNS TXT record</p>
        <p className="text-ink-muted mt-1">Name</p>
        <p className={code}>{domain.txtName}</p>
        <p className="text-ink-muted mt-2">Value</p>
        <p className={code}>{domain.txtValue}</p>
      </div>
      <div className="min-w-0">
        <p className="text-ink font-semibold">Or a file on your site</p>
        <p className="text-ink-muted mt-1">At</p>
        <p className={code}>{domain.wellKnownUrl}</p>
        <p className="text-ink-muted mt-2">Containing</p>
        <p className={code}>{domain.wellKnownJson}</p>
      </div>
    </div>
  )
}

export function DomainsSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const load = useCallback(async () => orgDomains(org.id, await getBearer()), [org.id, getBearer])
  const domains = useRemote(`domains:${org.id}`, load)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function add(event: FormEvent) {
    event.preventDefault()
    const domain = normalizeDomain(text)
    const found = domainProblem(domain)
    if (found) {
      setProblem(found)
      return
    }
    setBusy('add')
    const done = await ctx.run<OrgDomain>('addOrgDomain', { orgId: org.id, domain }, `${domain} added. Publish one of the proofs, then check it.`)
    setBusy(null)
    if (done) {
      setText('')
      domains.reload()
    }
  }

  async function check(domain: OrgDomain) {
    setBusy(domain.id)
    const done = await ctx.run<OrgDomain>('checkOrgDomain', { orgId: org.id, domainId: domain.id }, `${domain.domain} is verified.`)
    setBusy(null)
    if (done) {
      domains.reload()
      ctx.reloadOrg()
    }
  }

  async function remove(domain: OrgDomain) {
    setBusy(domain.id)
    const done = await ctx.run<boolean>('removeOrgDomain', { orgId: org.id, domainId: domain.id }, `${domain.domain} was removed.`)
    setBusy(null)
    if (done !== null) {
      domains.reload()
      ctx.reloadOrg()
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <Panel
        id="add-domain-title"
        title="Add a domain"
        description="A verified domain shows as “Verified: <domain>” on the organisation’s page, appears in sign-ins that ask about organisations, and after 14 days lets you recover the organisation. Up to 10 domains."
      >
        <form onSubmit={(event) => void add(event)} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <Field id="domain-new" label="Domain" error={problem ?? undefined}>
              <input
                id="domain-new"
                className={inputClass}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setProblem(null)
                }}
                placeholder="acme.com"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          </div>
          <button type="submit" disabled={busy === 'add'} className={buttonClasses('primary', 'md', 'sm:mt-[1.625rem]')}>
            Add domain
          </button>
        </form>
      </Panel>
      <Panel id="domains-title" title="Domains" description="Renown re-checks verified domains every day; a domain whose proof is missing three days in a row lapses.">
        <RemoteView remote={domains.state} what="domains" onRetry={domains.reload}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">No domains yet.</p>
            ) : (
              <ul aria-label="Domains" className="divide-hairline divide-y">
                {list.map((domain) => (
                  <li key={domain.id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink font-semibold break-all">{domain.domain}</p>
                        <p className="text-ink-muted text-xs">{domainStatusText(domain)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={domain.status === 'VERIFIED' ? 'signal' : 'neutral'}>
                          {domain.status === 'VERIFIED' ? 'Verified' : domain.status === 'LAPSED' ? 'Lapsed' : 'Pending'}
                        </Badge>
                        {domain.status !== 'VERIFIED' && (
                          <button type="button" disabled={busy === domain.id} onClick={() => void check(domain)} className={buttonClasses('secondary', 'md')}>
                            Check {domain.domain} now
                          </button>
                        )}
                        <ConfirmButton label={`Remove ${domain.domain}`} confirm={`Yes, remove ${domain.domain}`} busy={busy === domain.id} onConfirm={() => void remove(domain)} />
                      </div>
                    </div>
                    {domain.status !== 'VERIFIED' && <Proof domain={domain} />}
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </Panel>
    </div>
  )
}
```

(`checkOrgDomain` refused with `DOMAIN_PROOF_MISSING` shows the B1 text "Renown could not find the proof yet. …" as an error toast.)

- [ ] **Step 6: The webhooks section**

Create `components/org-manage/webhooks-section.tsx`:

```tsx
import { useCallback, useState, type FormEvent } from 'react'
import { useNow } from '../../hooks/use-now'
import { useRemote } from '../../hooks/use-remote'
import { MAX_WEBHOOKS, ORG_WEBHOOK_EVENTS, webhookUrlProblem } from '../../lib/orgs/webhooks'
import { orgWebhookDeliveries, orgWebhooks, type OrgWebhook, type OrgWebhookCreated, type OrgWebhookDelivery } from '../../services/org-security'
import { formatRelative } from '../../utils/relative-time'
import { Field, inputClass } from '../profile-edit/field'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext, ManageSectionProps } from './manage-context'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'
import { SecretOnce } from './secret-once'

const DELIVERY_STATUS: Record<OrgWebhookDelivery['status'], string> = { PENDING: 'Retrying', DELIVERED: 'Delivered', FAILED: 'Failed' }

function deliveryText(d: OrgWebhookDelivery): string {
  return `${DELIVERY_STATUS[d.status]}${d.responseStatus !== null ? `, HTTP ${d.responseStatus}` : d.lastError ? `, ${d.lastError}` : ''}`
}

function Deliveries({ ctx, hook }: { ctx: ManageContext; hook: OrgWebhook }) {
  const { org, getBearer } = ctx
  const now = useNow()
  const load = useCallback(async () => orgWebhookDeliveries(org.id, hook.id, await getBearer()), [org.id, hook.id, getBearer])
  const deliveries = useRemote(`deliveries:${hook.id}`, load)
  return (
    <div className="mt-3">
      <RemoteView remote={deliveries.state} what="deliveries" onRetry={deliveries.reload}>
        {(list) =>
          list.length === 0 ? (
            <p className="text-ink-muted text-sm">No deliveries yet.</p>
          ) : (
            <ul aria-label="Deliveries" className="border-hairline rounded-card divide-hairline divide-y border text-sm">
              {list.map((d) => (
                <li key={d.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span className="text-ink font-mono text-xs">{d.eventType}</span>
                  <span className={d.status === 'FAILED' ? 'text-danger-ink' : 'text-ink-muted'}>
                    {deliveryText(d)}, {formatRelative(d.createdAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </RemoteView>
    </div>
  )
}

export function WebhooksSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const load = useCallback(async () => orgWebhooks(org.id, await getBearer()), [org.id, getBearer])
  const hooks = useRemote(`webhooks:${org.id}`, load)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function create(event: FormEvent) {
    event.preventDefault()
    const found = webhookUrlProblem(url) ?? (events.length === 0 ? 'Choose at least one event.' : null)
    if (found) {
      setProblem(found)
      return
    }
    setBusy('create')
    // Events in the documented order, whatever order they were ticked in.
    const ordered = ORG_WEBHOOK_EVENTS.filter((name) => events.includes(name))
    const done = await ctx.run<OrgWebhookCreated>('createOrgWebhook', { orgId: org.id, url: url.trim(), events: ordered }, 'Webhook added.')
    setBusy(null)
    if (done) {
      setSecret(done.secret)
      setUrl('')
      setEvents([])
      hooks.reload()
    }
  }

  async function test(hook: OrgWebhook) {
    setBusy(hook.id)
    const delivery = await ctx.run<OrgWebhookDelivery>('testOrgWebhook', { orgId: org.id, webhookId: hook.id }, 'Test event sent.')
    setBusy(null)
    if (delivery) ctx.notify(delivery.status === 'DELIVERED' ? 'success' : 'error', `Test event ${delivery.status === 'DELIVERED' ? 'delivered' : 'failed'} (${delivery.responseStatus !== null ? `HTTP ${delivery.responseStatus}` : delivery.lastError ?? 'no answer'}).`)
  }

  async function update(hook: OrgWebhook, enabled: boolean) {
    setBusy(hook.id)
    const done = await ctx.run<OrgWebhook>('updateOrgWebhook', { orgId: org.id, webhookId: hook.id, enabled }, enabled ? 'Webhook enabled.' : 'Webhook disabled.')
    setBusy(null)
    if (done) hooks.reload()
  }

  async function remove(hook: OrgWebhook) {
    setBusy(hook.id)
    const done = await ctx.run<boolean>('deleteOrgWebhook', { orgId: org.id, webhookId: hook.id }, 'Webhook deleted.')
    setBusy(null)
    if (done !== null) hooks.reload()
  }

  const count = hooks.state.status === 'ready' ? hooks.state.value.length : 0

  return (
    <div className="mt-6 space-y-8">
      <Panel id="add-webhook-title" title="Add a webhook" description={`Renown POSTs each chosen event, signed with the secret, to your https endpoint and retries for about 15 hours. Up to ${MAX_WEBHOOKS} webhooks.`}>
        <form onSubmit={(event) => void create(event)} noValidate className="space-y-4">
          <Field id="webhook-url" label="Endpoint URL" error={problem ?? undefined}>
            <input
              id="webhook-url"
              type="url"
              className={inputClass}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setProblem(null)
              }}
              placeholder="https://"
            />
          </Field>
          <fieldset>
            <legend className="text-ink text-sm font-semibold">Events</legend>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {ORG_WEBHOOK_EVENTS.map((name) => (
                <li key={name}>
                  <label className="text-ink flex items-center gap-2 font-mono text-xs">
                    <input type="checkbox" checked={events.includes(name)} onChange={(e) => setEvents((list) => (e.target.checked ? [...list, name] : list.filter((n) => n !== name)))} />
                    {name}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <button type="submit" disabled={busy === 'create' || count >= MAX_WEBHOOKS} className={buttonClasses('primary', 'md')}>
            Add webhook
          </button>
        </form>
        {secret && (
          <SecretOnce label="Webhook signing secret" value={secret}>
            <p className="text-ink-muted mt-3 text-xs leading-5">
              Check each request&apos;s Renown-Signature header with <span className="font-mono">verifyWebhookSignature(secret, header, rawBody)</span> from
              @powerhousedao/renown-package/orgs.
            </p>
          </SecretOnce>
        )}
      </Panel>
      <Panel id="webhooks-title" title="Webhooks" description="A webhook that fails 50 times in a row is disabled; enabling it again resets the count.">
        <RemoteView remote={hooks.state} what="webhooks" onRetry={hooks.reload}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">No webhooks yet.</p>
            ) : (
              <ul aria-label="Webhooks" className="divide-hairline divide-y">
                {list.map((hook) => (
                  <li key={hook.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink text-sm font-semibold break-all">{hook.url}</p>
                        <p className="text-ink-muted font-mono text-xs break-words">{hook.events.join(', ')}</p>
                        {hook.consecutiveFailures > 0 && <p className="text-caution-ink text-xs">{hook.consecutiveFailures} failed deliveries in a row</p>}
                      </div>
                      {!hook.enabled && <Badge>Disabled</Badge>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={busy === hook.id} onClick={() => void test(hook)} className={buttonClasses('secondary', 'md')}>
                        Send a test event
                      </button>
                      <button type="button" aria-expanded={open === hook.id} onClick={() => setOpen(open === hook.id ? null : hook.id)} className={buttonClasses('ghost', 'md')}>
                        {open === hook.id ? 'Hide deliveries' : 'Show deliveries'}
                      </button>
                      <button type="button" disabled={busy === hook.id} onClick={() => void update(hook, !hook.enabled)} className={buttonClasses('ghost', 'md')}>
                        {hook.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <ConfirmButton label="Delete" confirm="Yes, delete it" busy={busy === hook.id} onConfirm={() => void remove(hook)} />
                    </div>
                    {open === hook.id && <Deliveries ctx={ctx} hook={hook} />}
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </Panel>
    </div>
  )
}
```

(The test toast reads "Test event delivered (HTTP 204)." via `ctx.notify`, after `ctx.run`'s "Test event sent.")

- [ ] **Step 7: Register the sections**

In `lib/orgs/manage-sections.ts`, add after `security`:

```ts
  { key: 'domains', label: 'Domains', minRole: 'ADMIN' },
  { key: 'webhooks', label: 'Webhooks', minRole: 'ADMIN' },
```

In `components/org-manage/section-components.tsx`, import `DomainsSection` and `WebhooksSection` and add `domains: DomainsSection,` and `webhooks: WebhooksSection,`.

- [ ] **Step 8: Run the spec**

Run: `pnpm exec playwright test e2e/org-manage-integrations.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 9: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean.

```bash
git add lib/orgs/domains.ts lib/orgs/webhooks.ts components/org-manage lib/orgs/manage-sections.ts e2e/org-manage-integrations.spec.ts
git commit -m "feat(orgs): manage domains and webhooks"
```

---

### Task 5: Manage sign-in clients and the audit log

**Files:**
- Create: `lib/orgs/oidc.ts`, `lib/orgs/audit.ts`, `components/org-manage/oidc-section.tsx`, `components/org-manage/audit-section.tsx`
- Modify: `lib/orgs/manage-sections.ts`, `components/org-manage/section-components.tsx`
- Test: `e2e/org-manage-oidc-audit.spec.ts`

**Interfaces:**
- Consumes: `ManageContext`, `Panel`, `RemoteView`, `ConfirmButton`, `SecretOnce` (B1, Task 4); `orgOidcClients`, `orgAuditLog`, `orgAuditExport`, `OrgOidcClient`, `OrgOidcClientCredentials`, `OrgAuditEntry` (Task 1); `DEFAULT_OIDC_ISSUER` (`utils/oidc-issuer.ts`); `formatAbsolute` (`utils/relative-time.ts`); `shortAddress` (B1).
- Produces:
  - `lib/orgs/oidc.ts`: `parseRedirectUris(text): { uris: string[] } | { problem: string }`, `oidcIssuer(): string`.
  - `lib/orgs/audit.ts`: `auditActionText(action): string`, `auditDetailsText(details, max?): string`, `auditFileName(handle, now): string`.
  - Sections `oidc` ("Sign-in clients") and `audit` ("Audit log"), both ADMIN.

- [ ] **Step 1: Write the failing test**

Create `e2e/org-manage-oidc-audit.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { auditActionText, auditDetailsText, auditFileName } from '../lib/orgs/audit'
import { parseRedirectUris } from '../lib/orgs/oidc'
import { auditEntry, orgOidcClient } from './support/org-fixtures'
import { openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub } from './support/stub-switchboard-client'

async function answer(orgId: string, name: string, value: unknown) {
  await fixtureStub({ match: `mutation ${name}`, variables: orgId, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
}

test.describe('oidc and audit rules', () => {
  test('redirect URIs and audit wording', () => {
    expect(parseRedirectUris(' https://a.example/cb \n\nhttps://a.example/cb\nhttp://localhost:3000/cb ')).toEqual({ uris: ['https://a.example/cb', 'http://localhost:3000/cb'] })
    expect(parseRedirectUris('')).toEqual({ problem: 'Add at least one redirect URI.' })
    expect(parseRedirectUris('http://a.example/cb')).toEqual({ problem: 'http://a.example/cb: use https:// (http:// only for localhost).' })
    expect(auditActionText('inviteOrgMember')).toBe('Invited a member')
    expect(auditActionText('system.executeOrgProposal')).toBe('Ran a proposal (automatically)')
    expect(auditActionText('somethingNew')).toBe('somethingNew')
    expect(auditDetailsText('{"address":"0x0b000000000000000000000000000000000000b2","role":"MEMBER"}')).toBe('address 0x0b00…00b2, role MEMBER')
    expect(auditFileName('acme', new Date('2026-10-12T12:00:00.000Z'))).toBe('renown-acme-audit-2026-10-12.json')
  })
})

test.describe('manage: sign-in clients', () => {
  test('registers a client, shows the secret once, rotates it and edits redirect URIs', async ({ page }) => {
    const setup = await openManagePage(page, {
      role: 'ADMIN',
      section: 'oidc',
      answers: {
        OrgOidcClients: (v) => ({
          orgOidcClients: [orgOidcClient({ orgId: String(v.orgId), redirectUris: ['https://intranet.acme.example/callback', 'https://intranet.acme.example/alt'] })],
        }),
      },
    })
    await answer(setup.orgId, 'RegisterOrgOidcClient', { clientId: 'client-new', clientSecret: 'secret-shown-once-AAAAAAAA' })
    await answer(setup.orgId, 'RotateOrgOidcClientSecret', { clientId: 'client-1', clientSecret: 'secret-rotated-BBBBBBBB' })
    await answer(setup.orgId, 'UpdateOrgOidcClient', orgOidcClient({ orgId: setup.orgId }))

    await page.getByLabel('Client name').fill('Acme wiki')
    await page.getByLabel('Redirect URIs').fill('https://wiki.acme.example/callback')
    await page.getByRole('button', { name: 'Register client' }).click()
    expect(await signedWrite(setup.wallet, 'registerOrgOidcClient', setup.orgId)).toEqual({
      orgId: setup.orgId,
      name: 'Acme wiki',
      redirectUris: ['https://wiki.acme.example/callback'],
    })
    await expect(page.getByRole('region', { name: 'Client secret' })).toContainText('secret-shown-once-AAAAAAAA')
    await expect(page.getByRole('region', { name: 'Client secret' })).toContainText('client-new')

    const client = page.getByRole('list', { name: 'Sign-in clients' }).getByRole('listitem').first()
    await client.getByRole('button', { name: 'Rotate the secret of Acme intranet' }).click()
    await page.getByRole('button', { name: 'Yes, rotate it' }).click()
    expect(await signedWrite(setup.wallet, 'rotateOrgOidcClientSecret', setup.orgId)).toEqual({ orgId: setup.orgId, clientId: 'client-1' })
    await expect(page.getByRole('region', { name: 'Client secret' })).toContainText('secret-rotated-BBBBBBBB')

    await client.getByLabel('Add a redirect URI').fill('https://intranet.acme.example/other')
    await client.getByRole('button', { name: 'Add URI' }).click()
    expect(await signedWrite(setup.wallet, 'updateOrgOidcClient', setup.orgId, (v) => Array.isArray(v.addRedirectUris))).toEqual({
      orgId: setup.orgId,
      clientId: 'client-1',
      addRedirectUris: ['https://intranet.acme.example/other'],
    })
    await client.getByRole('button', { name: 'Remove https://intranet.acme.example/callback' }).click()
    expect(await signedWrite(setup.wallet, 'updateOrgOidcClient', setup.orgId, (v) => Array.isArray(v.removeRedirectUris))).toEqual({
      orgId: setup.orgId,
      clientId: 'client-1',
      removeRedirectUris: ['https://intranet.acme.example/callback'],
    })
  })
})

test.describe('manage: audit log', () => {
  test('lists entries, pages and exports JSON', async ({ page }) => {
    await openManagePage(page, {
      role: 'ADMIN',
      section: 'audit',
      answers: {
        OrgAuditLog: (v) =>
          v.after
            ? { orgAuditLog: { items: [auditEntry({ id: 'a2', action: 'system.executeOrgProposal', actor: 'system', details: '{}' })], next: null } }
            : { orgAuditLog: { items: [auditEntry({ id: 'a1' })], next: 'cursor-2' } },
        OrgAuditExport: () => ({ orgAuditExport: JSON.stringify([{ id: 'a1' }, { id: 'a2' }]) }),
      },
    })
    const table = page.getByRole('table', { name: 'Audit log' })
    await expect(table).toContainText('Invited a member')
    await expect(table).toContainText('role MEMBER')
    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(table).toContainText('Ran a proposal (automatically)')
    await expect(table).toContainText('Renown')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^renown-acme-manage-audit-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-manage-oidc-audit.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../lib/orgs/audit'`.

- [ ] **Step 3: Pure rules**

Create `lib/orgs/oidc.ts`:

```ts
// Organisation-owned sign-in (OIDC) clients (renown-package A3 ruling 6). Pure.
import { DEFAULT_OIDC_ISSUER } from '../../utils/oidc-issuer'

/** One redirect URI per line: trimmed, duplicates dropped; https, or http on localhost. */
export function parseRedirectUris(text: string): { uris: string[] } | { problem: string } {
  const uris = [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
  if (uris.length === 0) return { problem: 'Add at least one redirect URI.' }
  for (const uri of uris) {
    let parsed: URL
    try {
      parsed = new URL(uri)
    } catch {
      return { problem: `${uri}: not a full URL.` }
    }
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) return { problem: `${uri}: use https:// (http:// only for localhost).` }
  }
  return { uris }
}

/** The issuer apps configure (the deployment's, else Renown's default). */
export function oidcIssuer(): string {
  return process.env.NEXT_PUBLIC_RENOWN_OIDC_ISSUER || DEFAULT_OIDC_ISSUER
}
```

Create `lib/orgs/audit.ts`:

```ts
// The audit log as people read it. Pure.
import { shortAddress } from './format'

const ACTIONS: Record<string, string> = {
  createOrganization: 'Created the organisation',
  updateOrganization: 'Changed the profile',
  setOrgListed: 'Changed the directory listing',
  inviteOrgMember: 'Invited a member',
  respondToOrgInvite: 'Answered an invite',
  revokeOrgInvite: 'Revoked an invite',
  createOrgInviteLink: 'Created an invite link',
  revokeOrgInviteLink: 'Revoked an invite link',
  acceptOrgInviteLink: 'Joined by invite link',
  leaveOrganization: 'Left',
  removeOrgMember: 'Removed a member',
  setOrgMemberRole: 'Changed a role',
  setOrgMemberAppScope: 'Changed app access',
  setMyOrgMembershipHidden: 'Changed their visibility',
  createOrgTeam: 'Created a team',
  updateOrgTeam: 'Changed a team',
  deleteOrgTeam: 'Deleted a team',
  setOrgTeamMembers: 'Changed team members',
  proposeOrgChange: 'Made a proposal',
  approveOrgProposal: 'Approved a proposal',
  cancelOrgProposal: 'Cancelled a proposal',
  executeOrgProposal: 'Ran a proposal',
  startOrgRecovery: 'Started a recovery',
  addOrgDomain: 'Added a domain',
  checkOrgDomain: 'Checked a domain',
  removeOrgDomain: 'Removed a domain',
  proposeAppTransfer: 'Proposed an app transfer',
  acceptAppTransfer: 'Accepted an app transfer',
  declineAppTransfer: 'Declined an app transfer',
  suspendOrgCredentials: 'Suspended delegations',
  unsuspendOrgCredential: 'Lifted a suspension',
  setOrgWorkloadDisabled: 'Changed a service account',
  createOrgWebhook: 'Added a webhook',
  updateOrgWebhook: 'Changed a webhook',
  deleteOrgWebhook: 'Deleted a webhook',
  registerOrgOidcClient: 'Registered a sign-in client',
  updateOrgOidcClient: 'Changed a sign-in client',
  rotateOrgOidcClientSecret: 'Rotated a client secret',
  resolveOrgReport: 'Moderation',
  attestRelease: 'Signed off a release',
}

/** "Invited a member"; "system.<action>" reads "<action text> (automatically)"; unknown actions as they are. */
export function auditActionText(action: string): string {
  const system = action.startsWith('system.')
  const key = system ? action.slice('system.'.length) : action
  const text = Object.hasOwn(ACTIONS, key) ? ACTIONS[key] : null
  if (!text) return action
  return system ? `${text} (automatically)` : text
}

function valueText(value: unknown): string {
  if (typeof value === 'string') return /^0x[0-9a-fA-F]{40}$/.test(value) ? shortAddress(value.toLowerCase()) : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'none'
  return JSON.stringify(value)
}

/** The details object as "key value, key value", clipped to `max` characters. */
export function auditDetailsText(details: string, max = 160): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(details)
  } catch {
    return details.slice(0, max)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return valueText(parsed).slice(0, max)
  const text = Object.entries(parsed as Record<string, unknown>)
    .map(([key, value]) => `${key} ${valueText(value)}`)
    .join(', ')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function auditFileName(handle: string, now: Date): string {
  return `renown-${handle}-audit-${now.toISOString().slice(0, 10)}.json`
}
```

- [ ] **Step 4: The sign-in clients section**

Create `components/org-manage/oidc-section.tsx`:

```tsx
import { useCallback, useState, type FormEvent } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { oidcIssuer, parseRedirectUris } from '../../lib/orgs/oidc'
import { orgOidcClients, type OrgOidcClient, type OrgOidcClientCredentials } from '../../services/org-security'
import { Field, inputClass } from '../profile-edit/field'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext, ManageSectionProps } from './manage-context'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'
import { SecretOnce } from './secret-once'

function ClientRow({ ctx, client, onChange, onSecret }: { ctx: ManageContext; client: OrgOidcClient; onChange: () => void; onSecret: (c: OrgOidcClientCredentials) => void }) {
  const [uri, setUri] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function update(args: Record<string, unknown>, success: string) {
    setBusy(true)
    const done = await ctx.run<OrgOidcClient>('updateOrgOidcClient', { orgId: ctx.org.id, clientId: client.clientId, ...args }, success)
    setBusy(false)
    if (done) onChange()
    return done !== null
  }

  async function addUri(event: FormEvent) {
    event.preventDefault()
    const parsed = parseRedirectUris(uri)
    if ('problem' in parsed) {
      setProblem(parsed.problem)
      return
    }
    if (await update({ addRedirectUris: parsed.uris }, 'Redirect URI added.')) setUri('')
  }

  async function rotate() {
    setBusy(true)
    const done = await ctx.run<OrgOidcClientCredentials>('rotateOrgOidcClientSecret', { orgId: ctx.org.id, clientId: client.clientId }, 'New secret created. The old one no longer works.')
    setBusy(false)
    if (done) onSecret(done)
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink font-semibold break-words">{client.name}</p>
          <p className="text-ink-muted font-mono text-xs break-all">{client.clientId}</p>
        </div>
        {client.status === 'DISABLED' && <Badge>Disabled</Badge>}
      </div>
      <ul aria-label={`Redirect URIs of ${client.name}`} className="mt-3 space-y-1">
        {client.redirectUris.map((value) => (
          <li key={value} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink font-mono text-xs break-all">{value}</span>
            {client.redirectUris.length > 1 && (
              <button type="button" disabled={busy} onClick={() => void update({ removeRedirectUris: [value] }, 'Redirect URI removed.')} aria-label={`Remove ${value}`} className={buttonClasses('ghost', 'md')}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void addUri(event)} noValidate className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <Field id={`uri-${client.clientId}`} label="Add a redirect URI" error={problem ?? undefined}>
            <input
              id={`uri-${client.clientId}`}
              className={inputClass}
              value={uri}
              onChange={(e) => {
                setUri(e.target.value)
                setProblem(null)
              }}
              placeholder="https://"
            />
          </Field>
        </div>
        <button type="submit" disabled={busy} className={buttonClasses('secondary', 'md', 'sm:mt-[1.625rem]')}>
          Add URI
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        <ConfirmButton label={`Rotate the secret of ${client.name}`} confirm="Yes, rotate it" busy={busy} onConfirm={() => void rotate()} />
        <button
          type="button"
          disabled={busy}
          onClick={() => void update({ status: client.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }, client.status === 'ACTIVE' ? 'Client disabled.' : 'Client enabled.')}
          className={buttonClasses('ghost', 'md')}
        >
          {client.status === 'ACTIVE' ? 'Disable' : 'Enable'}
        </button>
      </div>
    </li>
  )
}

export function OidcSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const load = useCallback(async () => orgOidcClients(org.id, await getBearer()), [org.id, getBearer])
  const clients = useRemote(`oidc:${org.id}`, load)
  const [name, setName] = useState('')
  const [uris, setUris] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [secret, setSecret] = useState<OrgOidcClientCredentials | null>(null)
  const [busy, setBusy] = useState(false)

  async function register(event: FormEvent) {
    event.preventDefault()
    const parsed = parseRedirectUris(uris)
    if (!name.trim()) {
      setProblem('Give the client a name.')
      return
    }
    if ('problem' in parsed) {
      setProblem(parsed.problem)
      return
    }
    setBusy(true)
    const done = await ctx.run<OrgOidcClientCredentials>('registerOrgOidcClient', { orgId: org.id, name: name.trim(), redirectUris: parsed.uris }, 'Client registered.')
    setBusy(false)
    if (done) {
      setSecret(done)
      setName('')
      setUris('')
      clients.reload()
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <Panel
        id="register-client-title"
        title="Register a sign-in client"
        description={`An app of your own that signs people in with Renown, open only to members of ${org.name}. Issuer: ${oidcIssuer()}`}
      >
        <form onSubmit={(event) => void register(event)} noValidate className="space-y-4">
          <Field id="client-name" label="Client name">
            <input id="client-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="client-uris" label="Redirect URIs" error={problem ?? undefined} hint="One per line.">
            <textarea id="client-uris" rows={3} className={inputClass} value={uris} onChange={(e) => setUris(e.target.value)} />
          </Field>
          <button type="submit" disabled={busy} className={buttonClasses('primary', 'md')}>
            Register client
          </button>
        </form>
        {secret && (
          <SecretOnce label="Client secret" value={secret.clientSecret}>
            <p className="text-ink-muted mt-3 text-xs">
              Client id <span className="text-ink font-mono break-all">{secret.clientId}</span>
            </p>
          </SecretOnce>
        )}
      </Panel>
      <Panel id="clients-title" title="Sign-in clients">
        <RemoteView remote={clients.state} what="sign-in clients" onRetry={clients.reload}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">No sign-in clients yet.</p>
            ) : (
              <ul aria-label="Sign-in clients" className="divide-hairline divide-y">
                {list.map((client) => (
                  <ClientRow key={client.clientId} ctx={ctx} client={client} onChange={clients.reload} onSecret={setSecret} />
                ))}
              </ul>
            )
          }
        </RemoteView>
      </Panel>
    </div>
  )
}
```

- [ ] **Step 5: The audit section**

Create `components/org-manage/audit-section.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { auditActionText, auditDetailsText, auditFileName } from '../../lib/orgs/audit'
import { shortAddress } from '../../lib/orgs/format'
import { orgAuditExport, orgAuditLog, type OrgAuditEntry } from '../../services/org-security'
import { formatAbsolute } from '../../utils/relative-time'
import { buttonClasses } from '../site/primitives'
import type { ManageSectionProps } from './manage-context'
import { Panel } from './manage-ui'

interface Log {
  items: OrgAuditEntry[]
  next: string | null
  status: 'loading' | 'ready' | 'error'
  more: 'idle' | 'loading' | 'error'
}

export function AuditSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const [log, setLog] = useState<Log>({ items: [], next: null, status: 'loading', more: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getBearer()
      .then((bearer) => orgAuditLog(org.id, null, bearer))
      .then(
        (page) => {
          if (!cancelled) setLog({ items: page.items, next: page.next, status: 'ready', more: 'idle' })
        },
        () => {
          if (!cancelled) setLog((l) => ({ ...l, status: 'error' }))
        },
      )
    return () => {
      cancelled = true
    }
  }, [org.id, getBearer, attempt])

  const loadMore = useCallback(async () => {
    if (!log.next) return
    const after = log.next
    setLog((l) => ({ ...l, more: 'loading' }))
    try {
      const page = await orgAuditLog(org.id, after, await getBearer())
      setLog((l) => ({ ...l, items: [...l.items, ...page.items.filter((e) => !l.items.some((o) => o.id === e.id))], next: page.next, more: 'idle' }))
    } catch {
      setLog((l) => ({ ...l, more: 'error' }))
    }
  }, [log.next, org.id, getBearer])

  async function exportJson() {
    setExporting(true)
    try {
      const json = await orgAuditExport(org.id, await getBearer())
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = auditFileName(org.handle, new Date())
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      ctx.notify('error', 'The export did not download. Try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mt-6">
      <Panel
        id="audit-title"
        title="Audit log"
        description="Every change to the organisation, by whom and when. Only admins and owners see it."
        actions={
          <button type="button" disabled={exporting} onClick={() => void exportJson()} className={buttonClasses('secondary', 'md')}>
            {exporting ? 'Exporting…' : 'Export JSON'}
          </button>
        }
      >
        {log.status === 'loading' && (
          <p role="status" className="text-ink-muted text-sm">
            Loading the audit log…
          </p>
        )}
        {log.status === 'error' && (
          <div role="alert" className="text-sm">
            <p className="text-ink">The audit log did not load.</p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={buttonClasses('secondary', 'md', 'mt-3')}>
              Try again
            </button>
          </div>
        )}
        {log.status === 'ready' &&
          (log.items.length === 0 ? (
            <p className="text-ink-muted text-sm">Nothing logged yet.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
              <table aria-label="Audit log" className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-ink-muted text-xs">
                  <tr>
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Who</th>
                    <th className="py-2 pr-4 font-medium">What</th>
                    <th className="py-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-hairline divide-y">
                  {log.items.map((entry) => (
                    <tr key={entry.id} className="align-top">
                      <td className="text-ink-muted py-2 pr-4 whitespace-nowrap">
                        <time dateTime={entry.at}>{formatAbsolute(entry.at)}</time>
                      </td>
                      <td className="text-ink py-2 pr-4 font-mono text-xs whitespace-nowrap">{entry.actor === 'system' ? 'Renown' : shortAddress(entry.actor)}</td>
                      <td className="text-ink py-2 pr-4">{auditActionText(entry.action)}</td>
                      <td className="text-ink-muted py-2 break-words">{auditDetailsText(entry.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {log.next && (
          <div className="mt-4">
            <button type="button" aria-disabled={log.more === 'loading'} onClick={() => void loadMore()} className={buttonClasses('secondary', 'md')}>
              {log.more === 'loading' ? 'Loading…' : 'Load more'}
            </button>
            {log.more === 'error' && (
              <p role="alert" className="text-ink-muted mt-2 text-sm">
                More entries didn&apos;t load. Select the button to try again.
              </p>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}
```

(The table scrolls inside its panel on phones; the page itself never scrolls sideways.)

- [ ] **Step 6: Register the sections**

In `lib/orgs/manage-sections.ts`, add after `webhooks`:

```ts
  { key: 'oidc', label: 'Sign-in clients', minRole: 'ADMIN' },
  { key: 'audit', label: 'Audit log', minRole: 'ADMIN' },
```

so the final list reads members, teams, apps, security, domains, webhooks, oidc, audit, settings. In `components/org-manage/section-components.tsx`, import `OidcSection` and `AuditSection` and add `oidc: OidcSection,` and `audit: AuditSection,`.

- [ ] **Step 7: Run the specs**

Run: `pnpm exec playwright test e2e/org-manage-oidc-audit.spec.ts e2e/org-manage-members.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 8: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean.

```bash
git add lib/orgs/oidc.ts lib/orgs/audit.ts components/org-manage lib/orgs/manage-sections.ts e2e/org-manage-oidc-audit.spec.ts
git commit -m "feat(orgs): manage sign-in clients and the audit log"
```

---

### Task 6: App page provenance and `/apps?org=`

**Files:**
- Create: `lib/apps/contacts.ts`, `components/app-page/org-publisher-card.tsx`, `components/app-page/app-contacts.tsx`, `components/app-page/frozen-banner.tsx`, `components/apps/org-filter-chip.tsx`
- Modify: `services/app-profiles.ts` (`fetchAppProvenance`), `lib/json-ld.ts` (publisher type), `pages/app/[did].tsx`, `utils/app-directory.ts` (`parseOrgParam`), `components/apps/use-app-directory.ts` (`orgId`), `pages/apps.tsx`
- Test: `e2e/app-provenance.spec.ts`

**Interfaces:**
- Consumes: `fetchOrganization`, `OrgSummary`, `OrgRole` (B1); `releaseAttestations` (Task 1); `OrgAvatar`, `OrgVerification` (B1 Task 3); `orgPath`, `roleLabel`, `shortAddress` (B1); `ORG_HANDLE_RE` (B1); `formatDay` (`lib/verify/format.ts`); `profileDisplayName` (`lib/profile-identity.ts`), `profilePath`; `listAppProfiles({ orgId })` (B1).
- Produces:
  - `services/app-profiles.ts`: `interface AppPublisherOrg { id; did; handle; name; verifiedDomains }`, `interface AppProvenance { frozen: boolean; supportContact: string | null; securityContact: string | null; publisherOrg: AppPublisherOrg | null }`, `fetchAppProvenance(appDid): Promise<AppProvenance | null>` (query `AppProvenance`, throws on failure).
  - `lib/apps/contacts.ts`: `contactLink(value): { href: string; label: string } | null`.
  - `interface ReleaseSignOff { version; issuedAt; signerName; signerHref; signerRole: OrgRole | null; stillMember: boolean }`, `OrgPublisherCard({ org, signOff })`, `AppContacts({ support, security })`, `FrozenBanner({ org })`.
  - `utils/app-directory.ts`: `parseOrgParam(value): string | null`.
  - `useAppDirectory(initial, category, orgId?: string | null)`.
  - `OrgFilterChip({ handle, name })`.

- [ ] **Step 1: Write the failing test**

Create `e2e/app-provenance.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { contactLink } from '../lib/apps/contacts'
import { parseOrgParam } from '../utils/app-directory'
import { appProfile, organization, releaseAttestation } from './support/org-fixtures'
import { fixtureStub, graphqlError } from './support/stub-switchboard-client'

const ORG_ID = 'a0c0ffee-0000-4000-8000-00000000e001'
const ORG_DID = `did:web:www.renown.id:org:${ORG_ID}`
const DID = 'did:key:z6MkProvenanceAppPxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const DID_OLD = 'did:key:z6MkProvenanceAppQxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2'
const SIGNER = '0x0e000000000000000000000000000000000000e7'
const PUBLISHER_ORG = { id: ORG_ID, did: ORG_DID, handle: 'acme-prov', name: 'Acme Provenance', verifiedDomains: ['acme-prov.example'] }

test.beforeAll(async () => {
  for (const did of [DID, DID_OLD]) {
    await fixtureStub({ match: 'query AppProfile(', variables: did, response: { data: { appProfile: appProfile({ appDid: did, name: did === DID ? 'Provenance Ledger' : 'Older Switchboard App', publisherDid: ORG_DID }) } } })
  }
  await fixtureStub({
    match: 'query AppProvenance',
    variables: DID,
    response: { data: { appProfile: { frozen: true, supportContact: 'support@acme-prov.example', securityContact: 'https://acme-prov.example/security', publisherOrg: PUBLISHER_ORG } } },
  })
  await fixtureStub({ match: 'query AppProvenance', variables: DID_OLD, response: graphqlError('Cannot query field "frozen" on type "AppProfile".') })
  await fixtureStub({ match: 'query OrgByRef', variables: `"id":"${ORG_ID}"`, response: { data: { organization: organization({ ...PUBLISHER_ORG }) } } })
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-prov"', response: { data: { organization: organization({ ...PUBLISHER_ORG }) } } })
  await fixtureStub({
    match: 'query ReleaseAttestations',
    variables: DID,
    response: { data: { releaseAttestations: { items: [releaseAttestation({ appDid: DID, version: '1.4.0', signer: SIGNER, signerRole: 'PUBLISHER', issuedAt: '2026-10-03T10:00:00.000Z' })], next: null } } },
  })
  await fixtureStub({
    match: 'renownUsers',
    variables: SIGNER,
    response: { data: { renownUsers: [{ documentId: 'doc-signer', username: null, ethAddress: SIGNER, userImage: null, displayName: 'Alice Signer', handle: 'alice-signer', bio: null, links: [], avatar: null, createdAt: null, updatedAt: null }] } },
  })
  await fixtureStub({ match: 'query AppProfilesByOrg', variables: ORG_ID, response: { data: { appProfiles: { items: [appProfile({ appDid: DID, name: 'Provenance Ledger' })], next: null } } } })
})

test.describe('contacts and filters', () => {
  test('contacts are an email or an https URL, nothing else', () => {
    expect(contactLink('security@acme.example')).toEqual({ href: 'mailto:security@acme.example', label: 'security@acme.example' })
    expect(contactLink('mailto:help@acme.example')).toEqual({ href: 'mailto:help@acme.example', label: 'help@acme.example' })
    expect(contactLink('https://acme.example/support')).toEqual({ href: 'https://acme.example/support', label: 'acme.example/support' })
    expect(contactLink('http://acme.example')).toBeNull()
    expect(contactLink('javascript:alert(1)')).toBeNull()
    expect(contactLink(null)).toBeNull()
    expect(parseOrgParam(' @Acme-Prov ')).toBe('acme-prov')
    expect(parseOrgParam('no')).toBeNull()
  })
})

test.describe('app page provenance', () => {
  test('shows the publishing organisation, the latest sign-off, contacts and the freeze', async ({ page }) => {
    await page.goto(`/app/${DID}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Provenance Ledger' })).toBeVisible()
    const publisher = page.getByRole('region', { name: 'Publisher' })
    await expect(publisher.getByRole('link', { name: /Acme Provenance/ })).toHaveAttribute('href', '/@acme-prov')
    await expect(publisher.getByText('Verified: acme-prov.example')).toBeVisible()
    await expect(publisher).toContainText('Release 1.4.0 signed off by Alice Signer (Publisher) on 3 October 2026.')
    await expect(page.getByRole('status').filter({ hasText: 'Frozen by' })).toContainText('Frozen by Acme Provenance.')
    const contact = page.getByRole('region', { name: 'Contact' })
    await expect(contact.getByRole('link', { name: 'support@acme-prov.example' })).toHaveAttribute('href', 'mailto:support@acme-prov.example')
    await expect(contact.getByRole('link', { name: 'acme-prov.example/security' })).toHaveAttribute('href', 'https://acme-prov.example/security')
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}')
    expect(ld.publisher).toMatchObject({ '@type': 'Organization', name: 'Acme Provenance' })
  })

  test('still renders when provenance cannot be read', async ({ page }) => {
    const res = await page.goto(`/app/${DID_OLD}`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Older Switchboard App' })).toBeVisible()
    await expect(page.getByText('Frozen by')).toHaveCount(0)
  })
})

test.describe('/apps?org=', () => {
  test('lists one organisation’s apps behind a clearable chip', async ({ page }) => {
    await page.goto('/apps?org=acme-prov')
    await expect(page.getByText('Published by Acme Provenance')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Provenance Ledger' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Show all apps' }).first()).toHaveAttribute('href', '/apps')
    await expect(page.getByRole('navigation', { name: 'App categories' })).toHaveCount(0)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  test('says when no organisation has the handle', async ({ page }) => {
    await page.goto('/apps?org=nobody-here')
    await expect(page.getByText('No organisation has the handle @nobody-here.')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/app-provenance.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../lib/apps/contacts'`.

- [ ] **Step 3: Data and pure helpers**

In `services/app-profiles.ts`, append:

```ts
export interface AppPublisherOrg {
  id: string
  did: string
  handle: string
  name: string
  verifiedDomains: string[]
}

/** What renown-package A2/A3 added to app profiles: the publishing organisation, a freeze, contacts. */
export interface AppProvenance {
  frozen: boolean
  supportContact: string | null
  securityContact: string | null
  publisherOrg: AppPublisherOrg | null
}

/**
 * The provenance of an app, in its own query so a switchboard that predates
 * these fields fails only this read. Throws on failure.
 */
export async function fetchAppProvenance(appDid: string): Promise<AppProvenance | null> {
  const data = await client().request<{ appProfile: AppProvenance | null }>(
    `query AppProvenance($appDid: String!) { appProfile(appDid: $appDid) { frozen supportContact securityContact publisherOrg { id did handle name verifiedDomains } } }`,
    { appDid },
  )
  return data.appProfile
}
```

Create `lib/apps/contacts.ts`:

```ts
// App support and security contacts (renown-package A3 ruling 9): an email
// address or an https URL, at most 200 characters. Anything else is not shown. Pure.

const EMAIL_RE = /^[^\s@<>()"]+@[^\s@<>()"]+\.[^\s@<>()"]+$/

export function contactLink(value: string | null | undefined): { href: string; label: string } | null {
  const text = value?.trim()
  if (!text || text.length > 200) return null
  const bare = text.replace(/^mailto:/i, '')
  if (EMAIL_RE.test(bare)) return { href: `mailto:${bare}`, label: bare }
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return { href: url.toString(), label: `${url.host}${url.pathname === '/' ? '' : url.pathname}` }
  } catch {
    return null
  }
}
```

In `utils/app-directory.ts`, add `import { ORG_HANDLE_RE } from '../lib/orgs/handles'` and:

```ts
/** The `?org=` handle filter: the first value, trimmed, "@" dropped, lowercased; null when it is not a handle. */
export function parseOrgParam(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const handle = (raw ?? '').trim().replace(/^@/, '').toLowerCase()
  return ORG_HANDLE_RE.test(handle) ? handle : null
}
```

In `lib/json-ld.ts`, change `AppJsonLdInput.publisher` to `{ name: string; url: string; type?: 'Person' | 'Organization' } | null` and the publisher line of `appJsonLd` to:

```ts
    ...(publisher && { publisher: { '@type': publisher.type ?? 'Person', name: publisher.name, url: publisher.url } }),
```

- [ ] **Step 4: App page components**

Create `components/app-page/org-publisher-card.tsx`:

```tsx
import Link from 'next/link'
import { orgPath, roleLabel } from '../../lib/orgs/format'
import { formatDay } from '../../lib/verify/format'
import type { OrgRole, OrgSummary } from '../../services/orgs'
import { PageSection } from '../identity/page-section'
import { OrgAvatar } from '../org/org-avatar'
import { OrgVerification } from '../org/org-verification'

export interface ReleaseSignOff {
  version: string
  issuedAt: string
  signerName: string
  signerHref: string
  signerRole: OrgRole | null
  stillMember: boolean
}

/** The organisation that publishes the app, and who signed off its latest release. */
export function OrgPublisherCard({ org, signOff }: { org: OrgSummary; signOff: ReleaseSignOff | null }) {
  return (
    <PageSection id="app-publisher" title="Publisher">
      <div className="border-hairline bg-surface-1 rounded-card border p-4">
        <Link href={orgPath(org.handle)} className="group flex items-center gap-3">
          <OrgAvatar org={org} className="h-12 w-12" />
          <span className="min-w-0">
            <span className="text-ink block truncate font-semibold group-hover:underline">{org.name}</span>
            <span className="text-ink-muted block truncate text-sm">@{org.handle}</span>
          </span>
        </Link>
        <div className="mt-3 flex flex-wrap gap-2">
          <OrgVerification verifiedDomains={org.verifiedDomains} />
        </div>
        {signOff && (
          <p className="text-ink-muted mt-3 text-sm leading-6">
            Release {signOff.version} signed off by{' '}
            <Link href={signOff.signerHref} className="text-ink font-semibold hover:underline">
              {signOff.signerName}
            </Link>
            {signOff.signerRole ? ` (${roleLabel(signOff.signerRole)})` : ''} on {formatDay(signOff.issuedAt)}.
            {signOff.stillMember ? '' : ' They are no longer a member.'}
          </p>
        )}
      </div>
    </PageSection>
  )
}
```

Create `components/app-page/app-contacts.tsx`:

```tsx
import { PageSection } from '../identity/page-section'

type Contact = { href: string; label: string }

function Row({ term, contact }: { term: string; contact: Contact }) {
  const mail = contact.href.startsWith('mailto:')
  return (
    <div>
      <dt className="text-ink-muted text-xs font-medium">{term}</dt>
      <dd>
        <a href={contact.href} target={mail ? undefined : '_blank'} rel="nofollow noopener noreferrer" className="text-primary-ink text-sm font-semibold break-all underline-offset-4 hover:underline">
          {contact.label}
        </a>
      </dd>
    </div>
  )
}

/** Where to ask for help and where to report a security problem, as the publisher states them. */
export function AppContacts({ support, security }: { support: Contact | null; security: Contact | null }) {
  return (
    <PageSection id="app-contacts" title="Contact">
      <dl className="space-y-3">
        {support && <Row term="Support" contact={support} />}
        {security && <Row term="Security" contact={security} />}
      </dl>
    </PageSection>
  )
}
```

Create `components/app-page/frozen-banner.tsx`:

```tsx
import Link from 'next/link'
import { orgPath } from '../../lib/orgs/format'
import type { OrgSummary } from '../../services/orgs'

/** An app its organisation froze (spec 3.6): it cannot act for anyone until unfrozen. */
export function FrozenBanner({ org }: { org: OrgSummary | null }) {
  return (
    <p role="status" className="border-caution-ink/35 bg-caution-ink/[0.07] text-ink rounded-card mt-6 border px-4 py-3 text-sm leading-6 sm:mx-8">
      <strong className="font-semibold">
        Frozen by{' '}
        {org ? (
          <Link href={orgPath(org.handle)} className="underline underline-offset-4">
            {org.name}
          </Link>
        ) : (
          'its organisation'
        )}
        .
      </strong>{' '}
      Keys it authorised do not count, and it cannot sign anyone in, until it is unfrozen.
    </p>
  )
}
```

- [ ] **Step 5: Wire the app page**

In `pages/app/[did].tsx`:

- add imports:

```tsx
import { AppContacts } from '../../components/app-page/app-contacts'
import { FrozenBanner } from '../../components/app-page/frozen-banner'
import { OrgPublisherCard, type ReleaseSignOff } from '../../components/app-page/org-publisher-card'
import { contactLink } from '../../lib/apps/contacts'
import { orgPath, shortAddress } from '../../lib/orgs/format'
import { profileDisplayName } from '../../lib/profile-identity'
import { fetchAppProvenance, type AppProvenance } from '../../services/app-profiles'
import { releaseAttestations } from '../../services/org-security'
import { fetchOrganization, type OrgSummary } from '../../services/orgs'
```

(`fetchAppProvenance` joins the existing `services/app-profiles` import line instead of a second one.)

- add to `AppPageProps`:

```tsx
  /** Organisation, freeze and contacts; null when they could not be read. */
  provenance: AppProvenance | null
  /** The publishing organisation (with its avatar when it could be read). */
  orgPublisher: OrgSummary | null
  /** The latest release attestation, for the publisher card. */
  signOff: ReleaseSignOff | null
```

- add `provenance, orgPublisher, signOff` to the component's destructuring;

- replace

```tsx
  const pubName = publisherAddress ? publisherName(publisher, publisherAddress) : null
  const publisherLd =
    publisherAddress && pubName ? { name: pubName, url: `${origin}${publisher ? profilePath(publisher) : `/profile/${publisherAddress}`}` } : null
```

with

```tsx
  const pubName = orgPublisher ? orgPublisher.name : publisherAddress ? publisherName(publisher, publisherAddress) : null
  const publisherLd = orgPublisher
    ? { name: orgPublisher.name, url: `${origin}${orgPath(orgPublisher.handle)}`, type: 'Organization' as const }
    : publisherAddress && pubName
      ? { name: pubName, url: `${origin}${publisher ? profilePath(publisher) : `/profile/${publisherAddress}`}` }
      : null
  const support = contactLink(provenance?.supportContact)
  const security = contactLink(provenance?.securityContact)
```

- replace the `sideSections` constant with:

```tsx
  const sideSections = (
    <>
      {orgPublisher && <OrgPublisherCard org={orgPublisher} signOff={signOff} />}
      {!orgPublisher && publisherAddress && publisherArt && <PublisherCard publisher={publisher} address={publisherAddress} art={publisherArt} />}
      {pubName && <MoreByPublisher apps={moreByPublisher} name={pubName} />}
      {(support || security) && <AppContacts support={support} security={security} />}
      <AppIdentityPanel appDid={app.appDid} />
    </>
  )
```

- after `<AppHero app={app} name={name} art={art} website={website} shareUrl={url} qr={qr} />` add:

```tsx
        {provenance?.frozen && <FrozenBanner org={orgPublisher} />}
```

- in `getServerSideProps`, add `provenance: null, orgPublisher: null, signOff: null,` to `empty`, and replace everything from `const publisherAddress = PKH_RE…` up to (not including) `const origin = siteOrigin(context.req.headers.host)` with:

```tsx
  const publisherAddress = PKH_RE.exec(app.publisherDid ?? '')?.[1]?.toLowerCase() ?? null
  const others = (apps: RenownAppProfile[]) => apps.filter((other) => other.appDid !== app.appDid)
  // Organisation provenance has its own query: a switchboard without it loses only this part.
  const provenance = await optional(fetchAppProvenance(did), null)
  const publisherOrg = provenance?.publisherOrg ?? null
  const [publisher, stats, byPublisher, inCategory, org, latest] = await Promise.all([
    publisherAddress ? optional(getProfile({ driveId: `renown-${publisherAddress}`, ethAddress: publisherAddress }), null) : Promise.resolve(null),
    optional(getAppStats(did), null),
    publisherAddress
      ? optional(getAppProfilesByPublisher(publisherAddress), [])
      : publisherOrg
        ? optional(getAppProfilesByPublisher(publisherOrg.did), [])
        : Promise.resolve([]),
    app.category ? optional(listAppProfiles({ limit: 4, category: app.category }).then((page) => page.items), []) : Promise.resolve([]),
    publisherOrg ? optional(fetchOrganization({ id: publisherOrg.id }), null) : Promise.resolve(null),
    publisherOrg ? optional(releaseAttestations(did, 1).then((page) => page.items[0] ?? null), null) : Promise.resolve(null),
  ])
  const signerAddress = latest?.signer.toLowerCase() ?? null
  const signer = signerAddress ? await optional(getProfile({ driveId: `renown-${signerAddress}`, ethAddress: signerAddress }), null) : null
  const orgPublisher: OrgSummary | null = org
    ? { id: org.id, did: org.did, handle: org.handle, name: org.name, avatar: org.avatar, verifiedDomains: org.verifiedDomains }
    : publisherOrg
      ? { ...publisherOrg, avatar: null }
      : null
  const signOff: ReleaseSignOff | null =
    latest && signerAddress
      ? {
          version: latest.version,
          issuedAt: latest.issuedAt,
          signerName: signer ? profileDisplayName(signer) : shortAddress(signerAddress),
          signerHref: signer ? profilePath(signer) : `/profile/${signerAddress}`,
          signerRole: latest.signerRole,
          stillMember: latest.signerStillMember,
        }
      : null
```

and add `provenance, orgPublisher, signOff,` to the returned props.

- [ ] **Step 6: `/apps?org=`**

Create `components/apps/org-filter-chip.tsx`:

```tsx
import Link from 'next/link'
import { orgPath } from '../../lib/orgs/format'

/** The active organisation filter of /apps, with a way back to every app. */
export function OrgFilterChip({ handle, name }: { handle: string; name: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="bg-primary-strong text-primary-foreground inline-flex h-9 max-w-full items-center rounded-full px-4 text-sm font-medium">
        <span className="truncate">Published by {name ?? `@${handle}`}</span>
      </span>
      {name && (
        <Link href={orgPath(handle)} className="text-primary-ink text-sm font-semibold underline-offset-4 hover:underline">
          About {name}
        </Link>
      )}
      <Link href="/apps" className="text-primary-ink text-sm font-semibold underline-offset-4 hover:underline">
        Show all apps
      </Link>
    </div>
  )
}
```

In `components/apps/use-app-directory.ts`:

- change the signature to `export function useAppDirectory(initial: { category: string | null; page: AppProfilePage | null }, category: string | null, orgId: string | null = null): AppDirectory`;
- in `fetchFirst`, replace `listAppProfiles({ limit: APPS_PAGE_SIZE, category: target })` with `listAppProfiles({ limit: APPS_PAGE_SIZE, category: target, orgId })` and its dependency list `[]` with `[orgId]`;
- in `loadMore`, replace `listAppProfiles({ limit: APPS_PAGE_SIZE, after: next, category: target })` with `listAppProfiles({ limit: APPS_PAGE_SIZE, after: next, category: target, orgId })` and add `orgId` to its dependency list.

In `pages/apps.tsx`:

- add imports: `import { OrgFilterChip } from '../components/apps/org-filter-chip'`, `import { fetchOrganization } from '../services/orgs'`, and `parseOrgParam` to the `../utils/app-directory` import;
- add to `AppsPageProps`:

```tsx
  /** The ?org= filter: its handle, and the organisation's id and name (null when no organisation has the handle). */
  org: { handle: string; id: string | null; name: string | null } | null
```

- add `org` to the component's destructuring and replace `useAppDirectory({ category: initialCategory, page }, category)` with `useAppDirectory({ category: initialCategory, page }, category, org?.id ?? null)`;
- replace the `PageMeta` line with `<PageMeta title="Apps" description={DESCRIPTION} path="/apps" noindex={org !== null} preloadImage={coverImageUrl(page?.items[0])} />`;
- replace `<CategoryChips categories={categories} selected={category} />` with:

```tsx
        {org ? <OrgFilterChip handle={org.handle} name={org.name} /> : <CategoryChips categories={categories} selected={category} />}
```

- replace the `EmptyDirectory` branch `) : state.items.length === 0 ? (\n            <EmptyDirectory filtered={state.category !== null} />` with:

```tsx
          ) : org && !org.id ? (
            <p role="status" className="text-ink-muted border-hairline-strong rounded-panel border border-dashed px-6 py-16 text-center">
              No organisation has the handle @{org.handle}.
            </p>
          ) : state.items.length === 0 ? (
            <EmptyDirectory filtered={state.category !== null || org !== null} />
```

- replace `getServerSideProps` with:

```tsx
export const getServerSideProps: GetServerSideProps<AppsPageProps> = async ({ query, res }) => {
  const category = parseCategory(query['category'])
  const orgHandle = parseOrgParam(query['org'])
  let org: AppsPageProps['org'] = null
  let orgFailed = false
  if (orgHandle) {
    const found = await withTimeout(fetchOrganization({ handle: orgHandle }), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
      console.error('Apps directory: organisation unavailable:', error instanceof Error ? error.message : error)
      orgFailed = true
      return null
    })
    org = { handle: orgHandle, id: found?.id ?? null, name: found?.name ?? null }
  }
  const pageRead: Promise<AppProfilePage> = !orgHandle
    ? listAppProfiles({ limit: APPS_PAGE_SIZE, category })
    : org?.id
      ? listAppProfiles({ limit: APPS_PAGE_SIZE, category, orgId: org.id })
      : orgFailed
        ? Promise.reject(new Error('organisation unavailable'))
        : Promise.resolve({ items: [], next: null })
  let categoriesFailed = false
  const [page, categories] = await Promise.all([
    withTimeout(pageRead, SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
      console.error('Apps directory unavailable:', error)
      return null
    }),
    withTimeout(listAppCategories(), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
      console.error('Apps directory: categories unavailable:', error)
      categoriesFailed = true
      return []
    }),
  ])
  // An outage (or a page missing its chips) must not be cached at the edge: the next visitor retries.
  res.setHeader('Cache-Control', listingCacheControl(page !== null && !categoriesFailed && !orgFailed))
  return { props: { category, page, categories, org } }
}
```

- [ ] **Step 7: Run the specs**

Run: `pnpm exec playwright test e2e/app-provenance.spec.ts e2e/app-page.spec.ts e2e/apps.spec.ts e2e/org-page.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS (existing app page and directory specs unchanged: without `?org=` and without provenance the pages render as before).

- [ ] **Step 8: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed" (`/app/[did]` and `/apps` stay free of wallet code).

```bash
git add lib/apps services/app-profiles.ts lib/json-ld.ts components/app-page components/apps "pages/app/[did].tsx" pages/apps.tsx utils/app-directory.ts e2e/app-provenance.spec.ts
git commit -m "feat(orgs): organisation publishers on app pages and /apps?org"
```

---

### Task 7: `/verify` — organisation rules, the publishing organisation, release attestations

**Files:**
- Create: `lib/verify/org-lookups.ts`, `lib/verify/org-rules.ts`, `lib/verify/attestation.ts`
- Modify: `lib/verify/types.ts`, `lib/verify/detect.ts`, `lib/verify/lookups.ts` (export `graphql`), `lib/verify/parties.ts` (`appParty` `orgs`), `lib/verify/credential.ts`, `lib/verify/token.ts`, `lib/verify/operation.ts`, `lib/verify/run.ts`, `components/verify/party-cards.tsx`
- Test: `e2e/verify-orgs.spec.ts`

**Interfaces:**
- Consumes: the existing `/verify` modules (`VerifyDeps`, `Report`, `Check`, `signerParty`, `appParty`, `format.ts`), viem `recoverTypedDataAddress` (dynamic import), `verify-fixtures.ts` (`makeCredential`, `makeWallet`).
- Produces:
  - `lib/verify/types.ts`: `InputKind` gains `'release-attestation'`; `AppParty.publisherOrg?: AppPublisherOrgRef | null`; `AppPublisherOrgRef`, `OrgCredentialReason`, `OrgCredentialVerdict`, `StoredAttestation`, `OrgLookups { credentialStatus; appPublisherOrg; releaseAttestations }`; `VerifyDeps.orgs?: OrgLookups`.
  - `lib/verify/org-lookups.ts`: `switchboardOrgLookups(endpoint?): OrgLookups` (queries `VerifyOrgCredential`, `VerifyAppPublisherOrg`, `VerifyReleaseAttestations`).
  - `lib/verify/org-rules.ts`: `orgRulesCheck(orgs, credentialId, issuer, orgName): Promise<Check | null>`, `withOrgRules(report, check): Report`.
  - `lib/verify/attestation.ts`: `RELEASE_DOMAIN`, `RELEASE_TYPES`, `isAttestationShape(value)`, `parseAttestation(raw)`, `verifyAttestation(raw, deps): Promise<Report>`.
  - `Detected` gains `{ kind: 'release-attestation'; attestation: Record<string, unknown> }`; `KIND_NAMES['release-attestation'] = 'a release attestation'`.

- [ ] **Step 1: Write the failing test**

Create `e2e/verify-orgs.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { verifyCredentialSignature } from '@renown/sdk'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { RELEASE_DOMAIN, RELEASE_TYPES, verifyAttestation } from '../lib/verify/attestation'
import { verifyCredential } from '../lib/verify/credential'
import { detectInput } from '../lib/verify/detect'
import type { OrgCredentialVerdict, OrgLookups, PartyProfile, Report, StoredAttestation, VerifyDeps, VerifyLookups } from '../lib/verify/types'
import { makeCredential, makeWallet } from './support/verify-fixtures'

// Runs in the Playwright worker (Node): real EIP-712 signatures with fresh keys,
// switchboard and organisation reads replaced by an in-memory world.
const APP = 'did:key:z6MkAcmeFixtureAppAxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
const ORG = { id: 'org-verify-1', did: 'did:web:www.renown.id:org:org-verify-1', handle: 'acme', name: 'Acme', verifiedDomains: ['acme.example'] }

interface World {
  profiles?: Record<string, PartyProfile>
  attestations?: StoredAttestation[]
  status?: OrgCredentialVerdict | null
  orgDown?: boolean
}

function deps(world: World): VerifyDeps {
  const lookups: VerifyLookups = {
    credentialById: async () => ({ ok: true, value: [] }),
    credentialsFor: async () => ({ ok: true, value: [] }),
    profileByAddress: async (address) => ({ ok: true, value: world.profiles?.[address.toLowerCase()] ?? null }),
    appProfile: async () => ({ ok: true, value: { documentId: 'doc-app', name: 'Acme Ledger', logoRef: null } }),
  }
  const orgs: OrgLookups = {
    credentialStatus: async () => (world.orgDown ? { ok: false } : { ok: true, value: world.status ?? null }),
    appPublisherOrg: async () => ({ ok: true, value: ORG }),
    releaseAttestations: async () => (world.orgDown ? { ok: false } : { ok: true, value: world.attestations ?? [] }),
  }
  return {
    lookups,
    orgs,
    eoaSignature: (credential) => verifyCredentialSignature(credential as never),
    bearerToken: async () => false,
    contractSignature: async () => 'not-contract',
    now: new Date(),
  }
}

async function signedAttestation(over: Record<string, string> = {}) {
  const account = privateKeyToAccount(generatePrivateKey())
  const message = { appDid: APP, version: '1.4.0', artifactDigest: `sha256:${'b'.repeat(64)}`, orgId: ORG.id, issuedAt: '2026-10-12T10:00:00.000Z' }
  const signature = await account.signTypedData({ domain: RELEASE_DOMAIN, types: RELEASE_TYPES, primaryType: 'ReleaseAttestation', message })
  return { account, json: { ...message, signer: account.address, signature, ...over } }
}

function stored(json: { signature: string; signer: string }, extra: Partial<StoredAttestation> = {}): StoredAttestation {
  return {
    id: 'att-1',
    appDid: APP,
    version: '1.4.0',
    artifactDigest: `sha256:${'b'.repeat(64)}`,
    orgId: ORG.id,
    signer: json.signer.toLowerCase(),
    signerRole: 'PUBLISHER',
    signerStillMember: true,
    issuedAt: '2026-10-12T10:00:00.000Z',
    signature: json.signature,
    createdAt: '2026-10-12T10:01:00.000Z',
    ...extra,
  }
}

const status = (report: Report) => Object.fromEntries(report.checks.map((c) => [c.id, c.status]))
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`.toLowerCase()

test.describe('release attestations', () => {
  test('are detected from their JSON', async () => {
    const { json } = await signedAttestation()
    expect(detectInput(JSON.stringify({ id: 'att-1', ...json })).kind).toBe('release-attestation')
  })

  test('a recorded sign-off for the publishing organisation is genuine', async () => {
    const { account, json } = await signedAttestation()
    const world = { profiles: { [account.address.toLowerCase()]: { documentId: 'd', handle: 'alice', displayName: 'Alice', username: null, avatar: null } }, attestations: [stored(json)] }
    const report = await verifyAttestation(json, deps(world))
    expect(report.verdict).toBe('genuine')
    expect(status(report)).toEqual({ signature: 'pass', record: 'pass', publisher: 'pass' })
    expect(report.summary).toBe('Release 1.4.0 of Acme Ledger — published by Acme, signed off by Alice.')
    expect(report.app?.publisherOrg).toMatchObject({ handle: 'acme' })
  })

  test('a changed attestation is not genuine; an unrecorded one says so; an outage cannot be checked', async () => {
    const { json } = await signedAttestation()
    const changed = await verifyAttestation({ ...json, version: '1.4.1' }, deps({}))
    expect(changed.verdict).toBe('not-genuine')
    expect(status(changed)).toEqual({ signature: 'fail', record: 'neutral', publisher: 'neutral' })
    const unrecorded = await verifyAttestation(json, deps({}))
    expect(unrecorded.verdict).toBe('genuine')
    expect(unrecorded.summary).toMatch(/Renown has no record of it\.$/)
    expect((await verifyAttestation(json, deps({ orgDown: true }))).verdict).toBe('unchecked')
    const broken = await verifyAttestation({ ...json, artifactDigest: 'sha256:xyz' }, deps({}))
    expect(broken).toMatchObject({ verdict: 'not-genuine', summary: 'This is not a complete release attestation: artifactDigest is missing or malformed.' })
  })
})

test.describe('organisation rules on credentials', () => {
  test('a credential whose issuer left the organisation no longer counts', async () => {
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: APP })
    const report = await verifyCredential(credential, deps({ status: { appDid: APP, orgId: ORG.id, counts: false, reason: 'ISSUER_NOT_MEMBER' } }))
    expect(report.verdict).toBe('revoked')
    expect(status(report)['org-rules']).toBe('fail')
    expect(report.summary).toBe(`${short(wallet.address)} is no longer a member of Acme, so this delegation no longer counts.`)
  })

  test('counts when the rules allow it, and cannot be checked when they cannot be read', async () => {
    const wallet = makeWallet()
    const credential = await makeCredential({ wallet, subject: APP })
    const allowed = await verifyCredential(credential, deps({ status: { appDid: APP, orgId: ORG.id, counts: true, reason: null } }))
    expect(allowed.verdict).toBe('genuine')
    expect(status(allowed)['org-rules']).toBe('pass')
    const personal = await verifyCredential(credential, deps({ status: null }))
    expect(status(personal)['org-rules']).toBeUndefined()
    expect((await verifyCredential(credential, deps({ orgDown: true }))).verdict).toBe('unchecked')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/verify-orgs.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../lib/verify/attestation'`.

- [ ] **Step 3: Types, detection and lookups**

In `lib/verify/types.ts`:

- replace the `InputKind` line with:

```ts
export type InputKind = 'did-pkh' | 'did-key' | 'credential' | 'token' | 'credential-id' | 'operation' | 'release-attestation'
```

- add to `AppParty`, after `session: boolean`:

```ts
  /** The organisation that publishes the app, when one does (looked up only with organisation reads). */
  publisherOrg?: AppPublisherOrgRef | null
```

- add to `VerifyDeps`, after `contractSignature`:

```ts
  /** Organisation reads (rules, publisher, attestations); without them those checks are left out. */
  orgs?: OrgLookups
```

- append:

```ts
export interface AppPublisherOrgRef {
  id: string
  did: string
  handle: string
  name: string
  verifiedDomains: string[]
}

export type OrgCredentialReason = 'ISSUER_NOT_MEMBER' | 'ISSUER_NOT_PUBLISHER' | 'SUSPENDED' | 'APP_FROZEN'

/** orgCredentialStatus: whether an organisation's rules let a delegation count (null for person-owned apps). */
export interface OrgCredentialVerdict {
  appDid: string | null
  orgId: string | null
  counts: boolean
  reason: OrgCredentialReason | null
}

/** A release attestation as renown-orgs stores it. */
export interface StoredAttestation {
  id: string
  appDid: string
  version: string
  artifactDigest: string
  orgId: string
  signer: string
  signerRole: string | null
  signerStillMember: boolean
  issuedAt: string
  signature: string
  createdAt: string
}

/** The organisation reads /verify makes: by credential id and by app DID only. */
export interface OrgLookups {
  credentialStatus(credentialId: string): Promise<Lookup<OrgCredentialVerdict | null>>
  appPublisherOrg(appDid: string): Promise<Lookup<AppPublisherOrgRef | null>>
  /** The newest 50 attestations of the app. */
  releaseAttestations(appDid: string): Promise<Lookup<StoredAttestation[]>>
}
```

In `lib/verify/detect.ts`:

- add `import { isAttestationShape } from './attestation'`;
- add `| { kind: 'release-attestation'; attestation: Record<string, unknown> }` to `Detected` before the `kind: null` member;
- add `'release-attestation': 'a release attestation',` to `KIND_NAMES`;
- in `detectInput`, after `if (action) return { kind: 'operation', action }`, add:

```ts
    if (isAttestationShape(parsed)) return { kind: 'release-attestation', attestation: parsed }
```

- change the `'json-unrecognised'` text to `'This JSON is not a Renown credential, a signed operation or a release attestation. A credential has a proof with eip712; an operation has context.signer.signatures; an attestation has appDid, version, artifactDigest, signer and signature.'`.

In `lib/verify/lookups.ts`, change `async function graphql<T>(` to `export async function graphql<T>(`.

Create `lib/verify/org-lookups.ts`:

```ts
// /verify's organisation reads: the rules verdict for a credential id, the
// organisation that publishes an app DID, and an app's release attestations.
// Like the other lookups, only ids leave the browser.
import { switchboardOrigin } from '../../services/media'
import { SWITCHBOARD_ENDPOINT } from '../../services/switchboard-endpoint'
import { graphql } from './lookups'
import type { AppPublisherOrgRef, OrgCredentialVerdict, OrgLookups, StoredAttestation } from './types'

export function switchboardOrgLookups(endpoint = SWITCHBOARD_ENDPOINT): OrgLookups {
  const origin = switchboardOrigin(endpoint)
  const orgs = `${origin}/graphql/renown-orgs`
  const stats = `${origin}/graphql/renown-stats`
  return {
    async credentialStatus(credentialId) {
      const result = await graphql<{ orgCredentialStatus: OrgCredentialVerdict | null }>(
        orgs,
        'query VerifyOrgCredential($id: String!) { orgCredentialStatus(credentialId: $id) { appDid orgId counts reason } }',
        { id: credentialId },
      )
      return result.ok ? { ok: true, value: result.value.orgCredentialStatus ?? null } : result
    },
    async appPublisherOrg(appDid) {
      const result = await graphql<{ appProfile: { publisherOrg: AppPublisherOrgRef | null } | null }>(
        stats,
        'query VerifyAppPublisherOrg($appDid: String!) { appProfile(appDid: $appDid) { publisherOrg { id did handle name verifiedDomains } } }',
        { appDid },
      )
      return result.ok ? { ok: true, value: result.value.appProfile?.publisherOrg ?? null } : result
    },
    async releaseAttestations(appDid) {
      const result = await graphql<{ releaseAttestations: { items: StoredAttestation[] } }>(
        orgs,
        'query VerifyReleaseAttestations($appDid: String!) { releaseAttestations(appDid: $appDid, limit: 50) { items { id appDid version artifactDigest orgId signer signerRole signerStillMember issuedAt signature createdAt } } }',
        { appDid },
      )
      return result.ok ? { ok: true, value: result.value.releaseAttestations.items } : result
    },
  }
}
```

- [ ] **Step 4: Organisation rules**

Create `lib/verify/org-rules.ts`:

```ts
// Delegations for an organisation's apps count only under its rules
// (renown-package A2 ruling 11). /verify adds that as one more check. Pure
// apart from the injected lookup.
import { sentence, shortAddress } from './format'
import type { Check, OrgCredentialReason, OrgLookups, Report } from './types'

function reasonText(reason: OrgCredentialReason, issuer: string, org: string): string {
  switch (reason) {
    case 'ISSUER_NOT_MEMBER':
      return `${issuer} is no longer a member of ${org}`
    case 'ISSUER_NOT_PUBLISHER':
      return `${issuer} may no longer publish this app for ${org}`
    case 'SUSPENDED':
      return `${org} suspended this delegation`
    case 'APP_FROZEN':
      return `${org} froze this app`
  }
}

/** The "Allowed by the organisation" check for a delegation credential; null when no organisation publishes the app or no reads are available. */
export async function orgRulesCheck(orgs: OrgLookups | undefined, credentialId: string, issuer: string, orgName: string | null): Promise<Check | null> {
  if (!orgs) return null
  const id = 'org-rules'
  const label = 'Allowed by the organisation'
  const found = await orgs.credentialStatus(credentialId)
  if (!found.ok) return { id, label, status: 'unknown', detail: 'Renown could not be reached to check the rules of the organisation that publishes this app.' }
  const verdict = found.value
  if (!verdict || !verdict.orgId) return null
  const org = orgName ?? 'the organisation that publishes this app'
  const who = shortAddress(issuer.toLowerCase())
  if (verdict.counts) return { id, label, status: 'pass', detail: `${who} may act for this app under ${org}’s rules.` }
  const why = verdict.reason ? reasonText(verdict.reason, who, org) : `${org}’s rules no longer let it count`
  return { id, label, status: 'fail', detail: `${sentence(why)}, so this delegation no longer counts.` }
}

/** The report with the check added: a failure turns "genuine" into "revoked", a failed lookup into "could not check". */
export function withOrgRules(report: Report, check: Check | null): Report {
  if (!check) return report
  const checks = [...report.checks, check]
  if (report.verdict !== 'genuine') return { ...report, checks }
  if (check.status === 'fail') return { ...report, checks, verdict: 'revoked', summary: check.detail }
  if (check.status === 'unknown') {
    return {
      ...report,
      checks,
      verdict: 'unchecked',
      summary: 'It is genuinely signed, but Renown could not be reached to check the rules of the organisation that publishes the app. Try again in a moment.',
    }
  }
  return { ...report, checks }
}
```

In `lib/verify/parties.ts`:

- add `OrgLookups` to the `./types` type import;
- replace `appParty` with:

```ts
export async function appParty(
  lookups: VerifyLookups,
  did: string,
  claimedName: string | null,
  session = false,
  orgs?: OrgLookups,
): Promise<AppParty> {
  if (session || !did.startsWith('did:key:')) {
    return { did, claimedName, profile: null, looked: true, session: true }
  }
  const [found, publisher] = await Promise.all([lookups.appProfile(did), orgs ? orgs.appPublisherOrg(did) : Promise.resolve(null)])
  return {
    did,
    claimedName,
    profile: found.ok ? found.value : null,
    looked: found.ok,
    session: false,
    // Only with organisation reads, so reports made without them keep their exact shape.
    ...(orgs ? { publisherOrg: publisher && publisher.ok ? publisher.value : null } : {}),
  }
}
```

In `lib/verify/credential.ts`:

- add `import { orgRulesCheck, withOrgRules } from './org-rules'`;
- change the `appParty(...)` call to `appParty(deps.lookups, credential.credentialSubject.id, credential.credentialSubject.app || null, session, deps.orgs)`;
- replace the final `return { kind: 'credential', verdict, summary: sentence(summary[verdict]), checks, signer, app, times }` with:

```ts
  const report: Report = { kind: 'credential', verdict, summary: sentence(summary[verdict]), checks, signer, app, times }
  // A forged credential proves nothing to check rules for; a session is not an app.
  if (forged || session) return report
  return withOrgRules(report, await orgRulesCheck(deps.orgs, credential.id, issuer, app.publisherOrg?.name ?? null))
```

In `lib/verify/token.ts`:

- add `import { orgRulesCheck, withOrgRules } from './org-rules'`;
- change `appParty(deps.lookups, claims.iss, delegation.credential?.credentialSubjectApp || null)` to `appParty(deps.lookups, claims.iss, delegation.credential?.credentialSubjectApp || null, false, deps.orgs)`;
- replace `return { kind: 'token', verdict, summary: sentence(sentences[reason]), checks, signer, app, times }` with:

```ts
  const report: Report = { kind: 'token', verdict, summary: sentence(sentences[reason]), checks, signer, app, times }
  if (delegation.outcome !== 'authorised' || !delegation.credential) return report
  return withOrgRules(report, await orgRulesCheck(deps.orgs, delegation.credential.credentialId, claims.address, app.publisherOrg?.name ?? null))
```

In `lib/verify/operation.ts`:

- add `import { orgRulesCheck, withOrgRules } from './org-rules'`;
- change `appParty(deps.lookups, key, delegation.credential?.credentialSubjectApp || null)` to `appParty(deps.lookups, key, delegation.credential?.credentialSubjectApp || null, false, deps.orgs)`;
- replace the final `return { kind: 'operation', … }` statement with:

```ts
  const report: Report = {
    kind: 'operation',
    verdict,
    summary: sentence(summary[verdict]),
    checks,
    signer,
    app,
    times: [
      ...(signedAt ? [{ label: 'Signed', iso: signedAt.toISOString() }] : []),
      ...(Date.parse(action.timestampUtcMs)
        ? [{ label: legacyScheme ? 'Action time (not signed)' : 'Action time', iso: new Date(Date.parse(action.timestampUtcMs)).toISOString() }]
        : []),
    ],
  }
  if (delegation.outcome !== 'authorised' || !delegation.credential) return report
  return withOrgRules(report, await orgRulesCheck(deps.orgs, delegation.credential.credentialId, user, app.publisherOrg?.name ?? null))
```

- [ ] **Step 5: Release attestations**

Create `lib/verify/attestation.ts`:

```ts
// /verify for a release attestation (renown-package A2 ruling 14): did the
// named wallet sign this EIP-712 sign-off, does Renown hold it, and does the
// organisation it names publish the app? viem loads only when one is checked.
import { appName, formatDay, sentence, shortAddress, signerName } from './format'
import { appParty, signerParty } from './parties'
import type { Check, Report, StoredAttestation, Verdict, VerifyDeps } from './types'
import { SKIPPED_DETAIL } from './types'

export const RELEASE_DOMAIN = { name: 'Renown Release', version: '1', chainId: 1 } as const
export const RELEASE_TYPES = {
  ReleaseAttestation: [
    { name: 'appDid', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'artifactDigest', type: 'string' },
    { name: 'orgId', type: 'string' },
    { name: 'issuedAt', type: 'string' },
  ],
} as const

export interface ReleaseAttestationInput {
  appDid: string
  version: string
  artifactDigest: string
  orgId: string
  issuedAt: string
  signer: `0x${string}`
  signature: `0x${string}`
}

const APP_DID_RE = /^did:key:z[1-9A-HJ-NP-Za-km-z]{32,128}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const HEX_RE = /^0x[0-9a-fA-F]+$/
const FIELDS = ['appDid', 'version', 'artifactDigest', 'orgId', 'issuedAt', 'signer', 'signature'] as const

/** JSON that carries every signed field of an attestation (extra fields such as `id` are fine). */
export function isAttestationShape(value: Record<string, unknown>): boolean {
  return FIELDS.every((field) => typeof value[field] === 'string')
}

export function parseAttestation(raw: Record<string, unknown>): { attestation: ReleaseAttestationInput } | { missing: string } {
  const text = (field: string) => (typeof raw[field] === 'string' ? (raw[field] as string) : null)
  const checks: [string, boolean][] = [
    ['appDid', APP_DID_RE.test(text('appDid') ?? '')],
    ['version', Boolean(text('version')?.trim())],
    ['artifactDigest', DIGEST_RE.test(text('artifactDigest') ?? '')],
    ['orgId', text('orgId') !== null],
    ['issuedAt', !Number.isNaN(Date.parse(text('issuedAt') ?? ''))],
    ['signer', ADDRESS_RE.test(text('signer') ?? '')],
    ['signature', HEX_RE.test(text('signature') ?? '')],
  ]
  const missing = checks.find(([, ok]) => !ok)
  if (missing) return { missing: missing[0] }
  return {
    attestation: {
      appDid: text('appDid') ?? '',
      version: text('version') ?? '',
      artifactDigest: text('artifactDigest') ?? '',
      orgId: text('orgId') ?? '',
      issuedAt: text('issuedAt') ?? '',
      signer: (text('signer') ?? '') as `0x${string}`,
      signature: (text('signature') ?? '') as `0x${string}`,
    },
  }
}

type SignatureOutcome = 'eoa' | 'contract' | 'invalid' | 'unavailable'

async function checkSignature(a: ReleaseAttestationInput, deps: VerifyDeps): Promise<SignatureOutcome> {
  const message = { appDid: a.appDid, version: a.version, artifactDigest: a.artifactDigest, orgId: a.orgId, issuedAt: a.issuedAt }
  try {
    const { recoverTypedDataAddress } = await import('viem')
    const recovered = await recoverTypedDataAddress({ domain: RELEASE_DOMAIN, types: RELEASE_TYPES, primaryType: 'ReleaseAttestation', message, signature: a.signature })
    if (recovered.toLowerCase() === a.signer.toLowerCase()) return 'eoa'
  } catch {
    // Not a plain 65-byte signature: the chain may still know it.
  }
  const onChain = await deps.contractSignature({
    chainId: 1,
    address: a.signer,
    signature: a.signature,
    typedData: { domain: RELEASE_DOMAIN, types: RELEASE_TYPES, primaryType: 'ReleaseAttestation', message },
  })
  return onChain === 'valid' ? 'contract' : onChain === 'unavailable' ? 'unavailable' : 'invalid'
}

export async function verifyAttestation(raw: Record<string, unknown>, deps: VerifyDeps): Promise<Report> {
  const parsed = parseAttestation(raw)
  if ('missing' in parsed) {
    return {
      kind: 'release-attestation',
      verdict: 'not-genuine',
      summary: `This is not a complete release attestation: ${parsed.missing} is missing or malformed.`,
      checks: [{ id: 'shape', label: 'A complete release attestation', status: 'fail', detail: `${parsed.missing} is missing or malformed.` }],
      signer: null,
      app: null,
      times: [],
    }
  }
  const a = parsed.attestation
  const signer = a.signer.toLowerCase()
  const label = 'Signed by the named wallet'
  const outcome = await checkSignature(a, deps)
  const checks: Check[] = [
    outcome === 'eoa'
      ? { id: 'signature', label, status: 'pass', detail: `The EIP-712 signature was made by ${shortAddress(signer)}.` }
      : outcome === 'contract'
        ? { id: 'signature', label, status: 'pass', detail: `The smart wallet ${shortAddress(signer)} confirmed the signature on chain 1.` }
        : outcome === 'unavailable'
          ? { id: 'signature', label, status: 'unknown', detail: `The signature is not from a plain wallet, and chain 1 could not be asked whether ${shortAddress(signer)} is a smart wallet that made it.` }
          : { id: 'signature', label, status: 'fail', detail: `The signature was not made by ${shortAddress(signer)}: the attestation was changed after signing, or someone else signed it.` },
  ]
  const forged = outcome === 'invalid'
  const [party, app, recorded] = await Promise.all([
    signerParty(deps.lookups, signer, 1),
    appParty(deps.lookups, a.appDid, null, false, deps.orgs),
    forged || !deps.orgs ? Promise.resolve(null) : deps.orgs.releaseAttestations(a.appDid),
  ])

  let record: StoredAttestation | null = null
  const recordLabel = 'Recorded by Renown'
  if (forged) checks.push({ id: 'record', label: recordLabel, status: 'neutral', detail: SKIPPED_DETAIL })
  else if (!recorded) checks.push({ id: 'record', label: recordLabel, status: 'neutral', detail: 'Renown’s record of attestations was not consulted.' })
  else if (!recorded.ok) checks.push({ id: 'record', label: recordLabel, status: 'unknown', detail: 'Renown could not be reached to look up its record of this attestation.' })
  else {
    record = recorded.value.find((r) => r.signature.toLowerCase() === a.signature.toLowerCase()) ?? null
    checks.push(
      record
        ? {
            id: 'record',
            label: recordLabel,
            status: 'pass',
            detail: `Renown recorded it on ${formatDay(record.createdAt)}${record.signerRole ? `, when the signer was ${record.signerRole.toLowerCase()} of the organisation` : ''}.${record.signerStillMember ? '' : ' The signer is no longer a member.'}`,
          }
        : { id: 'record', label: recordLabel, status: 'neutral', detail: 'Renown has no record of this attestation. Apps that check Renown trust only recorded ones.' },
    )
  }

  const org = app.publisherOrg ?? null
  const publisherLabel = 'Published by'
  if (forged) checks.push({ id: 'publisher', label: publisherLabel, status: 'neutral', detail: SKIPPED_DETAIL })
  else if (a.orgId === '') checks.push({ id: 'publisher', label: publisherLabel, status: 'neutral', detail: 'It was signed for an app a person publishes.' })
  else if (org && org.id === a.orgId) {
    checks.push({ id: 'publisher', label: publisherLabel, status: 'pass', detail: `${org.name} publishes this app${org.verifiedDomains.length ? `, verified as ${org.verifiedDomains[0]}` : ''}.` })
  } else checks.push({ id: 'publisher', label: publisherLabel, status: 'neutral', detail: 'It names an organisation that does not publish this app now.' })

  const verdict: Verdict = forged ? 'not-genuine' : checks.some((c) => c.status === 'unknown') ? 'unchecked' : 'genuine'
  const who = signerName(party)
  const what = appName(app)
  const publishedBy = a.orgId !== '' && org && org.id === a.orgId ? `published by ${org.name}, ` : ''
  const summary =
    verdict === 'genuine'
      ? `Release ${a.version} of ${what} — ${publishedBy}signed off by ${who}.${record ? '' : ' Renown has no record of it.'}`
      : verdict === 'not-genuine'
        ? `This attestation was not signed by the wallet it names, so it proves nothing about release ${a.version}.`
        : outcome === 'unavailable'
          ? `It is not from a plain wallet, and chain 1 could not be asked whether a smart wallet at ${shortAddress(signer)} made it.`
          : `${who} signed off release ${a.version} of ${what}, but Renown could not be reached to check its record. Try again in a moment.`
  return {
    kind: 'release-attestation',
    verdict,
    summary: sentence(summary),
    checks,
    signer: party,
    app,
    times: [{ label: 'Signed off', iso: a.issuedAt }, ...(record ? [{ label: 'Recorded', iso: record.createdAt }] : [])],
  }
}
```

In `lib/verify/run.ts`:

- add `import { verifyAttestation } from './attestation'` and `import { switchboardOrgLookups } from './org-lookups'`;
- in `liveDeps`, add `orgs: switchboardOrgLookups(),` after `lookups: switchboardLookups(),`;
- in `runVerify`'s switch, add:

```ts
    case 'release-attestation':
      return verifyAttestation(input.attestation, deps)
```

In `components/verify/party-cards.tsx`, add `import { orgPath } from '../../lib/orgs/format'` and, in `AppCard`, right after the `<p className="text-ink-muted text-sm">{app.profile ? 'Public app profile' : …}</p>` paragraph, add:

```tsx
          {app.publisherOrg && (
            <p className="text-ink-muted text-sm">
              Published by{' '}
              <Link href={orgPath(app.publisherOrg.handle)} className="text-ink font-semibold hover:underline">
                {app.publisherOrg.name}
              </Link>
              {app.publisherOrg.verifiedDomains[0] ? `, verified as ${app.publisherOrg.verifiedDomains[0]}` : ''}
            </p>
          )}
```

- [ ] **Step 6: Run the specs**

Run: `pnpm exec playwright test e2e/verify-orgs.spec.ts e2e/verify-checks.spec.ts e2e/verify-detect.spec.ts e2e/verify-page.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS (the existing `/verify` specs build their deps without `orgs`, so their reports keep their exact shape; `verify-page.spec.ts` answers the new organisation queries from the stub's defaults: no status, no publisher, no attestations).

- [ ] **Step 7: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed" (`/verify` loads viem only inside `checkSignature`'s dynamic import).

```bash
git add lib/verify components/verify/party-cards.tsx e2e/verify-orgs.spec.ts
git commit -m "feat(verify): organisation rules, publishers and release attestations"
```

---

### Task 8: Reports — the Report button and `/admin/reports`

**Files:**
- Create: `components/org/report-org-button.tsx`, `components/org/report-org-dialog.tsx`, `components/admin/reports-body.tsx`, `pages/admin/reports.tsx`
- Modify: `components/org/org-page.tsx` (Report button)
- Test: `e2e/org-reports.spec.ts`

**Interfaces:**
- Consumes: `withLazyWalletShell`, `WalletLoadError`; `useMeSession`; `orgWriter`, `sessionSigner` (B1); `orgReports`, `OrgReport`, `OrgReportReason`, `OrgReportResolution`, `OrgReportStatus` (Task 1); `useRemote` (B1); `ErrorState`, `useToasts`, `ToastRegion`; `Field`, `inputClass`; `orgPath`, `shortAddress` (B1); `OrgBodyLoading` (B1).
- Produces: `ReportOrgButton({ org })` (button "Report", dialog "Report <name>"); `ReportOrgDialog({ orgId, orgName, onClose })`; `/admin/reports` (h1 "Reports"; list "Reports"; per report: "Dismiss", "Take down", "Release the handle", "Restore").

- [ ] **Step 1: Write the failing test**

Create `e2e/org-reports.spec.ts`:

```ts
import { test, expect, type Route } from '@playwright/test'
import { organization, orgReport, orgSummary, serveOrgReads } from './support/org-fixtures'
import { signedWrite } from './support/org-manage'
import { fixtureStub, graphqlError, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'

const ORG_ID = 'a0c0ffee-0000-4000-8000-00000000f001'

test.beforeAll(async () => {
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-report"', response: { data: { organization: organization({ id: ORG_ID, handle: 'acme-report', name: 'Acme Report Works' }) } } })
  await fixtureStub({ match: 'mutation ReportOrganization', variables: ORG_ID, response: { data: { reportOrganization: true } } })
})

test.describe('report an organisation', () => {
  test('signs a report from the organisation page', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-report' })
    await page.goto('/@acme-report')
    await page.getByRole('button', { name: 'Report', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Report Acme Report Works' })
    await dialog.getByLabel('Spam').check({ timeout: 30_000 })
    await dialog.getByLabel('Details (optional)').fill('Sells fake tokens.')
    await dialog.getByRole('button', { name: 'Send report' }).click()
    await expect(dialog).toContainText('Thank you.')
    expect(await signedWrite(wallet, 'reportOrganization', ORG_ID)).toEqual({ orgId: ORG_ID, reason: 'SPAM', details: 'Sells fake tokens.' })
  })

  test('asks signed-out visitors to sign in', async ({ page }) => {
    await page.goto('/@acme-report')
    await page.getByRole('button', { name: 'Report', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Report Acme Report Works' }).getByRole('button', { name: 'Sign in to report' })).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('/admin/reports', () => {
  test('shows the 404 content to everyone but platform admins', async ({ page }) => {
    await page.goto('/admin/reports')
    await expect(page.getByRole('heading', { level: 1, name: 'This page is not on the network' })).toBeVisible({ timeout: 30_000 })
    await signInTestWallet(page, { bearer: 'e2e-not-admin' })
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, (route: Route) =>
      (route.request().postDataJSON() as { query: string }).query.includes('query OrgReports') ? route.fulfill({ json: graphqlError('Platform admins only', 'FORBIDDEN') }) : route.continue(),
    )
    await page.goto('/admin/reports')
    await expect(page.getByRole('heading', { level: 1, name: 'This page is not on the network' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('list', { name: 'Reports' })).toHaveCount(0)
  })

  test('a platform admin takes an organisation down with a note', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-admin' })
    const reportId = `r-${crypto.randomUUID()}`
    await serveOrgReads(page, { OrgReports: () => ({ orgReports: [orgReport({ id: reportId, org: orgSummary({ id: 'org-bad', handle: 'fake-acme', name: 'Fake Acme' }) })] }) })
    await fixtureStub({ match: 'mutation ResolveOrgReport', variables: reportId, response: { data: { resolveOrgReport: orgReport({ id: reportId, status: 'RESOLVED', resolution: 'TAKE_DOWN' }) } } })
    await page.goto('/admin/reports')
    const report = page.getByRole('list', { name: 'Reports' }).getByRole('listitem').filter({ hasText: 'Fake Acme' })
    await expect(report).toContainText('Pretends to be the real Acme.', { timeout: 30_000 })
    await report.getByLabel('Note').fill('Confirmed impersonation.')
    await report.getByRole('button', { name: 'Take down' }).click()
    expect(await signedWrite(wallet, 'resolveOrgReport', null, (v) => v.reportId === reportId)).toEqual({ reportId, resolution: 'TAKE_DOWN', note: 'Confirmed impersonation.' })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-reports.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL (no Report button; `/admin/reports` is a 404 page with status 404).

- [ ] **Step 3: The Report button and dialog**

Create `components/org/report-org-dialog.tsx`:

```tsx
// The report dialog. It signs with the wallet session, so ReportOrgButton
// loads it inside the wallet shell, and only once the button is pressed.
import { useEffect, useState } from 'react'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import type { OrgReportReason } from '../../services/org-security'
import { useMeSession } from '../me/use-me-session'
import { Field, inputClass } from '../profile-edit/field'
import { buttonClasses } from '../site/primitives'

const REASONS: { value: OrgReportReason; label: string }[] = [
  { value: 'IMPERSONATION', label: 'It pretends to be someone else' },
  { value: 'HANDLE_DISPUTE', label: 'Its handle is ours' },
  { value: 'SPAM', label: 'Spam' },
  { value: 'ABUSE', label: 'Abuse or harassment' },
  { value: 'OTHER', label: 'Something else' },
]
const MAX_DETAILS = 1000

export function ReportOrgDialog({ orgId, orgName, onClose }: { orgId: string; orgName: string; onClose: () => void }) {
  const session = useMeSession()
  const [reason, setReason] = useState<OrgReportReason>('IMPERSONATION')
  const [details, setDetails] = useState('')
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' } | { status: 'error'; message: string }>({ status: 'idle' })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send() {
    if (session.state !== 'signed-in') return
    setState({ status: 'sending' })
    const text = details.trim()
    const result = await orgWriter(sessionSigner(session)).write('reportOrganization', { orgId, reason, ...(text && { details: text.slice(0, MAX_DETAILS) }) })
    setState(result.ok ? { status: 'sent' } : { status: 'error', message: result.message })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="border-hairline bg-background shadow-modal rounded-panel max-h-full w-full max-w-md overflow-y-auto border p-6">
        <h2 id="report-title" className="text-ink text-h3 break-words">
          Report {orgName}
        </h2>
        {session.state === 'loading' ? (
          <p role="status" className="text-ink-muted mt-4">
            Loading…
          </p>
        ) : session.state === 'signed-out' ? (
          <div className="mt-4 space-y-4">
            <p className="text-ink-muted leading-7">Reports are signed, so Renown&apos;s moderators know each one comes from a real person.</p>
            <button type="button" onClick={session.login} className={buttonClasses('primary', 'md')}>
              Sign in to report
            </button>
          </div>
        ) : state.status === 'sent' ? (
          <p role="status" className="text-ink mt-4 leading-7">
            Thank you. Renown&apos;s moderators will look at it.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-ink text-sm font-semibold">Why are you reporting it?</legend>
              {REASONS.map((option) => (
                <label key={option.value} className="text-ink mt-2 flex items-center gap-2 text-sm">
                  <input type="radio" name="report-reason" checked={reason === option.value} onChange={() => setReason(option.value)} />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <Field id="report-details" label="Details (optional)" counter={`${details.length}/${MAX_DETAILS}`}>
              <textarea id="report-details" rows={4} maxLength={MAX_DETAILS} className={inputClass} value={details} onChange={(e) => setDetails(e.target.value)} />
            </Field>
            {state.status === 'error' && (
              <p role="alert" className="text-danger-ink text-sm">
                {state.message}
              </p>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {session.state === 'signed-in' && state.status !== 'sent' && (
            <button type="button" disabled={state.status === 'sending'} onClick={() => void send()} className={buttonClasses('primary', 'md')}>
              {state.status === 'sending' ? 'Sending…' : 'Send report'}
            </button>
          )}
          <button type="button" onClick={onClose} className={buttonClasses('ghost', 'md')}>
            {state.status === 'sent' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

(The signed-out text is a paragraph and the sign-in a button; the test's "Sign in to report" is that button. The "Spam" option's label is exactly "Spam".)

Create `components/org/report-org-button.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { buttonClasses } from '../site/primitives'
import { withLazyWalletShell, type WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'

function DialogLoading({ error }: WalletFallbackProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-panel p-6">{error ? <WalletLoadError /> : <p role="status">Loading…</p>}</div>
    </div>
  )
}

// The wallet stack and the dialog download only when someone presses Report:
// the organisation page itself stays a marketing page.
const ReportDialog = withLazyWalletShell(() => import('./report-org-dialog').then((m) => m.ReportOrgDialog), DialogLoading)

/** "Report" on an organisation page. */
export function ReportOrgButton({ org }: { org: { id: string; name: string } }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClasses('ghost', 'md')}>
        Report
      </button>
      {open && <ReportDialog orgId={org.id} orgName={org.name} onClose={close} />}
    </>
  )
}
```

In `components/org/org-page.tsx`, add `import { ReportOrgButton } from './report-org-button'` and, inside the hero's `<div className="flex items-center gap-2 pb-1">`, before the `ShareMenu`, add `<ReportOrgButton org={org} />`.

- [ ] **Step 4: `/admin/reports`**

Create `components/admin/reports-body.tsx`:

```tsx
// /admin/reports for platform admins (RENOWN_PLATFORM_ADMINS). Everyone else,
// signed out or refused by the switchboard, sees the 404 content.
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { orgPath, shortAddress } from '../../lib/orgs/format'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import { orgReports, type OrgReport, type OrgReportReason, type OrgReportResolution, type OrgReportStatus } from '../../services/org-security'
import { formatAbsolute } from '../../utils/relative-time'
import { cx } from '../../utils/cx'
import { useMeSession, type MeSession } from '../me/use-me-session'
import { OrgBodyLoading } from '../org/org-body-loading'
import { Field, inputClass } from '../profile-edit/field'
import { ErrorState } from '../site/error-state'
import { Badge, buttonClasses, Container } from '../site/primitives'
import { ToastRegion, useToasts } from '../site/toast'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

const REASON_TEXT: Record<OrgReportReason, string> = {
  IMPERSONATION: 'Impersonation',
  HANDLE_DISPUTE: 'Handle dispute',
  SPAM: 'Spam',
  ABUSE: 'Abuse',
  OTHER: 'Other',
}
const RESOLUTIONS: { value: OrgReportResolution; label: string }[] = [
  { value: 'DISMISS', label: 'Dismiss' },
  { value: 'TAKE_DOWN', label: 'Take down' },
  { value: 'RELEASE_HANDLE', label: 'Release the handle' },
  { value: 'RESTORE', label: 'Restore' },
]

function NotFound() {
  return <ErrorState code="404" title="This page is not on the network" message="The link may be old or mistyped. Profiles live at renown.id/@handle and apps at renown.id/app/<DID>." />
}

function ReportItem({ report, onResolve, busy }: { report: OrgReport; onResolve: (report: OrgReport, resolution: OrgReportResolution, note: string) => void; busy: boolean }) {
  const [note, setNote] = useState('')
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {report.org ? (
            <Link href={orgPath(report.org.handle)} className="text-ink font-semibold break-words hover:underline">
              {report.org.name} <span className="text-ink-muted font-normal">@{report.org.handle}</span>
            </Link>
          ) : (
            <p className="text-ink font-mono text-sm break-all">{report.orgId}</p>
          )}
          <p className="text-ink-muted text-xs">
            Reported by {shortAddress(report.reporter)} on {formatAbsolute(report.createdAt)}
          </p>
        </div>
        <Badge>{REASON_TEXT[report.reason]}</Badge>
      </div>
      {report.details && <p className="text-ink mt-3 text-sm leading-6 break-words whitespace-pre-line">{report.details}</p>}
      {report.status === 'OPEN' ? (
        <div className="mt-4 space-y-3">
          <Field id={`note-${report.id}`} label="Note">
            <input id={`note-${report.id}`} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {RESOLUTIONS.map((option) => (
              <button key={option.value} type="button" disabled={busy} onClick={() => onResolve(report, option.value, note)} className={buttonClasses(option.value === 'DISMISS' ? 'ghost' : 'secondary', 'md')}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-ink-muted mt-3 text-sm">
          {RESOLUTIONS.find((r) => r.value === report.resolution)?.label ?? 'Resolved'}
          {report.resolvedBy ? ` by ${shortAddress(report.resolvedBy)}` : ''}
          {report.note ? `: ${report.note}` : ''}
        </p>
      )}
    </li>
  )
}

function Reports({ session }: { session: SignedIn }) {
  const { getBearer } = session
  const { toasts, show, dismiss } = useToasts()
  const [status, setStatus] = useState<OrgReportStatus>('OPEN')
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => orgReports(status, await getBearer()), [status, getBearer])
  const reports = useRemote(`reports:${status}`, load)

  async function resolve(report: OrgReport, resolution: OrgReportResolution, note: string) {
    setBusy(report.id)
    const text = note.trim()
    const result = await orgWriter(sessionSigner(session)).write('resolveOrgReport', { reportId: report.id, resolution, ...(text && { note: text }) })
    setBusy(null)
    if (result.ok) {
      show('success', 'Resolved.')
      reports.reload()
    } else {
      show('error', result.message)
    }
  }

  if (reports.state.status === 'error' && reports.state.error.code === 'FORBIDDEN') return <NotFound />
  return (
    <Container className="min-h-[60vh] max-w-[860px] pt-12 pb-24 md:pt-16">
      <h1 className="text-ink text-h1">Reports</h1>
      <div className="mt-6 flex gap-2">
        {(['OPEN', 'RESOLVED'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={cx(
              'h-9 rounded-full border px-4 text-sm font-medium',
              status === value ? 'bg-primary-strong text-primary-foreground border-transparent' : 'border-hairline-strong bg-surface-1 text-ink',
            )}
          >
            {value === 'OPEN' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {reports.state.status === 'loading' ? (
          <p role="status" className="text-ink-muted">
            Loading reports…
          </p>
        ) : reports.state.status === 'error' ? (
          <div role="alert">
            <p className="text-ink">The reports did not load.</p>
            <button type="button" onClick={reports.reload} className={buttonClasses('secondary', 'md', 'mt-3')}>
              Try again
            </button>
          </div>
        ) : reports.state.value.length === 0 ? (
          <p className="text-ink-muted">No {status === 'OPEN' ? 'open' : 'resolved'} reports.</p>
        ) : (
          <ul aria-label="Reports" className="border-hairline bg-surface-1 rounded-card divide-hairline divide-y border px-5">
            {reports.state.value.map((report) => (
              <ReportItem key={report.id} report={report} busy={busy === report.id} onResolve={(r, resolution, note) => void resolve(r, resolution, note)} />
            ))}
          </ul>
        )}
      </div>
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </Container>
  )
}

export function ReportsBody() {
  const session = useMeSession()
  if (session.state === 'loading') return <OrgBodyLoading error={null} />
  if (session.state === 'signed-out') return <NotFound />
  return <Reports key={session.address} session={session} />
}
```

Create `pages/admin/reports.tsx`:

```tsx
import type { NextPage } from 'next'
import Head from 'next/head'
import { OrgBodyLoading } from '../../components/org/org-body-loading'
import { SiteLayout } from '../../components/site/site-layout'
import { withLazyWalletShell } from '../../components/wallet/lazy-wallet-shell'

// Platform admins only; who is one is known only in the browser (Rulings 9).
const ReportsBody = withLazyWalletShell(() => import('../../components/admin/reports-body').then((m) => m.ReportsBody), OrgBodyLoading)

const AdminReportsPage: NextPage = () => (
  <SiteLayout>
    <Head>
      <title>Reports - Renown</title>
      <meta name="robots" content="noindex" />
    </Head>
    <ReportsBody />
  </SiteLayout>
)

export default AdminReportsPage
```

- [ ] **Step 5: Run the specs**

Run: `pnpm exec playwright test e2e/org-reports.spec.ts e2e/org-page.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 6: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed" — `/profile/[id]` (which renders organisation pages) still loads no wallet code, because the dialog is behind `withLazyWalletShell`.

```bash
git add components/org components/admin pages/admin e2e/org-reports.spec.ts
git commit -m "feat(orgs): report organisations and the platform admins' reports page"
```

---

### Task 9: Layout guards and CI for B2

**Files:**
- Modify: `e2e/layout-invariants.spec.ts`, `.github/workflows/e2e.yml`
- Test: `e2e/layout-invariants.spec.ts`

**Interfaces:**
- Consumes: B1's layout cases (`org`, `org-manage`, `LAYOUT_ORG`, `LAYOUT_ORG_ID`, `openSection`) and fixtures; `RELEASE_DOMAIN`, `RELEASE_TYPES` (Task 7); `orgProposal`, `orgCredential`, `orgDomain`, `auditEntry`, `serveOrgReads`, `serveStatsReads`, `appProfile` (Task 1).
- Produces: pages `org-app` and `apps-by-org`; states `org-manage: apps|security|domains|webhooks|sign-in clients|audit log section`, `org: report dialog open`, `verify: release attestation result`; CI runs the B2 specs.

- [ ] **Step 1: Add the cases**

In `e2e/layout-invariants.spec.ts`:

- add imports:

```ts
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { RELEASE_DOMAIN, RELEASE_TYPES } from '../lib/verify/attestation'
import { auditEntry, orgCredential, orgDomain, orgProposal } from './support/org-fixtures'
```

- add after `LONG_MEMBERS`:

```ts
const LAYOUT_ORG_APP = 'did:key:z6MkLayoutOrgAppxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
let attestationJson = ''
```

- in `test.beforeAll`, add:

```ts
  await fixtureStub({ match: 'query AppProfile(', variables: LAYOUT_ORG_APP, response: { data: { appProfile: { ...APP, appDid: LAYOUT_ORG_APP, documentId: 'doc-layout-org-app', name: 'An Organisation App With A Rather Long Name', publisherDid: LAYOUT_ORG.did } } } })
  await fixtureStub({
    match: 'query AppProvenance',
    variables: LAYOUT_ORG_APP,
    response: {
      data: {
        appProfile: {
          frozen: true,
          supportContact: 'a-very-long-support-mailbox-name@acme-layout-verification.example',
          securityContact: 'https://acme-layout-verification.example/a/long/security/disclosure/path',
          publisherOrg: { id: LAYOUT_ORG_ID, did: LAYOUT_ORG.did, handle: 'acme-layout', name: LAYOUT_ORG.name, verifiedDomains: LAYOUT_ORG.verifiedDomains },
        },
      },
    },
  })
  await fixtureStub({ match: 'query OrgByRef', variables: `"id":"${LAYOUT_ORG_ID}"`, response: { data: { organization: LAYOUT_ORG } } })
  const signer = privateKeyToAccount(generatePrivateKey())
  const message = { appDid: APP_DID, version: '12.40.3-beta.7', artifactDigest: `sha256:${'c'.repeat(64)}`, orgId: '', issuedAt: '2026-10-12T10:00:00.000Z' }
  const signature = await signer.signTypedData({ domain: RELEASE_DOMAIN, types: RELEASE_TYPES, primaryType: 'ReleaseAttestation', message })
  attestationJson = JSON.stringify({ ...message, signer: signer.address, signature }, null, 2)
```

- add helpers after `openAccountMenu`:

```ts
/** Every B2 section's reads, answered with long values (registered before the manage page opens). */
async function serveSecurityReads(page: Page): Promise<void> {
  const blank = { address: null, demoteToAdmin: null, appDid: null, toKind: null, toId: null, handle: null, domain: null }
  const later = new Date(Date.now() + 2 * 86_400_000).toISOString()
  await serveOrgReads(page, {
    OrgProposals: (v) => ({
      orgProposals: [
        orgProposal({ orgId: String(v.orgId), kind: 'CHANGE_HANDLE', payload: { ...blank, handle: 'a-very-long-handle-of-thirty-c' }, executableAt: later, expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString() }),
        orgProposal({ orgId: String(v.orgId), id: 'p2', kind: 'RECOVER', payload: { ...blank, address: '0x5e00000000000000000000000000000000001e01', domain: LAYOUT_ORG.verifiedDomains[0] }, status: 'CANCELLED' }),
      ],
    }),
    OrgCredentials: () => ({ orgCredentials: [orgCredential({ appDid: APP_DID }), orgCredential({ credentialId: 'urn:uuid:00000000-0000-4000-8000-0000000000e2', appDid: APP_DID, status: { credentialId: 'x', appDid: APP_DID, orgId: 'o', counts: false, reason: 'ISSUER_NOT_PUBLISHER' } })] }),
    OrgWorkloads: () => ({ orgWorkloads: [] }),
    OrgDomains: (v) => ({ orgDomains: [orgDomain({ orgId: String(v.orgId), domain: LAYOUT_ORG.verifiedDomains[0] })] }),
    OrgWebhooks: () => ({ orgWebhooks: [] }),
    OrgOidcClients: () => ({ orgOidcClients: [] }),
    OrgAuditLog: () => ({ orgAuditLog: { items: [auditEntry({ details: JSON.stringify({ handle: 'a-very-long-handle-of-thirty-c', reason: 'A long reason that the table has to wrap instead of widening the page' }) })], next: null } }),
    AppTransfers: () => ({ appTransfers: [] }),
  })
}

const openReportDialog = async (page: Page): Promise<SurfaceSpec> => {
  await page.getByRole('button', { name: 'Report', exact: true }).click()
  const panel = page.getByRole('dialog', { name: `Report ${LAYOUT_ORG.name}` })
  await expect(panel.getByRole('button', { name: /Sign in to report|Send report/ })).toBeVisible({ timeout: 30_000 })
  return { panel, overlay: panel.locator('xpath=..') }
}
```

- add to `PAGES`:

```ts
  { name: 'org-app', open: visit(`/app/${LAYOUT_ORG_APP}`, 'An Organisation App With A Rather Long Name') },
  { name: 'apps-by-org', open: visit('/apps?org=acme-layout', 'Apps on Renown') },
```

- add to `STATES`:

```ts
  { name: 'apps section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Apps') },
  { name: 'security section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Security') },
  { name: 'domains section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Domains') },
  { name: 'webhooks section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Webhooks') },
  { name: 'sign-in clients section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Sign-in clients') },
  { name: 'audit log section', inline: true, page: 'org-manage', widths: [390, 1280], prepare: serveSecurityReads, open: openSection('Audit log') },
  { name: 'report dialog open', page: 'org', widths: [390, 1280], open: openReportDialog },
  {
    name: 'release attestation result',
    inline: true,
    page: 'verify',
    widths: [390, 1280],
    open: (page) => checkText(attestationJson, 'Genuine')(page),
  },
```

(The attestation is for a person-owned app (`orgId: ""`) and unrecorded, so with the stub's defaults it is "Genuine" with "Renown has no record of it.")

- [ ] **Step 2: Run the layout guards**

Run: `pnpm exec playwright test e2e/layout-invariants.spec.ts e2e/layout-invariants-guards.spec.ts --workers=2 --reporter=line 2>&1 | tail -8`
Expected: PASS. A failure is fixed in the component (`min-w-0`, `break-all`, `truncate`, an inner scroll for the audit table), never in the guard.

- [ ] **Step 3: CI**

In `.github/workflows/e2e.yml`, add to the `Run e2e specs` list, after `e2e/org-account.spec.ts`:

```yaml
          e2e/org-security-client.spec.ts
          e2e/org-manage-apps.spec.ts
          e2e/org-manage-security.spec.ts
          e2e/org-manage-integrations.spec.ts
          e2e/org-manage-oidc-audit.spec.ts
          e2e/app-provenance.spec.ts
          e2e/verify-orgs.spec.ts
          e2e/org-reports.spec.ts
```

- [ ] **Step 4: Run the whole CI set**

Run: `CI=1 pnpm exec playwright test $(sed -n '/pnpm exec playwright test/,/--workers=2/p' .github/workflows/e2e.yml | grep -o 'e2e/[a-z-]*\.spec\.ts' | tr '\n' ' ') --workers=2 --reporter=line 2>&1 | tail -8`
Expected: all pass; no test reported as flaky.

- [ ] **Step 5: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed".

```bash
git add e2e/layout-invariants.spec.ts .github/workflows/e2e.yml
git commit -m "test(orgs): layout guards and CI for security, provenance, verify and reports"
```

---

## B1 + B2 rollout

- [ ] Push `feat/organisations`, open a PR into `deploy/staging` (description without attribution lines), let CI pass, merge; after the `staging-<sha7>` rollout check on `https://renown-staging.vetra.io` against the staging switchboard (A1–A3 deployed): an org's Security shows its proposals and delegations, a domain shows both proofs, a webhook test reaches a request bin, `/app/<org app DID>` shows the org card, `/apps?org=<handle>` filters, `/verify` checks an attestation made with the renown-package smoke script, and `/admin/reports` shows the 404 content to a non-admin wallet. Then open the PR into `main`.
- [ ] Tell the Vetra (C) side the final renown.id URLs: transfer an app into an organisation `https://<renown>/org/<handle>/manage/apps?bring=<appDid>`; manage an organisation `https://<renown>/org/<handle>/manage/<section>` with sections `members, teams, apps, security, domains, webhooks, oidc, audit, settings`; create one `/org/new`; public page `/@<handle>`.

## Self-review

- **Spec coverage (section 5, B2 part):** manage apps with frozen state, transfers in and out, accept, propose transfer out and freeze (Task 2); security with single-owner warning, owners, proposals with countdowns and approve/cancel/execute, delegations with status and suspend/unsuspend per credential and per member, service accounts with disable, recovery explainer (Task 3); domains with both methods, check and status (Task 4); webhooks with the secret once, events, deliveries and test (Task 4); OIDC clients with the secret once (Task 5); audit table and export (Task 5); app page org publisher, "signed off by", contacts and "Frozen by" (Task 6); `/apps?org=` (Task 6); `/verify` org publisher on parties, `orgCredentialStatus` reasons and release attestations (Task 7); `/admin/reports` and the Report button (Task 8); layout states and CI (Task 9). `/me` incoming transfers (Task 2) close the person side of spec 3.7.
- **Placeholders:** none; every step carries its code or exact edit.
- **Type consistency:** `ManageContext.run`, `useRemote`, `signedWrite`, `openManagePage({ search })`, the fixture builders and `OrgLookups` keep one signature across tasks; `appParty`'s new fifth parameter is passed at every call site that has `deps` (credential, token, operation, attestation; `did.ts` keeps four).
- **Review Focus** lines are pinned: 1 → Task 1 "stages…" and Task 3 countdown/Run now; 2 → Task 4 webhook secret gone after navigation and Task 5 rotation; 3 → Task 7 "a credential whose issuer left the organisation no longer counts"; 4 → Task 6 "still renders when provenance cannot be read"; 5 → Task 8 "shows the 404 content to everyone but platform admins".
