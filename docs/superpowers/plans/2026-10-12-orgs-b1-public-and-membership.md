# Renown Organisations B1 — renown.id public pages and membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** renown.id shows organisations and lets people run their membership: org pages at `/@handle`, the `/orgs` directory, `/org/new`, invite links, the manage pages for members, teams and settings, memberships and invites on `/me`, "Member of" on profiles, an organisation switcher in the account menu, a notifications bell with an inbox, and the `did:web` document at `/org/<id>/did.json`.

**Architecture:** Every read goes from the browser (or `getServerSideProps`) straight to `<switchboard>/graphql/renown-orgs` through `services/orgs.ts`, with the Renown bearer when the read is about the visitor. Every write is signed in the wallet shell with `orgMessage(...)` (a verbatim copy of renown-package `sdk/orgs.ts`, pinned to A1's vectors) and posted to `/api/org/<mutation>`, which checks the arguments against one registry (`services/org-mutations.ts`) and forwards them, with the signature as `auth`, to the switchboard. The manage pages are one dynamic route whose sections come from a registry, so B2 adds its sections without touching the shell. Public pages stay free of wallet code; signing UIs load through `withLazyWalletShell`.

**Tech Stack:** Next 16.2.6 pages router (webpack), React 19.2.6, Tailwind v4 tokens (`styles/globals.css`), graphql-request 7, graphql 16 (`parse` in tests), viem 2.48.4 (tests sign with fresh keys), Playwright 1.57 with the stub switchboard, pnpm 10, Node 24.

**Spec:** `/home/f/projects/renown-package-orgs/docs/superpowers/specs/2026-10-12-renown-organisations-design.md` — section 5 (sub-project B) and section 3 (behaviour). Binding API: the "Appendix — API contract" and "Rulings" of `/home/f/projects/renown-package-orgs/docs/superpowers/plans/2026-10-12-orgs-a1-core.md` (signed-message format and vectors in its Task 3, the A1 SDL in its Task 5 Step 2); notification payloads from A1 Task 7, A2 Rulings 4 and 12 and A3 Ruling 2. B2 (`2026-10-12-orgs-b2-manage-security-and-verify.md`) builds on this plan.

**Code repo:** `/home/f/projects/renown-orgs` (powerhouse-inc/renown), branch `feat/organisations` from `origin/main` (7489957, release 1.24.0). All paths are relative to it. Run `pnpm install --frozen-lockfile` once.

## Rulings

1. **One client copy of the message code.** `services/org-signed-messages.ts` is a verbatim copy of renown-package `sdk/orgs.ts` (`ORG_ROLES`, `parseOrgRole`, `roleAtLeast`, `canonicalJson`, `sha256Hex`, `orgMessage`), kept with its double quotes and semicolons like `services/renown-signed-messages.ts`. `e2e/org-client.spec.ts` pins A1's five vectors byte for byte. The site does not depend on renown-package.
2. **Writes.** All org writes are signed with the wallet (spec 5 ruling) and posted as `{args, auth}` to `/api/org/<mutation>`. The client JSON-roundtrips `args` before signing, so it signs exactly the bytes it sends; `undefined` fields never leave the browser, `null` does. The route accepts only mutations in `ORG_MUTATIONS`, refuses unknown or missing arguments (`400`, `field`), refuses a missing or malformed `auth` (`401`) and never adds or changes an argument. GraphQL codes map to HTTP: `BAD_USER_INPUT 400`, `FORBIDDEN 403`, `NOT_FOUND 404`, `LIMIT_REACHED`/`RATE_LIMITED 429`, `SERVICE_UNAVAILABLE 503`, every other contract code `409`, no usable answer `502`.
3. **One exception to signed writes: `markNotificationsRead`.** It changes only the caller's own read flags, so the inbox and the bell call it directly with the bearer (no wallet prompt to read one's inbox, no wallet code on `/notifications`). Everything else that writes is signed.
4. **Reads.** Public reads carry no credentials. Reads about the visitor (`organization` for `viewerMembership`, `organizationsByMember` of oneself, `organizationMembers` of an org one belongs to, `orgInvites`, `orgInviteLinks`, `myOrgInvites`, `myNotifications`, `myUnreadNotificationCount`) send `Authorization: Bearer <renown bearer>`; under `NEXT_PUBLIC_E2E_AUTH=1` the bearer is `window.__renownE2eBearer`. Every query and mutation document carries an operation name (`query OrgByRef`, `mutation InviteOrgMember`, …) so tests match them exactly.
5. **`/@handle` resolution.** Handles are one namespace. On `/@handle` the profile and the organisation are looked up in parallel; a person wins (they cannot collide, A1 ruling 8), then an organisation renders `OrgPage` in place (no redirect, the canonical URL stays `/@handle`). If no person was found and the organisation lookup failed, the page answers `503` (never `404` for a possibly valid org). `/org/<id or handle>` redirects (`307`) to `/@handle`.
6. **Org page visibility** follows A1 ruling 10: taken down shows only the name and "This organisation was taken down by Renown's moderators.", `noindex`; archived shows an "Archived" badge and is `noindex`; members appear only when `membersPublic` (the public `organizationMembers` list already applies `hidden`). The apps grid reads `appProfiles(orgId)` through a second query document (`AppProfilesByOrg`), so `/apps` keeps working against a switchboard without the `orgId` argument.
7. **`did.json`.** `next.config.ts` rewrites `/org/:id/did.json` to `/api/org-did/:id`, which returns `organizationDidDocument(orgId)` parsed (`application/json`, CORS `*`, `public, s-maxage=300, stale-while-revalidate=600`), `404` when null, `503` when the switchboard fails, `502` when it returns something that is not JSON.
8. **Invite links.** The URL is `<origin>/invite/<token>`. The token is a secret: the page sends `Referrer-Policy: no-referrer` (meta and header), `Cache-Control: private, no-store`, `noindex`, and `components/analytics/analytics.tsx` does not mount OpenPanel while the path starts with `/invite/` (same mechanism as the `/verify` `#v=` guard). Direct invites are answered on `/me` (and linked from the inbox), never through a URL.
9. **Manage routes.** `/org/[id]/manage/[section]`; `[id]` is a handle (links always use it) or an org id. `getServerSideProps` only validates `section` against `MANAGE_SECTIONS` (`404` otherwise); everything else is client-side in the wallet shell: the session is `useMeSession()` (reused from `/me`), the org is re-read with the bearer to get `viewerMembership`. Section access: `members` and `teams` for every active member (read-only below admin), `settings` for admins and owners; owner-only controls (handle change, delete) render only for owners. Opening a manage page stores the org id in `localStorage['renown.activeOrg']`.
10. **Role rules in the UI** mirror A1 ruling 11: admins invite, re-role and remove up to `PUBLISHER`; only owners grant, change or remove `ADMIN`; owners never appear as changeable (B2's security proposals do that); invite links offer `MEMBER` and `PUBLISHER` only; app scope applies to publishers only. The server decides; the UI only hides what would be refused.
11. **Org avatars** upload through the existing profile uploader (`AvatarUploader`, bearer-authorised `media/uploads`), then `updateOrganization(avatar)`; they render from `/media/<orgId>/avatar` (A1 ruling 13) through `ProfileAvatar` with the org id as document id and seed.
12. **Notifications** are polled every 60 s while the tab is visible and on `visibilitychange`; the inbox fires `renown:notifications-changed` after marking read so the bell refreshes at once. Texts and links come from `lib/orgs/notifications.ts`, which reads only the payload keys A1–A3 write and degrades to a generic sentence for anything else.
13. **Navigation.** "Organisations" joins the footer's Product column (`/orgs`); the header keeps its five links. The account menu gains "Your organisations" (at most 6, the active one first, plus "All organisations" to `/me#organisations` when there are more) and "Create organisation"; the mobile drawer keeps its account links ("Your Renown" leads to the same list on `/me`).
14. **Wallet split.** `/orgs`, `/org/[id]`, `/invite/[token]` and `/notifications` join `MARKETING_PAGES` in `scripts/check-wallet-chunks.mjs`; `/profile/[id]` (which now also renders org pages) already is one. `/org/new`, the manage pages and `/me` load their bodies with `withLazyWalletShell`; the invite page loads only its "Join" panel that way.
15. **Analytics** go through `services/analytics` only: `org.created`, `org.invite.sent`, `org.invite.accepted` (properties: `role` only; never handles, addresses or tokens).

## Global Constraints

- Conventional commits (`feat(orgs): …`, `test(orgs): …`, `ci: …`); **no `Co-Authored-By` or "Generated with" lines** in commits or PR descriptions.
- After every task: `pnpm lint` and `pnpm build` (runs `node scripts/check-wallet-chunks.mjs`; set `NEXT_PUBLIC_PRIVY_APP_ID=e2e` in the shell if the build asks for it) pass, and the task's specs pass with `pnpm exec playwright test e2e/<file> --reporter=line 2>&1 | tail -20`. Keep command output short (`| tail -20`, `| grep -E "passed|failed|Error"`).
- The wallet shell stays lazy: no page in `MARKETING_PAGES` imports `components/wallet/wallet-shell`, wagmi, Privy or RainbowKit; signing UIs load through `withLazyWalletShell`.
- Analytics only through `services/analytics` (`ANALYTICS_EVENTS` + `useOpenPanelAnalytics().track`), never the raw SDK; no tokens, addresses or handles in event properties.
- API names, argument names, enums and error codes are exactly the A1 appendix's; roles are uppercase in data and "Owner/Admin/Publisher/Member" in copy.
- Handle regex `^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$`; org DID `did:web:<host>:org:<orgId>`.
- Copy: UK spelling ("organisation"), sentence case, no ALL-CAPS, no "→", no middle dots.
- Code style: the repo's Prettier (no semicolons, single quotes, trailing commas, width 100) except the verbatim copy in `services/org-signed-messages.ts`; relative imports (no `@/`); no new dependencies.
- `react-hooks` 7 rules are on: no synchronous `setState` in an effect body (set state in promise or timer callbacks), no `Date.now()`/`new Date()` during render outside a `useState` initialiser.
- Staging first: merge to `deploy/staging`, check renown-staging.vetra.io against the staging switchboard (A1–A3 deployed), then `main`.

## Review Focus

1. **An optional field left blank in a signed form** (bio on create, a cleared website in settings). Expected: the create form omits it (not `""`), settings sends `""` only to clear a stored value, and the server's hash equals the client's because the client signs the JSON-roundtripped args it posts. Pinned in Task 2 ("signs exactly the arguments it posts") and Task 7 ("sends only changed fields, '' to clear").
2. **`/@acme` while renown-orgs is down and no person owns `acme`.** Expected: `503` with Retry-After, never a cacheable `404` that would drop a real org from search engines. Pinned in Task 3 ("answers 503 when organisations cannot be read").
3. **An invite link token leaking** through analytics, the Referer header or a shared cache. Expected: no OpenPanel event or screen view contains the token, the page says `no-referrer` and `private, no-store`. Pinned in Task 5 ("never sends the invite token to analytics").
4. **An admin trying to grant ADMIN or touch an owner.** Expected: the role menu offers only Member and Publisher for publishers and members, owners have no actions, and an owner viewer sees Admin. Pinned in Task 6 ("offers only the roles the viewer may grant").
5. **A taken-down organisation** reached by its page, the directory or `did.json`. Expected: notice only, `noindex`, no bio or members; `did.json` `404` (the backend answers null). Pinned in Task 3 ("a taken-down organisation shows only the notice").

---

## File Structure

| File | Responsibility |
| --- | --- |
| `services/org-signed-messages.ts` | verbatim `sdk/orgs.ts`: roles, canonical JSON, `orgMessage` |
| `lib/orgs/errors.ts` | error codes, HTTP status, user-facing text |
| `lib/orgs/handles.ts` | handle regex, reserved words, `handleFromName`, `orgRef` |
| `services/orgs.ts` | types, field selections, `OrgApiError`, `orgsRequest`, every read, `markNotificationsRead` |
| `services/org-mutations.ts` | the mutation registry, `mutationDocument`, `argsProblem` |
| `services/org-write.ts`, `pages/api/org/[mutation].ts` | server passthrough for signed writes |
| `services/org-client-write.ts` | browser side: sign, post, map the answer (`signedOrgWrite`, `orgWriter`) |
| `hooks/use-remote.ts` | keyed async read state without `setState` in effect bodies |
| `lib/orgs/format.ts` | paths, role labels, member labels, plurals |
| `lib/orgs/org-page-data.ts`, `components/org/*`, `pages/profile/[id].tsx`, `pages/org/[id]/index.tsx` | the public org page and `/@handle` branch |
| `pages/api/org-did/[id].ts`, `next.config.ts` | `did.json` |
| `components/profile/member-of.tsx` | "Member of" on person profiles |
| `pages/orgs.tsx`, `components/orgs/*` | the directory |
| `lib/orgs/create-form.ts`, `components/org-new/*`, `pages/org/new.tsx` | create an organisation |
| `pages/invite/[token].tsx`, `components/org/invite-accept.tsx`, `components/analytics/analytics.tsx` | invite links |
| `lib/orgs/manage-sections.ts`, `lib/orgs/members.ts`, `lib/orgs/teams.ts`, `lib/orgs/settings-form.ts` | pure manage rules |
| `components/org-manage/*`, `pages/org/[id]/manage/*` | manage shell, members, teams, settings |
| `lib/orgs/notifications.ts`, `lib/orgs/active-org.ts` | inbox text and links; the remembered org |
| `components/site/*` (bell, account menu, bearer), `pages/notifications.tsx`, `components/notifications/*` | header surfaces and the inbox |
| `components/me/org-memberships.tsx` | memberships and pending invites on `/me` |
| `e2e/support/org-fixtures.ts`, `e2e/support/stub-switchboard.mjs` | fixtures, read helper, stub defaults |
| `e2e/org-*.spec.ts`, `e2e/orgs-directory.spec.ts`, `e2e/layout-invariants.spec.ts`, `.github/workflows/e2e.yml` | tests and CI |

---

### Task 1: Org client core — signed-message copy, types, reads, mutation registry, stub defaults

**Files:**
- Create: `services/org-signed-messages.ts`, `lib/orgs/errors.ts`, `lib/orgs/handles.ts`, `services/orgs.ts`, `services/org-mutations.ts`, `e2e/support/org-fixtures.ts`
- Modify: `e2e/support/stub-switchboard.mjs` (`DEFAULT_DATA`)
- Test: `e2e/org-client.spec.ts`

**Interfaces:**
- Consumes: `switchboardOrigin()` from `services/media.ts`; the stub at `STUB_SWITCHBOARD_URL`.
- Produces:
  - `services/org-signed-messages.ts`: `ORG_ROLES`, `type OrgRole`, `parseOrgRole(value: string): OrgRole | null`, `roleAtLeast(role: string, min: string): boolean`, `canonicalJson(value: unknown): string`, `sha256Hex(input: string): Promise<string>`, `orgMessage(mutation: string, orgId: string | null | undefined, args: Record<string, unknown>, timestamp: string): Promise<string>`.
  - `lib/orgs/errors.ts`: `ORG_ERROR_CODES`, `type OrgErrorCode`, `type OrgClientCode = 'DECLINED' | 'NO_WALLET' | 'NETWORK'`, `type OrgFailureCode`, `isOrgErrorCode(value: unknown)`, `statusForOrgError(code: OrgFailureCode): number`, `orgErrorText(code: OrgFailureCode, serverMessage?: string | null): string`.
  - `lib/orgs/handles.ts`: `ORG_HANDLE_RE`, `ORG_RESERVED_HANDLES`, `normalizeOrgHandle(raw: string): string`, `orgHandleProblem(handle: string): string | null`, `handleFromName(name: string): string`, `orgRef(ref: string): { id: string } | { handle: string }`.
  - `services/orgs.ts`: types `OrgRole` (re-export), `OrgMemberStatus`, `OrgLink`, `OrgAppScope`, `OrgSummary`, `OrgApp`, `OrgTeam`, `OrgMembership`, `Organization`, `OrgCard`, `OrgAffiliation`, `OrgSearchPage`, `OrgMember`, `OrgInvite`, `OrgInviteLink`, `OrgInviteLinkCreated`, `OrgInviteLinkPreview`, `OrgHandleAvailability`, `OrgNotificationKind`, `OrgNotification`, `OrgNotificationPage`, `OrganizationStats`, `OrgProposalKind`, `OrgProposalStatus`, `OrgPartyKind`, `OrgProposalPayload`, `OrgProposal`; field strings `ORG_SUMMARY_FIELDS`, `TEAM_FIELDS`, `MEMBERSHIP_FIELDS`, `ORG_FIELDS`, `ORG_CARD_FIELDS`, `MEMBER_FIELDS`, `INVITE_FIELDS`, `LINK_FIELDS`, `PROPOSAL_FIELDS`, `NOTIFICATION_FIELDS`; `class OrgApiError { code; field; message }`, `toOrgApiError(error: unknown): OrgApiError`, `orgsEndpoint(): string`, `orgsRequest<T>(query, variables?, options?: { bearer?: string | null; endpoint?: string }): Promise<T>`; reads `fetchOrganization(ref, bearer?)`, `searchOrganizations(query, after?)`, `organizationsByMember(address, bearer?)`, `organizationMembers(orgId, includeInactive, bearer?)`, `orgInvites(orgId, bearer)`, `orgInviteLinks(orgId, bearer)`, `myOrgInvites(bearer)`, `orgInviteLinkPreview(token)`, `orgHandleAvailability(handle)`, `myNotifications({ unreadOnly, after }, bearer)`, `myUnreadNotificationCount(bearer)`, `markNotificationsRead(target: { ids: string[] } | { all: true }, bearer)`, `fetchOrganizationStats(orgId)`, `fetchOrganizationDidDocument(orgId)`; `ORGS_PAGE_SIZE = 24`, `ORG_QUERY_MAX = 40`, `parseOrgQuery(raw)`, `isOrgSearchable(query)`.
  - `services/org-mutations.ts`: `interface OrgMutationSpec { args: Readonly<Record<string, string>>; select: string }`, `ORG_MUTATIONS`, `type OrgMutationName`, `isOrgMutationName(value: string): value is OrgMutationName`, `mutationDocument(name: OrgMutationName): string`, `argsProblem(name: OrgMutationName, args: Record<string, unknown>): string | null`.
  - `e2e/support/org-fixtures.ts`: `APP_DID_A`, `APP_DID_B`, `orgSummary(over?)`, `organization(over?)`, `membership(orgId, address, role, over?)`, `orgMember(over)`, `orgInvite(over)`, `orgInviteLink(over)`, `serveOrgReads(page, answers)`, `DIRECTORY_ORGS`, `installDirectoryFixture()`.

- [ ] **Step 1: Write the failing test**

Create `e2e/org-client.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { parse } from 'graphql'
import { GraphQLClient } from 'graphql-request'
import { isOrgErrorCode, orgErrorText, statusForOrgError } from '../lib/orgs/errors'
import { handleFromName, orgHandleProblem, orgRef } from '../lib/orgs/handles'
import { argsProblem, isOrgMutationName, mutationDocument, ORG_MUTATIONS, type OrgMutationName } from '../services/org-mutations'
import { canonicalJson, ORG_ROLES, orgMessage, parseOrgRole, roleAtLeast } from '../services/org-signed-messages'
import { isOrgSearchable, OrgApiError, orgsRequest, parseOrgQuery, toOrgApiError } from '../services/orgs'
import { fixtureStub, graphqlError, STUB_SWITCHBOARD_URL, stubRequests } from './support/stub-switchboard-client'

// Runs in the Playwright worker (Node). The message vectors are renown-package's
// (docs/superpowers/plans/2026-10-12-orgs-a1-core.md, Task 3, sdk/tests/orgs.test.ts):
// a drift here makes every signed organisation write FORBIDDEN.
const TS = '2026-10-12T12:00:00.000Z'
const ORGS = `${STUB_SWITCHBOARD_URL}/graphql/renown-orgs`

test.describe('org signed messages', () => {
  test('ranks roles OWNER > ADMIN > PUBLISHER > MEMBER, case-insensitively', () => {
    expect(ORG_ROLES).toEqual(['OWNER', 'ADMIN', 'PUBLISHER', 'MEMBER'])
    expect(roleAtLeast('OWNER', 'ADMIN')).toBe(true)
    expect(roleAtLeast('publisher', 'PUBLISHER')).toBe(true)
    expect(roleAtLeast('MEMBER', 'publisher')).toBe(false)
    expect(roleAtLeast('ROOT', 'MEMBER')).toBe(false)
    expect(parseOrgRole(' admin ')).toBe('ADMIN')
    expect(parseOrgRole('toString')).toBeNull()
  })

  test('canonical JSON sorts keys recursively, drops undefined and keeps null', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: null }], c: 'x' }, u: undefined })).toBe(
      '{"a":{"c":"x","d":[3,{"y":null,"z":1}]},"b":1}',
    )
    expect(canonicalJson([undefined, 'a'])).toBe('[null,"a"]')
    expect(canonicalJson({})).toBe('{}')
  })

  test('orgMessage matches the backend vectors byte for byte', async () => {
    expect(await orgMessage('createOrganization', null, { handle: 'acme', name: 'Acme Inc.' }, TS)).toBe(
      `Renown organization createOrganization - 51fc9dfbed0da2cbf914335bc158a6279d52f9f56fc9746e77140b1821312231 at ${TS}`,
    )
    expect(await orgMessage('inviteOrgMember', 'org-1', { orgId: 'org-1', invitee: 'bob', role: 'PUBLISHER' }, TS)).toBe(
      `Renown organization inviteOrgMember org-1 ceab60b2f8e9d6c45925d6a2f756b98de0945072e24146e7a46ca907cdc57ec0 at ${TS}`,
    )
    expect(await orgMessage('leaveOrganization', 'org-1', { orgId: 'org-1' }, TS)).toBe(
      `Renown organization leaveOrganization org-1 44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a at ${TS}`,
    )
    expect(
      await orgMessage(
        'setOrgMemberAppScope',
        'org-1',
        {
          orgId: 'org-1',
          address: '0xb0b0000000000000000000000000000000000002',
          appScope: { appDids: ['did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'], all: false },
        },
        TS,
      ),
    ).toBe(`Renown organization setOrgMemberAppScope org-1 d4e9d9d8ff152bca70736879229c7fd17b5916de16de6964dae4c1fcf437b405 at ${TS}`)
    expect(
      await orgMessage('acceptOrgInviteLink', undefined, { token: 'abc', auth: { address: '0x1', signature: '0x', timestamp: TS } }, TS),
    ).toBe(`Renown organization acceptOrgInviteLink - 9c5955952c12f09397bd7fcf56624bea656322913fd00d884661c3b126d17a28 at ${TS}`)
  })
})

test.describe('org mutation registry', () => {
  test('builds a named mutation with every argument and auth', () => {
    expect(mutationDocument('inviteOrgMember')).toBe(
      'mutation InviteOrgMember($orgId: String!, $invitee: String!, $role: OrgRole!, $auth: OrgAuthInput) { inviteOrgMember(orgId: $orgId, invitee: $invitee, role: $role, auth: $auth) { id orgId org { id did handle name avatar verifiedDomains } address role status invitedBy createdAt expiresAt } }',
    )
    expect(mutationDocument('leaveOrganization')).toBe(
      'mutation LeaveOrganization($orgId: String!, $auth: OrgAuthInput) { leaveOrganization(orgId: $orgId, auth: $auth) }',
    )
  })

  test('every registered document is valid GraphQL', () => {
    for (const name of Object.keys(ORG_MUTATIONS) as OrgMutationName[]) {
      expect(() => parse(mutationDocument(name)), name).not.toThrow()
    }
  })

  test('knows only registered mutations and names the first bad argument', () => {
    expect(isOrgMutationName('inviteOrgMember')).toBe(true)
    expect(isOrgMutationName('toString')).toBe(false)
    expect(isOrgMutationName('resolveOrgReport')).toBe(false)
    expect(argsProblem('inviteOrgMember', { orgId: 'o', invitee: 'bob', role: 'MEMBER' })).toBeNull()
    expect(argsProblem('inviteOrgMember', { orgId: 'o', invitee: 'bob' })).toBe('role')
    expect(argsProblem('inviteOrgMember', { orgId: 'o', invitee: 'bob', role: null })).toBe('role')
    expect(argsProblem('inviteOrgMember', { orgId: 'o', invitee: 'bob', role: 'MEMBER', auth: {} })).toBe('auth')
    expect(argsProblem('updateOrganization', { orgId: 'o', bio: null })).toBeNull()
  })
})

test.describe('org helpers', () => {
  test('handles: problems, suggestions and references', () => {
    expect(orgHandleProblem('')).toBe('Choose a handle.')
    expect(orgHandleProblem('ab')).toMatch(/3 to 30/)
    expect(orgHandleProblem('Acme')).toMatch(/3 to 30/)
    expect(orgHandleProblem('invite')).toBe('This handle is reserved.')
    expect(orgHandleProblem('acme-labs')).toBeNull()
    expect(handleFromName('  Acme Inc. — Zürich  ')).toBe('acme-inc-zurich')
    expect(handleFromName('A')).toBe('')
    expect(handleFromName('x'.repeat(40))).toBe('x'.repeat(30))
    expect(orgRef('Acme-Labs')).toEqual({ handle: 'acme-labs' })
    expect(orgRef('7f2c1a9e-0b6d-4c1e-9a55-3c2f6f1d2b10')).toEqual({ id: '7f2c1a9e-0b6d-4c1e-9a55-3c2f6f1d2b10' })
  })

  test('directory query: trimmed, capped at 40, searchable when blank or 2+', () => {
    expect(parseOrgQuery(['  acme  ', 'x'])).toBe('acme')
    expect(parseOrgQuery('x'.repeat(50))).toBe('x'.repeat(40))
    expect(isOrgSearchable('')).toBe(true)
    expect(isOrgSearchable('a')).toBe(false)
    expect(isOrgSearchable('ac')).toBe(true)
  })

  test('errors: HTTP status and text', () => {
    expect(isOrgErrorCode('LAST_OWNER')).toBe(true)
    expect(isOrgErrorCode('DECLINED')).toBe(false)
    expect(statusForOrgError('BAD_USER_INPUT')).toBe(400)
    expect(statusForOrgError('LAST_OWNER')).toBe(409)
    expect(statusForOrgError('RATE_LIMITED')).toBe(429)
    expect(statusForOrgError('SERVICE_UNAVAILABLE')).toBe(503)
    expect(statusForOrgError('NETWORK')).toBe(502)
    expect(orgErrorText('BAD_USER_INPUT', ' The handle is malformed ')).toBe('The handle is malformed')
    expect(orgErrorText('LAST_OWNER', 'ignored')).toBe('An organisation always needs an owner. Add another owner first.')
  })
})

test.describe('orgsRequest', () => {
  test('maps GraphQL error codes and fields', async () => {
    await fixtureStub({ id: 'org-client', match: 'OrgClientProbe', variables: 'org-client-1', response: graphqlError('Only one owner left', 'LAST_OWNER') })
    await fixtureStub({ id: 'org-client', match: 'OrgClientProbe', variables: 'org-client-2', response: graphqlError('Bad handle', 'BAD_USER_INPUT', { field: 'handle' }) })
    const probe = 'query OrgClientProbe($id: String) { organization(id: $id) { id } }'
    const last = await orgsRequest(probe, { id: 'org-client-1' }, { endpoint: ORGS }).catch((e: unknown) => e)
    expect(last).toBeInstanceOf(OrgApiError)
    expect(last).toMatchObject({ code: 'LAST_OWNER', field: null, message: 'Only one owner left' })
    const bad = await orgsRequest(probe, { id: 'org-client-2' }, { endpoint: ORGS }).catch((e: unknown) => e)
    expect(bad).toMatchObject({ code: 'BAD_USER_INPUT', field: 'handle' })
  })

  test('sends the bearer only when given one, and reads an outage as NETWORK', async () => {
    const probe = 'query OrgClientBearer($id: String) { organization(id: $id) { id } }'
    await orgsRequest(probe, { id: 'org-client-3' }, { endpoint: ORGS, bearer: 'tok-1' })
    await orgsRequest(probe, { id: 'org-client-4' }, { endpoint: ORGS })
    const seen = await stubRequests('OrgClientBearer')
    expect(seen.find((r) => r.variables.id === 'org-client-3')?.headers.authorization).toBe('Bearer tok-1')
    expect(seen.find((r) => r.variables.id === 'org-client-4')?.headers.authorization).toBeUndefined()
    const down = await orgsRequest(probe, {}, { endpoint: 'http://127.0.0.1:9/graphql/renown-orgs' }).catch((e: unknown) => e)
    expect(down).toMatchObject({ code: 'NETWORK' })
    const fromClient = await new GraphQLClient(ORGS).request(probe, { id: 'org-client-1' }).catch((e: unknown) => e)
    expect(toOrgApiError(fromClient).code).toBe('NETWORK')
    expect(toOrgApiError(new OrgApiError('FORBIDDEN', 'x')).code).toBe('FORBIDDEN')
  })
})
```

(The last `GraphQLClient` call hits `OrgClientBearer`'s unscripted default, which is not an error: `toOrgApiError` of a non-error value is `NETWORK`.)

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-client.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../lib/orgs/errors'`.

- [ ] **Step 3: Add the signed-message copy**

Create `services/org-signed-messages.ts`:

```ts
// Canonical messages a wallet personal_signs to authorise a renown-orgs write
// (organisations on the switchboard). The code below is copied verbatim from
// renown-package sdk/orgs.ts (exported as @powerhousedao/renown-package/orgs;
// the renown-orgs subgraph imports the same file), so the browser hashes
// exactly the bytes the switchboard hashes. e2e/org-client.spec.ts pins it
// against renown-package's vectors. Do not reformat.

/** Organisation roles, highest first. */
export const ORG_ROLES = ["OWNER", "ADMIN", "PUBLISHER", "MEMBER"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

const RANK: Record<OrgRole, number> = { MEMBER: 0, PUBLISHER: 1, ADMIN: 2, OWNER: 3 };

/** The role named by `value` (any case, trimmed), or null. */
export function parseOrgRole(value: string): OrgRole | null {
  const upper = value.trim().toUpperCase();
  return Object.hasOwn(RANK, upper) ? (upper as OrgRole) : null;
}

/** True when `role` is `min` or higher; unknown roles never qualify. */
export function roleAtLeast(role: string, min: string): boolean {
  const have = parseOrgRole(role);
  const need = parseOrgRole(min);
  return have !== null && need !== null && RANK[have] >= RANK[need];
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : sortKeys(item)));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) out[key] = sortKeys(record[key]);
    }
    return out;
  }
  return value;
}

/** JSON with object keys sorted recursively, no whitespace, undefined dropped and null kept. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? "null";
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The message a wallet personal_signs to authorise a renown-orgs field
 * (mutation, or a query that needs a caller) without a bearer:
 *   Renown organization <field> <orgId or -> <sha256 hex of canonicalJson(args)> at <timestamp>
 * `args` are the field's arguments exactly as sent; `auth` and `orgId` are
 * dropped from them before hashing. `timestamp`: ISO-8601 with a zone,
 * within 10 minutes of the server's clock.
 */
export async function orgMessage(
  mutation: string,
  orgId: string | null | undefined,
  args: Record<string, unknown>,
  timestamp: string,
): Promise<string> {
  const { auth: _auth, orgId: _orgId, ...rest } = args;
  return `Renown organization ${mutation} ${orgId || "-"} ${await sha256Hex(canonicalJson(rest))} at ${timestamp}`;
}
```

If `pnpm lint` flags the unused `_auth`/`_orgId` bindings, add `// eslint-disable-next-line @typescript-eslint/no-unused-vars -- copied verbatim from renown-package sdk/orgs.ts` above that line; change nothing else.

- [ ] **Step 4: Add errors and handles**

Create `lib/orgs/errors.ts`:

```ts
// The renown-orgs error codes (renown-package API contract, "Calling
// conventions"), the HTTP status /api/org answers for each, and what the site
// tells people. Pure.

export const ORG_ERROR_CODES = [
  'BAD_USER_INPUT',
  'FORBIDDEN',
  'NOT_FOUND',
  'HANDLE_TAKEN',
  'HANDLE_RESERVED',
  'LAST_OWNER',
  'LIMIT_REACHED',
  'DOMAIN_TAKEN',
  'DOMAIN_PROOF_MISSING',
  'ORG_HAS_APPS',
  'APP_FROZEN',
  'PROPOSAL_NOT_EXECUTABLE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
] as const
export type OrgErrorCode = (typeof ORG_ERROR_CODES)[number]

/** Failures around the switchboard: a declined signature, no wallet for the session, no usable answer. */
export type OrgClientCode = 'DECLINED' | 'NO_WALLET' | 'NETWORK'
export type OrgFailureCode = OrgErrorCode | OrgClientCode

export function isOrgErrorCode(value: unknown): value is OrgErrorCode {
  return typeof value === 'string' && (ORG_ERROR_CODES as readonly string[]).includes(value)
}

const STATUS: Record<OrgErrorCode, number> = {
  BAD_USER_INPUT: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  HANDLE_TAKEN: 409,
  HANDLE_RESERVED: 409,
  LAST_OWNER: 409,
  LIMIT_REACHED: 429,
  DOMAIN_TAKEN: 409,
  DOMAIN_PROOF_MISSING: 409,
  ORG_HAS_APPS: 409,
  APP_FROZEN: 409,
  PROPOSAL_NOT_EXECUTABLE: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
}

/** The status /api/org/<mutation> answers for a refusal; 502 when the switchboard gave no usable answer. */
export function statusForOrgError(code: OrgFailureCode): number {
  return isOrgErrorCode(code) ? STATUS[code] : 502
}

const TEXT: Record<OrgFailureCode, string> = {
  BAD_USER_INPUT: 'Renown did not accept this value.',
  FORBIDDEN:
    'You are not allowed to do this, or Renown did not accept the signature. Check that your device clock is right and try again.',
  NOT_FOUND: 'This no longer exists. Reload the page.',
  HANDLE_TAKEN: 'This handle is taken.',
  HANDLE_RESERVED: 'This handle is reserved.',
  LAST_OWNER: 'An organisation always needs an owner. Add another owner first.',
  LIMIT_REACHED: 'A limit was reached, so nothing was changed.',
  DOMAIN_TAKEN: 'Another organisation has already verified this domain.',
  DOMAIN_PROOF_MISSING: 'Renown could not find the proof yet. DNS changes can take a while; check again later.',
  ORG_HAS_APPS: 'Transfer every app away before deleting the organisation.',
  APP_FROZEN: 'This app is frozen by its organisation.',
  PROPOSAL_NOT_EXECUTABLE: 'This proposal cannot run yet.',
  RATE_LIMITED: 'Too many changes in a short time. Wait a minute and try again.',
  SERVICE_UNAVAILABLE: 'Renown is unavailable right now. Try again in a moment.',
  DECLINED: 'Signature declined. Nothing was changed.',
  NO_WALLET: 'Connect the wallet you signed in with to make changes.',
  NETWORK: 'Renown did not answer. Nothing was changed; try again.',
}

/** What to tell someone about a failed organisation request. Input errors carry the server's own sentence. */
export function orgErrorText(code: OrgFailureCode, serverMessage?: string | null): string {
  if (code === 'BAD_USER_INPUT' && serverMessage?.trim()) return serverMessage.trim()
  return TEXT[code]
}
```

Create `lib/orgs/handles.ts`:

```ts
// Organisation handles: the same rule as user handles (one namespace, A1
// ruling 8). The switchboard decides; these only guide the form. Pure.

export const ORG_HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/

/** Words no organisation may take (renown-package A1 ruling 8); people's reserved words are checked by the switchboard. */
export const ORG_RESERVED_HANDLES = ['org', 'orgs', 'new', 'invite', 'invites', 'notifications', 'me', 'verify', 'people', 'search'] as const

export function normalizeOrgHandle(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase()
}

/** Why `handle` (already normalised) cannot be used, or null. */
export function orgHandleProblem(handle: string): string | null {
  if (!handle) return 'Choose a handle.'
  if (!ORG_HANDLE_RE.test(handle)) {
    return 'Use 3 to 30 lowercase letters, digits or hyphens, starting and ending with a letter or digit.'
  }
  if ((ORG_RESERVED_HANDLES as readonly string[]).includes(handle)) return 'This handle is reserved.'
  return null
}

/** A handle suggested from a display name ("Acme Inc. — Zürich" → "acme-inc-zurich"); '' when none fits. */
export function handleFromName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '')
  return ORG_HANDLE_RE.test(slug) ? slug : ''
}

/** A route segment as an organisation lookup: a handle when it looks like one, else an id. */
export function orgRef(ref: string): { id: string } | { handle: string } {
  const lower = ref.trim().toLowerCase()
  return ORG_HANDLE_RE.test(lower) ? { handle: lower } : { id: ref.trim() }
}
```

- [ ] **Step 5: Add the read client**

Create `services/orgs.ts`:

```ts
// Renown organisations, read from renown-package's renown-orgs subgraph
// (<switchboard>/graphql/renown-orgs). Public reads carry nothing; reads about
// the visitor send the Renown bearer. Signed writes do not go through here:
// services/org-client-write.ts posts them to /api/org/<mutation>. The one
// bearer write is markNotificationsRead (it changes only the caller's inbox).
import { ClientError, GraphQLClient } from 'graphql-request'
import { isOrgErrorCode, type OrgFailureCode } from '../lib/orgs/errors'
import { switchboardOrigin } from './media'
import type { OrgRole } from './org-signed-messages'

export type { OrgRole }

export type OrgMemberStatus = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'LEFT' | 'REMOVED' | 'REVOKED' | 'EXPIRED'

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
  'id' | 'did' | 'handle' | 'name' | 'bio' | 'avatar' | 'verifiedDomains' | 'memberCount' | 'archived' | 'takenDown' | 'notAffiliatedWith'
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
  ) {
    super(message)
    this.name = 'OrgApiError'
  }
}

/** Any thrown value as an OrgApiError: the GraphQL error's code and field, else NETWORK. */
export function toOrgApiError(error: unknown): OrgApiError {
  if (error instanceof OrgApiError) return error
  if (error instanceof ClientError) {
    const first = error.response.errors?.[0]
    const extensions = (first?.extensions ?? {}) as { code?: unknown; field?: unknown }
    if (first && isOrgErrorCode(extensions.code)) {
      return new OrgApiError(extensions.code, first.message, typeof extensions.field === 'string' ? extensions.field : null)
    }
  }
  return new OrgApiError('NETWORK', 'Renown did not answer')
}

export function orgsEndpoint(): string {
  return `${switchboardOrigin()}/graphql/renown-orgs`
}

/** One renown-orgs request. Throws OrgApiError. */
export async function orgsRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { bearer?: string | null; endpoint?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = options.bearer ? { Authorization: `Bearer ${options.bearer}` } : {}
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
  return Array.from((value ?? '').trim()).slice(0, ORG_QUERY_MAX).join('').trim()
}

/** A blank query lists every listed organisation; otherwise 2 characters are needed. */
export function isOrgSearchable(query: string): boolean {
  return query === '' || Array.from(query).length >= 2
}

/** An organisation by id or handle; null when there is none. */
export async function fetchOrganization(ref: { id: string } | { handle: string }, bearer?: string | null): Promise<Organization | null> {
  const data = await orgsRequest<{ organization: Organization | null }>(
    `query OrgByRef($id: String, $handle: String) { organization(id: $id, handle: $handle) { ${ORG_FIELDS} } }`,
    ref,
    { bearer },
  )
  return data.organization
}

/** One page of listed organisations; a blank query lists them all. */
export async function searchOrganizations(query: string, after: string | null = null): Promise<OrgSearchPage> {
  const data = await orgsRequest<{ organizationSearch: OrgSearchPage }>(
    `query OrgSearch($query: String, $limit: Int, $after: String) { organizationSearch(query: $query, limit: $limit, after: $after) { items { ${ORG_CARD_FIELDS} } next } }`,
    { query, limit: ORGS_PAGE_SIZE, after },
  )
  return data.organizationSearch
}

/** Public memberships of `address`; with that address's bearer, all its ACTIVE ones (hidden included). */
export async function organizationsByMember(address: string, bearer?: string | null): Promise<OrgAffiliation[]> {
  const data = await orgsRequest<{ organizationsByMember: OrgAffiliation[] }>(
    `query OrgsByMember($address: String!) { organizationsByMember(address: $address) { role hidden org { ${ORG_SUMMARY_FIELDS} archived } } }`,
    { address: address.toLowerCase() },
    { bearer },
  )
  return data.organizationsByMember
}

/** The public member list, or (for members, with their bearer) every active member. */
export async function organizationMembers(orgId: string, includeInactive: boolean, bearer?: string | null): Promise<OrgMember[]> {
  const data = await orgsRequest<{ organizationMembers: OrgMember[] }>(
    `query OrgMembers($orgId: String!, $includeInactive: Boolean) { organizationMembers(orgId: $orgId, includeInactive: $includeInactive) { ${MEMBER_FIELDS} } }`,
    includeInactive ? { orgId, includeInactive } : { orgId },
    { bearer },
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

export async function orgInviteLinks(orgId: string, bearer: string | null): Promise<OrgInviteLink[]> {
  const data = await orgsRequest<{ orgInviteLinks: OrgInviteLink[] }>(
    `query OrgInviteLinks($orgId: String!) { orgInviteLinks(orgId: $orgId) { ${LINK_FIELDS} } }`,
    { orgId },
    { bearer },
  )
  return data.orgInviteLinks
}

export async function myOrgInvites(bearer: string | null): Promise<OrgInvite[]> {
  const data = await orgsRequest<{ myOrgInvites: OrgInvite[] }>(`query MyOrgInvites { myOrgInvites { ${INVITE_FIELDS} } }`, {}, { bearer })
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
export async function markNotificationsRead(target: { ids: string[] } | { all: true }, bearer: string | null): Promise<number> {
  const data = await orgsRequest<{ markNotificationsRead: number }>(
    'mutation MarkNotificationsRead($ids: [String!], $all: Boolean) { markNotificationsRead(ids: $ids, all: $all) }',
    target,
    { bearer },
  )
  return data.markNotificationsRead
}

export async function fetchOrganizationStats(orgId: string): Promise<OrganizationStats | null> {
  const data = await orgsRequest<{ organizationStats: OrganizationStats | null }>(
    'query OrganizationStats($orgId: String!) { organizationStats(orgId: $orgId) { orgId apps activeUsers30d activeDelegations attestations30d } }',
    { orgId },
  )
  return data.organizationStats
}

/** The did:web document JSON (a string), or null when unknown or taken down. */
export async function fetchOrganizationDidDocument(orgId: string): Promise<string | null> {
  const data = await orgsRequest<{ organizationDidDocument: string | null }>(
    'query OrgDidDocument($orgId: String!) { organizationDidDocument(orgId: $orgId) }',
    { orgId },
  )
  return data.organizationDidDocument
}
```

- [ ] **Step 6: Add the mutation registry**

Create `services/org-mutations.ts`:

```ts
// Every renown-orgs mutation renown.id signs, with its arguments exactly as in
// the API contract (renown-package docs/superpowers/plans/2026-10-12-orgs-a1-core.md,
// appendix) and the fields the UI reads back. /api/org/<mutation> forwards only
// these, with only these arguments. B2 adds its mutations here.
import {
  INVITE_FIELDS,
  LINK_FIELDS,
  MEMBER_FIELDS,
  ORG_FIELDS,
  PROPOSAL_FIELDS,
  TEAM_FIELDS,
} from './orgs'

export interface OrgMutationSpec {
  /** Argument name → GraphQL type, in SDL order (`auth: OrgAuthInput` is added to every one). */
  args: Readonly<Record<string, string>>
  /** Selection set of the result; '' for a scalar result. */
  select: string
}

export const ORG_MUTATIONS = {
  createOrganization: {
    args: { handle: 'String!', name: 'String!', bio: 'String', website: 'String', links: '[OrgLinkInput!]', listed: 'Boolean', membersPublic: 'Boolean' },
    select: ORG_FIELDS,
  },
  updateOrganization: {
    args: { orgId: 'String!', name: 'String', bio: 'String', website: 'String', avatar: 'String', links: '[OrgLinkInput!]', membersPublic: 'Boolean' },
    select: ORG_FIELDS,
  },
  setOrgListed: { args: { orgId: 'String!', listed: 'Boolean!' }, select: ORG_FIELDS },
  inviteOrgMember: { args: { orgId: 'String!', invitee: 'String!', role: 'OrgRole!' }, select: INVITE_FIELDS },
  respondToOrgInvite: { args: { orgId: 'String!', inviteId: 'String!', accept: 'Boolean!' }, select: MEMBER_FIELDS },
  revokeOrgInvite: { args: { orgId: 'String!', inviteId: 'String!' }, select: INVITE_FIELDS },
  createOrgInviteLink: {
    args: { orgId: 'String!', role: 'OrgRole!', maxUses: 'Int!', expiresAt: 'String!' },
    select: `link { ${LINK_FIELDS} } token`,
  },
  revokeOrgInviteLink: { args: { orgId: 'String!', linkId: 'String!' }, select: LINK_FIELDS },
  acceptOrgInviteLink: { args: { token: 'String!' }, select: MEMBER_FIELDS },
  leaveOrganization: { args: { orgId: 'String!' }, select: '' },
  removeOrgMember: { args: { orgId: 'String!', address: 'String!' }, select: MEMBER_FIELDS },
  setOrgMemberRole: { args: { orgId: 'String!', address: 'String!', role: 'OrgRole!' }, select: MEMBER_FIELDS },
  setOrgMemberAppScope: { args: { orgId: 'String!', address: 'String!', appScope: 'OrgAppScopeInput!' }, select: MEMBER_FIELDS },
  setMyOrgMembershipHidden: { args: { orgId: 'String!', hidden: 'Boolean!' }, select: MEMBER_FIELDS },
  createOrgTeam: { args: { orgId: 'String!', slug: 'String!', name: 'String!', appDids: '[String!]' }, select: TEAM_FIELDS },
  updateOrgTeam: {
    args: { orgId: 'String!', teamId: 'String!', slug: 'String', name: 'String', appDids: '[String!]' },
    select: TEAM_FIELDS,
  },
  deleteOrgTeam: { args: { orgId: 'String!', teamId: 'String!' }, select: '' },
  setOrgTeamMembers: { args: { orgId: 'String!', teamId: 'String!', addresses: '[String!]!' }, select: TEAM_FIELDS },
  proposeOrgChange: {
    args: { orgId: 'String!', kind: 'OrgProposalKind!', payload: 'OrgProposalPayloadInput!' },
    select: PROPOSAL_FIELDS,
  },
} as const satisfies Record<string, OrgMutationSpec>

export type OrgMutationName = keyof typeof ORG_MUTATIONS

export function isOrgMutationName(value: string): value is OrgMutationName {
  return Object.hasOwn(ORG_MUTATIONS, value)
}

function spec(name: OrgMutationName): OrgMutationSpec {
  return ORG_MUTATIONS[name]
}

/** The mutation document: every declared argument as a variable, plus auth. Absent variables stay absent arguments. */
export function mutationDocument(name: OrgMutationName): string {
  const { args, select } = spec(name)
  const types: Record<string, string> = { ...args, auth: 'OrgAuthInput' }
  const names = Object.keys(types)
  const variables = names.map((arg) => `$${arg}: ${types[arg]}`).join(', ')
  const call = names.map((arg) => `${arg}: $${arg}`).join(', ')
  const operation = name.charAt(0).toUpperCase() + name.slice(1)
  return `mutation ${operation}(${variables}) { ${name}(${call})${select ? ` { ${select} }` : ''} }`
}

/** The first argument that is not declared, or that is required and missing; null when the arguments fit. */
export function argsProblem(name: OrgMutationName, args: Record<string, unknown>): string | null {
  const declared = spec(name).args
  const unknown = Object.keys(args).find((key) => !Object.hasOwn(declared, key))
  if (unknown) return unknown
  const missing = Object.entries(declared).find(([key, type]) => type.endsWith('!') && (args[key] === undefined || args[key] === null))
  return missing ? missing[0] : null
}
```

- [ ] **Step 7: Add the stub defaults and the shared fixtures**

In `e2e/support/stub-switchboard.mjs`, replace the `DEFAULT_DATA` object with:

```js
const DEFAULT_DATA = {
  renownUsers: [],
  renownUser: null,
  renownCredentials: [],
  appProfile: null,
  appProfilesByPublisher: [],
  appProfiles: { items: [], next: null },
  renownUserSearch: { items: [], next: null },
  appProfileCategories: [],
  renownNetworkStats: null,
  appStats: null,
  userStats: [],
  // renown-orgs (/graphql/renown-orgs): no organisations, nobody belongs to one.
  organization: null,
  organizationSearch: { items: [], next: null },
  organizationsByMember: [],
  organizationMembers: [],
  orgInvites: [],
  orgInviteLinks: [],
  myOrgInvites: [],
  orgInviteLink: null,
  orgHandleAvailability: { handle: '', available: true, reason: null },
  myNotifications: { items: [], next: null },
  myUnreadNotificationCount: 0,
  organizationStats: null,
  organizationDidDocument: null,
}
```

Create `e2e/support/org-fixtures.ts`:

```ts
// Organisation data for the org specs and the layout guards, and a helper that
// answers the browser's renown-orgs reads by operation name in the page
// (parallel-safe; server-side reads use fixtureStub with unique variables).
import type { Page, Route } from '@playwright/test'
import type {
  Organization,
  OrgCard,
  OrgInvite,
  OrgInviteLink,
  OrgMember,
  OrgMembership,
  OrgRole,
  OrgSummary,
} from '../../services/orgs'
import { fixtureStub, STUB_SWITCHBOARD_URL } from './stub-switchboard-client'

export const APP_DID_A = 'did:key:z6MkAcmeFixtureAppAxxxxxxxxxxxxxxxxxxxxxxxxxxx1'
export const APP_DID_B = 'did:key:z6MkAcmeFixtureAppBxxxxxxxxxxxxxxxxxxxxxxxxxxx2'
const AT = '2026-10-01T10:00:00.000Z'

export function orgSummary(over: Partial<OrgSummary> = {}): OrgSummary {
  const id = over.id ?? 'org-fixture'
  return { id, did: `did:web:www.renown.id:org:${id}`, handle: 'acme', name: 'Acme', avatar: null, verifiedDomains: [], ...over }
}

export function organization(over: Partial<Organization> = {}): Organization {
  return {
    ...orgSummary(over),
    bio: null,
    website: null,
    links: [],
    listed: true,
    membersPublic: true,
    archived: false,
    takenDown: false,
    createdBy: '0x0a00000000000000000000000000000000000001',
    createdAt: AT,
    updatedAt: AT,
    notAffiliatedWith: null,
    ownerCount: 2,
    memberCount: 3,
    securityWarnings: [],
    apps: [],
    teams: [],
    viewerMembership: null,
    ...over,
  }
}

export function membership(orgId: string, address: string, role: OrgRole, over: Partial<OrgMembership> = {}): OrgMembership {
  const all = role === 'OWNER' || role === 'ADMIN'
  return {
    orgId,
    address: address.toLowerCase(),
    role,
    status: 'ACTIVE',
    appScope: { all, appDids: [] },
    effectiveScope: { all, appDids: [] },
    teams: [],
    ...over,
  }
}

export function orgMember(over: Partial<OrgMember> & { address: string }): OrgMember {
  return {
    id: `m-${over.address.slice(2, 10)}`,
    orgId: 'org-fixture',
    role: 'MEMBER',
    status: 'ACTIVE',
    appScope: { all: false, appDids: [] },
    hidden: false,
    invitedBy: null,
    invitedAt: AT,
    joinedAt: AT,
    endedAt: null,
    updatedAt: AT,
    expiresAt: null,
    teams: [],
    handle: null,
    displayName: null,
    avatar: null,
    ...over,
    address: over.address.toLowerCase(),
  }
}

export function orgInvite(over: Partial<OrgInvite> & { address: string }): OrgInvite {
  return {
    id: `inv-${over.address.slice(2, 10)}`,
    orgId: 'org-fixture',
    org: orgSummary({ id: over.orgId ?? 'org-fixture' }),
    role: 'MEMBER',
    status: 'INVITED',
    invitedBy: null,
    createdAt: AT,
    expiresAt: '2026-10-15T10:00:00.000Z',
    ...over,
  }
}

export function orgInviteLink(over: Partial<OrgInviteLink> = {}): OrgInviteLink {
  return {
    id: 'link-1',
    orgId: 'org-fixture',
    role: 'MEMBER',
    maxUses: 10,
    uses: 2,
    expiresAt: '2026-10-19T10:00:00.000Z',
    revoked: false,
    createdBy: '0x0a00000000000000000000000000000000000001',
    createdAt: AT,
    ...over,
  }
}

type Answer = (variables: Record<string, unknown>) => unknown

/**
 * Answers the browser's renown-orgs requests whose operation name is in
 * `answers` (the answer is wrapped in { data }); every other request falls back
 * to earlier route handlers, then to the stub switchboard.
 */
export async function serveOrgReads(page: Page, answers: Record<string, Answer>): Promise<void> {
  await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
    const body = route.request().postDataJSON() as { query: string; variables?: Record<string, unknown> }
    const name = /^\s*(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1]
    const answer = name ? answers[name] : undefined
    // fallback, not continue: an earlier handler (another serveOrgReads) may answer it; else the stub does.
    if (!answer) return route.fallback()
    return route.fulfill({ json: { data: answer(body.variables ?? {}) } })
  })
}

/** The bare /orgs listing (server-rendered): one answer shared by every spec that opens /orgs. */
export const DIRECTORY_ORGS: OrgCard[] = [
  {
    ...orgSummary({ id: 'org-dir-1', handle: 'acme-directory', name: 'Acme Directory Works', verifiedDomains: ['acme-directory.example'] }),
    bio: 'Builds the directory every organisation is listed in.',
    memberCount: 12,
    archived: false,
    takenDown: false,
    notAffiliatedWith: null,
  },
  {
    ...orgSummary({ id: 'org-dir-2', handle: 'a-very-long-organisation-handle', name: 'The Extraordinarily Long Named Cooperative of Layout Testers' }),
    bio: 'A long bio that goes on for a while so the card has to clamp it to two lines instead of growing on small screens.',
    memberCount: 1,
    archived: false,
    takenDown: false,
    notAffiliatedWith: orgSummary({ id: 'org-dir-1', handle: 'acme-directory', name: 'Acme Directory Works' }),
  },
]

export async function installDirectoryFixture(): Promise<void> {
  await fixtureStub({
    match: 'query OrgSearch',
    variables: '"query":"",',
    response: { data: { organizationSearch: { items: DIRECTORY_ORGS, next: null } } },
  })
}
```

(`installDirectoryFixture` matches `"query":"",` — the bare listing sends `{"query":"","limit":24,"after":null}` — so a `?q=` search never hits it.)

- [ ] **Step 8: Run the spec**

Run: `pnpm exec playwright test e2e/org-client.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS (12 tests).

- [ ] **Step 9: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: no lint errors; "Wallet code check passed".

```bash
git add services/org-signed-messages.ts services/orgs.ts services/org-mutations.ts lib/orgs/errors.ts lib/orgs/handles.ts e2e/support/stub-switchboard.mjs e2e/support/org-fixtures.ts e2e/org-client.spec.ts
git commit -m "feat(orgs): renown-orgs client, signed-message copy and mutation registry"
```

---

### Task 2: Signed writes — `/api/org/[mutation]`, the browser writer, `useRemote`

**Files:**
- Create: `services/org-write.ts`, `pages/api/org/[mutation].ts`, `services/org-client-write.ts`, `hooks/use-remote.ts`
- Test: `e2e/org-write.spec.ts`

**Interfaces:**
- Consumes: `ORG_MUTATIONS`, `isOrgMutationName`, `argsProblem`, `mutationDocument` (Task 1); `orgsRequest`, `toOrgApiError`, `OrgApiError` (Task 1); `orgMessage` (Task 1); `statusForOrgError`, `orgErrorText`, `isOrgErrorCode` (Task 1); `allowCors` (`utils/allow-cors.ts`).
- Produces:
  - `services/org-write.ts`: `interface OrgAuth { address: string; signature: string; timestamp: string }`, `parseOrgAuth(value: unknown): OrgAuth | null`, `forwardOrgMutation(name: OrgMutationName, args: Record<string, unknown>, auth: OrgAuth): Promise<unknown>`.
  - `POST /api/org/<mutation>` with JSON `{ args, auth }` → `200 { data }` or `{ error, code, field }` with Rulings 2's statuses.
  - `services/org-client-write.ts`: `type OrgWriteResult<T> = { ok: true; data: T } | { ok: false; code: OrgFailureCode; field: string | null; message: string }`, `interface OrgSigner { address: string; signMessage: (message: string) => Promise<string> }`, `signedOrgWrite<T>(name, args, signer: OrgSigner | null, options?: { now?: Date; fetchImpl?: typeof fetch; base?: string }): Promise<OrgWriteResult<T>>`, `interface OrgWriter { write<T>(name: OrgMutationName, args: Record<string, unknown>): Promise<OrgWriteResult<T>> }`, `orgWriter(signer: OrgSigner | null): OrgWriter`, `sessionSigner(session: { address: string; signMessage: ((message: string) => Promise<string>) | null }): OrgSigner | null`.
  - `hooks/use-remote.ts`: `type Remote<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: OrgApiError }`, `useRemote<T>(key: string | null, load: () => Promise<T>): { state: Remote<T>; reload: () => void; set: (value: T) => void }` (a reload keeps showing the last value until the new one arrives; `load` must be stable, e.g. `useCallback`).

- [ ] **Step 1: Write the failing test**

Create `e2e/org-write.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { verifyMessage } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { orgMessage } from '../services/org-signed-messages'
import { signedOrgWrite, type OrgSigner } from '../services/org-client-write'
import { fixtureStub, graphqlError, stubRequests } from './support/stub-switchboard-client'
import { orgInvite } from './support/org-fixtures'

// The write path: the API route against the stub switchboard (request
// fixture), and the browser writer in the Playwright worker with a real key.
const account = privateKeyToAccount(generatePrivateKey())
const signer: OrgSigner = { address: account.address, signMessage: (message) => account.signMessage({ message }) }
const AUTH = { address: account.address, signature: '0x1234', timestamp: '2026-10-12T12:00:00.000Z' }

test.describe('/api/org/[mutation]', () => {
  test('refuses other methods, unknown mutations, bad arguments and a missing signature', async ({ request }) => {
    expect((await request.get('/api/org/inviteOrgMember')).status()).toBe(405)
    const unknown = await request.post('/api/org/resolveOrgReport', { data: { args: {}, auth: AUTH } })
    expect(unknown.status()).toBe(404)
    expect(await unknown.json()).toMatchObject({ code: 'NOT_FOUND' })
    const noAuth = await request.post('/api/org/inviteOrgMember', { data: { args: { orgId: 'o', invitee: 'bob', role: 'MEMBER' } } })
    expect(noAuth.status()).toBe(401)
    expect(await noAuth.json()).toMatchObject({ code: 'FORBIDDEN', field: 'auth' })
    const badAuth = await request.post('/api/org/inviteOrgMember', {
      data: { args: { orgId: 'o', invitee: 'bob', role: 'MEMBER' }, auth: { ...AUTH, address: 'alice' } },
    })
    expect(badAuth.status()).toBe(401)
    const smuggled = await request.post('/api/org/inviteOrgMember', {
      data: { args: { orgId: 'o', invitee: 'bob', role: 'MEMBER', auth: AUTH }, auth: AUTH },
    })
    expect(smuggled.status()).toBe(400)
    expect(await smuggled.json()).toMatchObject({ code: 'BAD_USER_INPUT', field: 'auth' })
    const missing = await request.post('/api/org/inviteOrgMember', { data: { args: { orgId: 'o', invitee: 'bob' }, auth: AUTH } })
    expect(await missing.json()).toMatchObject({ code: 'BAD_USER_INPUT', field: 'role' })
    const notObject = await request.post('/api/org/inviteOrgMember', { data: { args: 'x', auth: AUTH } })
    expect(await notObject.json()).toMatchObject({ code: 'BAD_USER_INPUT', field: 'args' })
  })

  test('forwards the arguments and the signature unchanged and returns the result', async ({ request }) => {
    const invite = orgInvite({ address: '0xb0b0000000000000000000000000000000000002', orgId: 'org-write-1' })
    await fixtureStub({ match: 'mutation InviteOrgMember', variables: 'org-write-1', response: { data: { inviteOrgMember: invite } } })
    const args = { orgId: 'org-write-1', invitee: 'bob', role: 'PUBLISHER' }
    const res = await request.post('/api/org/inviteOrgMember', { data: { args, auth: AUTH } })
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ data: invite })
    const [sent] = (await stubRequests('mutation InviteOrgMember')).filter((r) => r.variables.orgId === 'org-write-1')
    expect(sent.variables).toEqual({ ...args, auth: AUTH })
    expect(sent.headers.authorization).toBeUndefined()
  })

  test('relays refusals with their code, field and status', async ({ request }) => {
    await fixtureStub({ match: 'mutation LeaveOrganization', variables: 'org-write-2', response: graphqlError('Only owner', 'LAST_OWNER') })
    await fixtureStub({
      match: 'mutation InviteOrgMember',
      variables: 'org-write-3',
      response: graphqlError('No Renown user has the handle nobody', 'BAD_USER_INPUT', { field: 'invitee' }),
    })
    const last = await request.post('/api/org/leaveOrganization', { data: { args: { orgId: 'org-write-2' }, auth: AUTH } })
    expect(last.status()).toBe(409)
    expect(await last.json()).toMatchObject({ code: 'LAST_OWNER' })
    const bad = await request.post('/api/org/inviteOrgMember', {
      data: { args: { orgId: 'org-write-3', invitee: 'nobody', role: 'MEMBER' }, auth: AUTH },
    })
    expect(bad.status()).toBe(400)
    expect(await bad.json()).toMatchObject({ code: 'BAD_USER_INPUT', field: 'invitee', error: 'No Renown user has the handle nobody' })
  })
})

test.describe('signedOrgWrite', () => {
  const now = new Date('2026-10-12T12:00:00.000Z')

  test('signs exactly the arguments it posts (undefined dropped, null kept)', async () => {
    const posts: { url: string; body: { args: Record<string, unknown>; auth: { address: string; signature: `0x${string}`; timestamp: string } } }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      posts.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(JSON.stringify({ data: { id: 'org-1' } }), { status: 200 })
    }) as unknown as typeof fetch
    const result = await signedOrgWrite('updateOrganization', { orgId: 'org-1', name: 'Acme', bio: undefined, website: null }, signer, { now, fetchImpl })
    expect(result).toEqual({ ok: true, data: { id: 'org-1' } })
    const [posted] = posts
    expect(posted.url).toBe('/api/org/updateOrganization')
    expect(posted.body.args).toEqual({ orgId: 'org-1', name: 'Acme', website: null })
    expect(posted.body.auth.timestamp).toBe(now.toISOString())
    const message = await orgMessage('updateOrganization', 'org-1', posted.body.args, now.toISOString())
    expect(await verifyMessage({ address: account.address, message, signature: posted.body.auth.signature })).toBe(true)
  })

  test('reports a declined signature, a missing wallet, no answer and a refusal', async () => {
    const declined = await signedOrgWrite('leaveOrganization', { orgId: 'o' }, { address: account.address, signMessage: () => Promise.reject(new Error('4001')) }, { now })
    expect(declined).toMatchObject({ ok: false, code: 'DECLINED', message: 'Signature declined. Nothing was changed.' })
    expect(await signedOrgWrite('leaveOrganization', { orgId: 'o' }, null, { now })).toMatchObject({ ok: false, code: 'NO_WALLET' })
    const offline = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(await signedOrgWrite('leaveOrganization', { orgId: 'o' }, signer, { now, fetchImpl: offline })).toMatchObject({ ok: false, code: 'NETWORK' })
    const refused = (async () => new Response(JSON.stringify({ error: 'x', code: 'LAST_OWNER' }), { status: 409 })) as unknown as typeof fetch
    expect(await signedOrgWrite('leaveOrganization', { orgId: 'o' }, signer, { now, fetchImpl: refused })).toEqual({
      ok: false,
      code: 'LAST_OWNER',
      field: null,
      message: 'An organisation always needs an owner. Add another owner first.',
    })
  })

  test('goes through the real route to the switchboard', async ({ baseURL }) => {
    const invite = orgInvite({ address: '0xb0b0000000000000000000000000000000000002', orgId: 'org-write-4' })
    await fixtureStub({ match: 'mutation InviteOrgMember', variables: 'org-write-4', response: { data: { inviteOrgMember: invite } } })
    const result = await signedOrgWrite('inviteOrgMember', { orgId: 'org-write-4', invitee: 'bob', role: 'MEMBER' }, signer, { base: baseURL })
    expect(result).toEqual({ ok: true, data: invite })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-write.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../services/org-client-write'`.

- [ ] **Step 3: Implement the server side**

Create `services/org-write.ts`:

```ts
// Server side of /api/org/<mutation>: forwards a signed renown-orgs mutation to
// the switchboard. The switchboard verifies the signature itself (it hashes the
// arguments it receives), so nothing here may add, drop or change an argument.
import { mutationDocument, type OrgMutationName } from './org-mutations'
import { orgsRequest } from './orgs'

export interface OrgAuth {
  address: string
  signature: string
  timestamp: string
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const SIGNATURE_RE = /^0x[0-9a-fA-F]+$/

/** The `auth` of a request body, or null when it is missing or malformed. */
export function parseOrgAuth(value: unknown): OrgAuth | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { address, signature, timestamp } = value as Record<string, unknown>
  if (typeof address !== 'string' || !ADDRESS_RE.test(address)) return null
  if (typeof signature !== 'string' || !SIGNATURE_RE.test(signature) || signature.length > 20_000) return null
  if (typeof timestamp !== 'string' || timestamp.length > 40) return null
  return { address, signature, timestamp }
}

/** Runs the mutation with `auth`; resolves with its result field. Throws OrgApiError. */
export async function forwardOrgMutation(name: OrgMutationName, args: Record<string, unknown>, auth: OrgAuth): Promise<unknown> {
  const data = await orgsRequest<Record<string, unknown>>(mutationDocument(name), { ...args, auth })
  return data[name]
}
```

Create `pages/api/org/[mutation].ts`:

```ts
// POST /api/org/<mutation> { args, auth }: a signed renown-orgs write, checked
// against services/org-mutations.ts and forwarded unchanged to the switchboard
// (which verifies the signature). Like /api/profile/update, no request carries
// a bearer.
import type { NextApiRequest, NextApiResponse } from 'next'
import { statusForOrgError } from '../../../lib/orgs/errors'
import { argsProblem, isOrgMutationName } from '../../../services/org-mutations'
import { forwardOrgMutation, parseOrgAuth } from '../../../services/org-write'
import { toOrgApiError } from '../../../services/orgs'
import { allowCors } from '../../../utils/allow-cors'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  const name = String(req.query.mutation ?? '')
  if (!isOrgMutationName(name)) {
    res.status(404).json({ error: 'Unknown organisation action', code: 'NOT_FOUND' })
    return
  }
  const body = (isRecord(req.body) ? req.body : {}) as { args?: unknown; auth?: unknown }
  if (!isRecord(body.args)) {
    res.status(400).json({ error: 'args must be an object', code: 'BAD_USER_INPUT', field: 'args' })
    return
  }
  const problem = argsProblem(name, body.args)
  if (problem) {
    res.status(400).json({ error: `Unexpected or missing argument: ${problem}`, code: 'BAD_USER_INPUT', field: problem })
    return
  }
  const auth = parseOrgAuth(body.auth)
  if (!auth) {
    res.status(401).json({ error: 'A signature is required', code: 'FORBIDDEN', field: 'auth' })
    return
  }
  try {
    res.status(200).json({ data: await forwardOrgMutation(name, body.args, auth) })
  } catch (error) {
    const failure = toOrgApiError(error)
    if (failure.code === 'NETWORK') console.error(`Organisation write ${name} failed:`, error instanceof Error ? error.name : 'error')
    res.status(statusForOrgError(failure.code)).json({ error: failure.message, code: failure.code, field: failure.field })
  }
}

export default allowCors(handler)
```

(The argument check runs before the signature check so that a smuggled `auth` inside `args` is named as the bad field; both answer before anything reaches the switchboard.)

- [ ] **Step 4: Implement the browser writer and `useRemote`**

Create `services/org-client-write.ts`:

```ts
// Browser side of a signed organisation write: personal_sign over orgMessage()
// of exactly the arguments posted, then POST /api/org/<mutation>. Never throws.
import { isOrgErrorCode, orgErrorText, type OrgFailureCode } from '../lib/orgs/errors'
import type { OrgMutationName } from './org-mutations'
import { orgMessage } from './org-signed-messages'

export type OrgWriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: OrgFailureCode; field: string | null; message: string }

export interface OrgSigner {
  address: string
  signMessage: (message: string) => Promise<string>
}

function failure(code: OrgFailureCode, field: string | null = null, serverMessage?: string | null): OrgWriteResult<never> {
  return { ok: false, code, field, message: orgErrorText(code, serverMessage) }
}

export async function signedOrgWrite<T>(
  name: OrgMutationName,
  args: Record<string, unknown>,
  signer: OrgSigner | null,
  options: { now?: Date; fetchImpl?: typeof fetch; base?: string } = {},
): Promise<OrgWriteResult<T>> {
  if (!signer) return failure('NO_WALLET')
  // The bytes that are posted are the bytes that are signed: undefined drops out here, as in JSON.
  const sent = JSON.parse(JSON.stringify(args)) as Record<string, unknown>
  const timestamp = (options.now ?? new Date()).toISOString()
  const orgId = typeof sent.orgId === 'string' ? sent.orgId : null
  let signature: string
  try {
    signature = await signer.signMessage(await orgMessage(name, orgId, sent, timestamp))
  } catch {
    return failure('DECLINED')
  }
  let response: Response
  try {
    response = await (options.fetchImpl ?? fetch)(`${options.base ?? ''}/api/org/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: sent, auth: { address: signer.address, signature, timestamp } }),
    })
  } catch {
    return failure('NETWORK')
  }
  const body = (await response.json().catch(() => ({}))) as { data?: T; code?: unknown; field?: unknown; error?: unknown }
  if (!response.ok) {
    const code = isOrgErrorCode(body.code) ? body.code : 'NETWORK'
    return failure(code, typeof body.field === 'string' ? body.field : null, typeof body.error === 'string' ? body.error : null)
  }
  return { ok: true, data: body.data as T }
}

export interface OrgWriter {
  write<T>(name: OrgMutationName, args: Record<string, unknown>): Promise<OrgWriteResult<T>>
}

/** A writer for one signer (null: every write answers NO_WALLET). */
export function orgWriter(signer: OrgSigner | null): OrgWriter {
  return { write: (name, args) => signedOrgWrite(name, args, signer) }
}

/** The signer of a signed-in session (useMeSession), or null when its wallet is not the session's. */
export function sessionSigner(session: { address: string; signMessage: ((message: string) => Promise<string>) | null }): OrgSigner | null {
  const { signMessage } = session
  return signMessage ? { address: session.address, signMessage } : null
}
```

Create `hooks/use-remote.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { toOrgApiError, type OrgApiError } from '../services/orgs'

export type Remote<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: OrgApiError }

interface Answer<T> {
  /** The key the answer belongs to. */
  base: string
  /** The key plus the reload attempt. */
  full: string
  state: Remote<T>
}

/**
 * One async read, keyed: a new key starts over, `reload` re-reads and keeps
 * showing the last value until the new one arrives, `set` replaces the value
 * (after a write returned it). State is only set in promise callbacks. `load`
 * must be stable (useCallback). A null key reads nothing (loading).
 */
export function useRemote<T>(key: string | null, load: () => Promise<T>): { state: Remote<T>; reload: () => void; set: (value: T) => void } {
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState<Answer<T> | null>(null)
  const full = key === null ? null : `${key}#${attempt}`

  useEffect(() => {
    if (key === null || full === null) return
    let cancelled = false
    load().then(
      (value) => {
        if (!cancelled) setAnswer({ base: key, full, state: { status: 'ready', value } })
      },
      (error: unknown) => {
        if (!cancelled) setAnswer({ base: key, full, state: { status: 'error', error: toOrgApiError(error) } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, full, load])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const set = useCallback(
    (value: T) => {
      if (key !== null && full !== null) setAnswer({ base: key, full, state: { status: 'ready', value } })
    },
    [key, full],
  )

  let state: Remote<T> = { status: 'loading' }
  if (answer && answer.full === full) state = answer.state
  else if (answer && answer.base === key && answer.state.status === 'ready') state = answer.state
  return { state, reload, set }
}
```

- [ ] **Step 5: Run the spec**

Run: `pnpm exec playwright test e2e/org-write.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS (6 tests).

- [ ] **Step 6: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed".

```bash
git add services/org-write.ts "pages/api/org/[mutation].ts" services/org-client-write.ts hooks/use-remote.ts e2e/org-write.spec.ts
git commit -m "feat(orgs): signed organisation writes through /api/org"
```

### Task 3: The public organisation page — `/@handle` branch, `/org/[id]`, `did.json`, "Member of"

**Files:**
- Create: `lib/orgs/format.ts`, `lib/orgs/org-page-data.ts`, `components/org/org-avatar.tsx`, `components/org/org-verification.tsx`, `components/org/org-page.tsx`, `components/profile/member-of.tsx`, `pages/org/[id]/index.tsx`, `pages/api/org-did/[id].ts`
- Modify: `lib/json-ld.ts` (add `organizationJsonLd`), `services/app-profiles.ts` (`listAppProfiles` `orgId`), `pages/profile/[id].tsx` (org branch, `memberOf`), `next.config.ts` (rewrite)
- Test: `e2e/org-page.spec.ts`

**Interfaces:**
- Consumes: `fetchOrganization`, `fetchOrganizationStats`, `organizationMembers`, `organizationsByMember`, `fetchOrganizationDidDocument`, `Organization`, `OrgAffiliation`, `OrgMember`, `OrgSummary`, `OrganizationStats` (Task 1); `orgRef` (Task 1).
- Produces:
  - `lib/orgs/format.ts`: `ROLE_LABELS`, `roleLabel(role: string): string`, `orgPath(handle: string): string` (`/@handle`), `manageHref(handle: string, section?: string): string` (`/org/<handle>/manage/<section>`, default `members`), `plural(count, one, many): string`, `shortAddress(address): string`, `memberLabel(member: { displayName?; handle?; address }): string`, `memberHref(member: { handle?; address }): string`, `inviteLinkUrl(origin: string, token: string): string`, `shortDid(did: string): string`.
  - `lib/orgs/org-page-data.ts`: `interface OrgPageData { org: Organization; stats: OrganizationStats | null; apps: RenownAppProfile[]; members: OrgMember[]; canonicalUrl: string; art: IdentityArtSvgs; qr: QrCode }`, `loadOrgPageData(org: Organization): Promise<OrgPageData>`.
  - `components/org/org-avatar.tsx`: `OrgAvatar({ org: { id; avatar }, className? })`.
  - `components/org/org-verification.tsx`: `OrgVerification({ verifiedDomains })`, `NotAffiliatedNote({ other: OrgSummary })`.
  - `components/org/org-page.tsx`: `OrgPage({ data: OrgPageData })` — B2 adds a Report button to its hero.
  - `components/profile/member-of.tsx`: `MemberOf({ orgs: OrgAffiliation[] })`.
  - `lib/json-ld.ts`: `organizationJsonLd({ org, url, image }): object`.
  - `services/app-profiles.ts`: `listAppProfiles({ limit, after?, category?, orgId? })` (query `AppProfilesByOrg` when `orgId` is given).
  - `GET /org/<id>/did.json` (Rulings 7); `/org/<id or handle>` → `307` to `/@handle`.

- [ ] **Step 1: Write the failing test**

Create `e2e/org-page.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { fixtureStub, graphqlError } from './support/stub-switchboard-client'
import { APP_DID_A, organization, orgMember, orgSummary } from './support/org-fixtures'

// Server-rendered organisation pages: reads answered by stub fixtures with
// variables no other spec uses (handles acme-page*, the ids below).
const ORG_ID = 'a0c0ffee-0000-4000-8000-00000000a001'
const ORG = organization({
  id: ORG_ID,
  did: `did:web:www.renown.id:org:${ORG_ID}`,
  handle: 'acme-page',
  name: 'Acme Page Works',
  bio: 'We build pages that hold.',
  website: 'https://acme-page.example',
  links: [{ id: 'l1', label: 'GitHub', url: 'https://github.com/acme-page' }],
  verifiedDomains: ['acme-page.example'],
  apps: [{ appDid: APP_DID_A, addedAt: '2026-10-02T10:00:00.000Z', frozen: false }],
  memberCount: 4,
})
const APP = {
  appDid: APP_DID_A,
  documentId: 'doc-org-page-app',
  name: 'Acme Page Ledger',
  tagline: 'Ledgers for pages',
  logo: null,
  website: null,
  publisherDid: ORG.did,
  description: null,
  category: null,
  logoRef: null,
  coverRef: null,
  links: [],
}
const DID_DOC = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: ORG.did,
  alsoKnownAs: ['https://www.renown.id/@acme-page'],
  controller: ['did:pkh:eip155:1:0x0a00000000000000000000000000000000000a11'],
}
const PERSON = {
  documentId: 'doc-org-member',
  username: null,
  ethAddress: '0x0a00000000000000000000000000000000000b22',
  userImage: null,
  displayName: 'Lena Member',
  handle: 'lena-member',
  bio: 'Member of things.',
  links: [],
  avatar: null,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-10-09T10:00:00.000Z',
}

test.beforeAll(async () => {
  const org = (value: unknown) => ({ data: { organization: value } })
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-page"', response: org(ORG) })
  await fixtureStub({ match: 'query OrgByRef', variables: `"id":"${ORG_ID}"`, response: org(ORG) })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: '"acme-page-copy"',
    response: org(
      organization({
        id: 'a0c0ffee-0000-4000-8000-00000000a002',
        handle: 'acme-page-copy',
        name: 'Acme Page Works',
        membersPublic: false,
        notAffiliatedWith: orgSummary({ id: ORG_ID, handle: 'acme-page', name: 'Acme Page Works', verifiedDomains: ['acme-page.example'] }),
      }),
    ),
  })
  await fixtureStub({
    match: 'query OrgByRef',
    variables: '"acme-page-gone"',
    response: org(organization({ id: 'a0c0ffee-0000-4000-8000-00000000a003', handle: 'acme-page-gone', name: 'Gone Works', takenDown: true })),
  })
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-page-down"', response: graphqlError('down', 'SERVICE_UNAVAILABLE') })
  await fixtureStub({
    match: 'query OrganizationStats',
    variables: ORG_ID,
    response: { data: { organizationStats: { orgId: ORG_ID, apps: 1, activeUsers30d: 321, activeDelegations: 5, attestations30d: 2 } } },
  })
  await fixtureStub({ match: 'query AppProfilesByOrg', variables: ORG_ID, response: { data: { appProfiles: { items: [APP], next: null } } } })
  await fixtureStub({
    match: 'query OrgMembers',
    variables: ORG_ID,
    response: {
      data: {
        organizationMembers: [
          orgMember({ orgId: ORG_ID, address: '0x0a00000000000000000000000000000000000a11', displayName: 'Alice Pagewright', handle: 'alice-page', role: 'OWNER' }),
        ],
      },
    },
  })
  await fixtureStub({ match: 'query OrgDidDocument', variables: ORG_ID, response: { data: { organizationDidDocument: JSON.stringify(DID_DOC) } } })
  await fixtureStub({ match: 'renownUsers', variables: '"lena-member"', response: { data: { renownUsers: [PERSON] } } })
  await fixtureStub({
    match: 'query OrgsByMember',
    variables: PERSON.ethAddress,
    response: {
      data: {
        organizationsByMember: [
          { role: 'PUBLISHER', hidden: false, org: { ...orgSummary({ id: ORG_ID, handle: 'acme-page', name: 'Acme Page Works' }), archived: false } },
        ],
      },
    },
  })
})

test.describe('organisation page', () => {
  test('renders an organisation at /@handle with apps, totals, members and JSON-LD', async ({ page }) => {
    const res = await page.goto('/@acme-page')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Acme Page Works' })).toBeVisible()
    await expect(page.getByText('@acme-page', { exact: true })).toBeVisible()
    await expect(page.getByText('Verified: acme-page.example')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Acme Page Ledger' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Members' }).getByText('Alice Pagewright')).toBeVisible()
    await expect(page.getByText('Up to 321')).toBeVisible()
    await expect(page.getByRole('link', { name: 'See in the app directory' })).toHaveAttribute('href', '/apps?org=acme-page')
    await expect(page.getByRole('link', { name: 'DID document' })).toHaveAttribute('href', `/org/${ORG_ID}/did.json`)
    await expect(page).toHaveTitle('Acme Page Works (@acme-page) on Renown')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/@acme-page$/)
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}')
    expect(ld).toMatchObject({ '@type': 'Organization', name: 'Acme Page Works', identifier: ORG.did, alternateName: '@acme-page' })
    expect(ld.sameAs).toEqual(['https://github.com/acme-page', 'https://acme-page.example'])
  })

  test('says when an organisation is unverified and shares a verified one’s name', async ({ page }) => {
    await page.goto('/@acme-page-copy')
    await expect(page.getByText('Unverified organisation')).toBeVisible()
    const note = page.getByRole('note')
    await expect(note).toContainText('Not affiliated with the verified Acme Page Works')
    await expect(note.getByRole('link', { name: 'Acme Page Works' })).toHaveAttribute('href', '/@acme-page')
    await expect(page.getByRole('list', { name: 'Members' })).toHaveCount(0)
  })

  test('a taken-down organisation shows only the notice', async ({ page }) => {
    const res = await page.goto('/@acme-page-gone')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Gone Works' })).toBeVisible()
    await expect(page.getByText("This organisation was taken down by Renown's moderators.")).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.getByText('Unverified organisation')).toHaveCount(0)
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0)
  })

  test('answers 503 when organisations cannot be read, and 404 for an unknown handle', async ({ page }) => {
    const down = await page.goto('/@acme-page-down')
    expect(down?.status()).toBe(503)
    expect(down?.headers()['retry-after']).toBe('30')
    await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible()
    const missing = await page.goto('/@acme-page-nobody')
    expect(missing?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Profile not found' })).toBeVisible()
  })

  test('/org/<id or handle> redirects to the handle', async ({ request }) => {
    for (const ref of [ORG_ID, 'acme-page']) {
      const res = await request.get(`/org/${ref}`, { maxRedirects: 0 })
      expect(res.status()).toBe(307)
      expect(res.headers().location).toBe('/@acme-page')
    }
    expect((await request.get('/org/acme-page-nobody', { maxRedirects: 0 })).status()).toBe(404)
  })

  test('serves the did:web document, and 404 for an unknown organisation', async ({ request }) => {
    const res = await request.get(`/org/${ORG_ID}/did.json`)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/json')
    expect(res.headers()['access-control-allow-origin']).toBe('*')
    expect(await res.json()).toEqual(DID_DOC)
    expect((await request.get('/org/a0c0ffee-0000-4000-8000-00000000a0ff/did.json')).status()).toBe(404)
    expect((await request.get('/org/bad%20id/did.json')).status()).toBe(404)
  })

  test('a person’s profile lists the organisations they are a public member of', async ({ page }) => {
    await page.goto('/@lena-member')
    const section = page.getByRole('region', { name: 'Member of' })
    const chip = section.getByRole('link', { name: /Acme Page Works/ })
    await expect(chip).toHaveAttribute('href', '/@acme-page')
    await expect(chip).toContainText('Publisher')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-page.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL (the `/@acme-page` request is a 404 "Profile not found").

- [ ] **Step 3: Add formatting helpers, JSON-LD and the org filter for app profiles**

Create `lib/orgs/format.ts`:

```ts
// Paths and wording for organisations, shared by pages and components. Pure.
import type { OrgRole } from '../../services/org-signed-messages'

export const ROLE_LABELS: Record<OrgRole, string> = { OWNER: 'Owner', ADMIN: 'Admin', PUBLISHER: 'Publisher', MEMBER: 'Member' }

export function roleLabel(role: string): string {
  return Object.hasOwn(ROLE_LABELS, role) ? ROLE_LABELS[role as OrgRole] : role
}

/** The canonical page of an organisation. */
export function orgPath(handle: string): string {
  return `/@${handle}`
}

export function manageHref(handle: string, section = 'members'): string {
  return `/org/${encodeURIComponent(handle)}/manage/${section}`
}

export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** How a member is named: display name, then @handle, then the short address. */
export function memberLabel(member: { displayName?: string | null; handle?: string | null; address: string }): string {
  return member.displayName?.trim() || (member.handle ? `@${member.handle}` : shortAddress(member.address))
}

export function memberHref(member: { handle?: string | null; address: string }): string {
  return member.handle ? `/@${member.handle}` : `/profile/${member.address}`
}

export function inviteLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/invite/${token}`
}

export function shortDid(did: string): string {
  return did.length > 28 ? `${did.slice(0, 18)}…${did.slice(-6)}` : did
}
```

Append to `lib/json-ld.ts` (after `appJsonLd`):

```ts
export interface OrganizationJsonLdInput {
  org: Pick<Organization, 'name' | 'handle' | 'did' | 'bio' | 'links' | 'verifiedDomains'>
  /** Absolute canonical URL of the organisation page. */
  url: string
  /** Absolute avatar URL (/media), when the organisation has one. */
  image: string | null
}

/** Organization for an organisation page; its verified domains count as sameAs. */
export function organizationJsonLd({ org, url, image }: OrganizationJsonLdInput): object {
  const sameAs = [...safeUrls(org.links), ...org.verifiedDomains.map((domain) => `https://${domain}`)]
  const description = markdownPlainText(org.bio ?? '')
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    url,
    alternateName: `@${org.handle}`,
    identifier: org.did,
    ...(description && { description }),
    ...(image && { logo: image }),
    ...(sameAs.length > 0 && { sameAs }),
  }
}
```

and add to its imports: `import type { Organization } from '../services/orgs'`.

In `services/app-profiles.ts`, replace `listAppProfiles` with:

```ts
/**
 * One page of app profiles, newest first (`limit` 1-50), optionally only those
 * in `category` (matched case-insensitively) or published by organisation
 * `orgId`. The org filter has its own query document, so the directory keeps
 * working against a switchboard that predates it. A failed read throws;
 * callers decide whether that hides a section or shows an outage.
 */
export async function listAppProfiles({
  limit,
  after,
  category,
  orgId,
}: {
  limit: number
  after?: string | null
  category?: string | null
  orgId?: string | null
}): Promise<AppProfilePage> {
  if (orgId) {
    const data = await client().request<{ appProfiles: AppProfilePage }>(
      `query AppProfilesByOrg($limit: Int, $after: String, $category: String, $orgId: String) { appProfiles(limit: $limit, after: $after, category: $category, orgId: $orgId) { items { ${APP_PROFILE_FIELDS} } next } }`,
      { limit, after: after ?? null, category: category ?? null, orgId },
    )
    return data.appProfiles
  }
  const data = await client().request<{ appProfiles: AppProfilePage }>(
    `query AppProfiles($limit: Int, $after: String, $category: String) { appProfiles(limit: $limit, after: $after, category: $category) { items { ${APP_PROFILE_FIELDS} } next } }`,
    { limit, after: after ?? null, category: category ?? null },
  )
  return data.appProfiles
}
```

- [ ] **Step 4: Load the page data**

Create `lib/orgs/org-page-data.ts`:

```ts
// What the public organisation page shows, read on the server. The
// organisation itself is already known; stats, apps and members are secondary
// reads that drop their section on failure or after the SSR budget.
import { HERO_ART, identityArtSvgs, type IdentityArtSvgs } from '../identity-art'
import { qrCode, type QrCode } from '../qr'
import { listAppProfiles, type RenownAppProfile } from '../../services/app-profiles'
import {
  fetchOrganizationStats,
  organizationMembers,
  type Organization,
  type OrganizationStats,
  type OrgMember,
} from '../../services/orgs'
import { canonicalUrl } from '../../utils/seo'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'
import { orgPath } from './format'

export interface OrgPageData {
  org: Organization
  stats: OrganizationStats | null
  apps: RenownAppProfile[]
  /** The public member list (membersPublic, hidden members left out by the switchboard). */
  members: OrgMember[]
  canonicalUrl: string
  art: IdentityArtSvgs
  qr: QrCode
}

export const ORG_PAGE_APPS = 24

function optional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return withTimeout(promise, SSR_DATA_TIMEOUT_MS).catch(() => fallback)
}

export async function loadOrgPageData(org: Organization): Promise<OrgPageData> {
  const url = canonicalUrl(orgPath(org.handle))
  const base = { org, canonicalUrl: url, art: identityArtSvgs(org.id, { ...HERO_ART, idPrefix: 'org' }), qr: qrCode(url) }
  if (org.takenDown) return { ...base, stats: null, apps: [], members: [] }
  const [stats, apps, members] = await Promise.all([
    optional(fetchOrganizationStats(org.id), null),
    org.apps.length > 0
      ? optional(listAppProfiles({ limit: ORG_PAGE_APPS, orgId: org.id }).then((page) => page.items), [])
      : Promise.resolve([]),
    org.membersPublic ? optional(organizationMembers(org.id, false), []) : Promise.resolve([]),
  ])
  return { ...base, stats, apps, members }
}
```

- [ ] **Step 5: The components**

Create `components/org/org-avatar.tsx`:

```tsx
import { ProfileAvatar } from '../profile/profile-avatar'

/** An organisation's avatar (/media/<orgId>/avatar), else an identicon seeded by its id. */
export function OrgAvatar({ org, className = 'h-12 w-12' }: { org: { id: string; avatar: string | null }; className?: string }) {
  return <ProfileAvatar documentId={org.id} avatar={org.avatar} seed={org.id} alt="" className={className} />
}
```

Create `components/org/org-verification.tsx`:

```tsx
import Link from 'next/link'
import { orgPath } from '../../lib/orgs/format'
import type { OrgSummary } from '../../services/orgs'
import { Badge } from '../site/primitives'

function ShieldIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z" />
      <path d="m8.8 12.2 2.2 2.2 4.4-4.6" />
    </svg>
  )
}

/** "Verified: <domain>" per verified domain, else "Unverified organisation". */
export function OrgVerification({ verifiedDomains }: { verifiedDomains: string[] }) {
  if (verifiedDomains.length === 0) return <Badge>Unverified organisation</Badge>
  return (
    <>
      {verifiedDomains.map((domain) => (
        <Badge key={domain} tone="signal" className="max-w-full">
          <ShieldIcon />
          <span className="truncate">Verified: {domain}</span>
        </Badge>
      ))}
    </>
  )
}

/** Shown when an unverified organisation carries the name of another one that has a verified domain. */
export function NotAffiliatedNote({ other }: { other: OrgSummary }) {
  return (
    <p role="note" className="border-caution-ink/35 bg-caution-ink/[0.07] text-ink rounded-card border px-4 py-3 text-sm leading-6">
      Not affiliated with the verified{' '}
      <Link href={orgPath(other.handle)} className="font-semibold underline underline-offset-4">
        {other.name}
      </Link>
      .
    </p>
  )
}
```

Create `components/org/org-page.tsx`:

```tsx
import Link from 'next/link'
import { AppTile } from '../app/app-tile'
import { IdentityArt } from '../identity/identity-art'
import { LinkChips } from '../identity/link-chip'
import { PageSection } from '../identity/page-section'
import { ShareMenu } from '../identity/share-menu'
import { ProfileAvatar } from '../profile/profile-avatar'
import { PageMeta } from '../site/page-meta'
import { Badge, Container, Heading } from '../site/primitives'
import { SiteLayout } from '../site/site-layout'
import { organizationJsonLd } from '../../lib/json-ld'
import { memberLabel, memberHref, orgPath, plural, roleLabel } from '../../lib/orgs/format'
import type { OrgPageData } from '../../lib/orgs/org-page-data'
import { memberSince } from '../../lib/profile-identity'
import { mediaUrl } from '../../services/media'
import type { Organization, OrganizationStats, OrgMember } from '../../services/orgs'
import { linkTarget } from '../../utils/link-service'
import { markdownPlainText } from '../../utils/markdown-lite'
import { OrgAvatar } from './org-avatar'
import { NotAffiliatedNote, OrgVerification } from './org-verification'

function OrgTotals({ stats }: { stats: OrganizationStats }) {
  const count = (n: number) => n.toLocaleString('en-GB')
  const items = [
    { label: 'Apps', value: count(stats.apps) },
    { label: 'Active users in the last 30 days', value: stats.activeUsers30d > 0 ? `Up to ${count(stats.activeUsers30d)}` : '0' },
    { label: 'Active delegations', value: count(stats.activeDelegations) },
    { label: 'Releases signed off in the last 30 days', value: count(stats.attestations30d) },
  ]
  return (
    <PageSection id="org-totals" title="At a glance">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="border-hairline bg-surface-1 rounded-card border p-4">
            <dt className="text-ink-muted text-xs font-medium">{item.label}</dt>
            <dd className="text-ink mt-1 text-2xl font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-ink-muted mt-3 text-xs">Active users are added up per app, so someone who uses two apps counts twice.</p>
    </PageSection>
  )
}

function OrgMembers({ members, total }: { members: OrgMember[]; total: number }) {
  return (
    <PageSection id="org-members" title="Members" aside={<span className="text-ink-muted text-sm">{plural(total, 'member', 'members')}</span>}>
      <ul aria-label="Members" className="space-y-1">
        {members.slice(0, 12).map((member) => (
          <li key={member.id}>
            <Link href={memberHref(member)} className="hover:bg-surface-2 -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors">
              <ProfileAvatar seed={member.address} alt="" className="h-9 w-9" />
              <span className="min-w-0">
                <span className="text-ink block truncate text-sm font-semibold">{memberLabel(member)}</span>
                <span className="text-ink-muted block text-xs">{roleLabel(member.role)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  )
}

function OrgIdentity({ org }: { org: Organization }) {
  const since = memberSince(org.createdAt)
  return (
    <PageSection id="org-identity" title="Identity">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-ink-muted text-xs font-medium">DID</dt>
          <dd className="text-ink font-mono text-[13px] leading-5 break-all">{org.did}</dd>
        </div>
        {since && (
          <div>
            <dt className="text-ink-muted text-xs font-medium">On Renown since</dt>
            <dd className="text-ink">{since}</dd>
          </div>
        )}
      </dl>
      <a href={`/org/${encodeURIComponent(org.id)}/did.json`} className="text-primary-ink mt-3 inline-block text-sm font-semibold underline-offset-4 hover:underline">
        DID document
      </a>
    </PageSection>
  )
}

/** The public page of an organisation (rendered at /@handle by pages/profile/[id].tsx). */
export function OrgPage({ data }: { data: OrgPageData }) {
  const { org, stats, apps, members, canonicalUrl, art, qr } = data
  const path = orgPath(org.handle)
  const title = org.handle.toLowerCase() !== org.name.toLowerCase() ? `${org.name} (@${org.handle})` : org.name

  if (org.takenDown) {
    return (
      <SiteLayout>
        <PageMeta title={org.name} documentTitle={`${title} on Renown`} description="This organisation was taken down by Renown's moderators." path={path} noindex />
        <Container className="max-w-[1120px] pt-16 pb-24 md:pt-24">
          <Heading level={1}>{org.name}</Heading>
          <p role="status" className="text-ink-muted mt-4 max-w-[60ch]">
            This organisation was taken down by Renown&apos;s moderators.
          </p>
        </Container>
      </SiteLayout>
    )
  }

  const origin = new URL(canonicalUrl).origin
  const image = org.avatar ? mediaUrl(org.id, 'avatar', origin, org.avatar) : null
  const description = markdownPlainText(org.bio ?? '') || `${org.name}, an organisation on Renown.`
  // Only http(s) links are ever shown.
  const links = org.links.filter((link) => linkTarget(link.url))
  const website = org.website ? linkTarget(org.website) : null

  return (
    <SiteLayout>
      <PageMeta
        title={title}
        documentTitle={`${title} on Renown`}
        description={description}
        path={path}
        noindex={org.archived}
        jsonLd={[organizationJsonLd({ org, url: canonicalUrl, image })]}
      />
      <Container className="max-w-[1120px] pt-6 pb-20 md:pt-10">
        <header className="border-hairline bg-surface-1 shadow-card rounded-panel overflow-hidden border">
          <IdentityArt art={art} className="h-28 md:h-36" />
          <div className="px-5 pb-6 sm:px-8">
            <div className="-mt-10 flex items-end justify-between gap-4">
              <span className="bg-background block rounded-full p-1" style={{ boxShadow: `0 0 0 2px ${art.accent}` }}>
                <OrgAvatar org={org} className="h-20 w-20" />
              </span>
              <div className="flex items-center gap-2 pb-1">
                <ShareMenu url={canonicalUrl} title={`${org.name} on Renown`} qr={qr} subject="this organisation" />
              </div>
            </div>
            <h1 className="text-ink text-h1 mt-4 break-words">{org.name}</h1>
            <p className="text-ink-muted mt-1 break-all">@{org.handle}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <OrgVerification verifiedDomains={org.verifiedDomains} />
              {org.archived && <Badge>Archived</Badge>}
            </div>
            {org.notAffiliatedWith && (
              <div className="mt-4 max-w-[60ch]">
                <NotAffiliatedNote other={org.notAffiliatedWith} />
              </div>
            )}
            {org.bio && <p className="text-ink mt-5 max-w-[68ch] leading-7 break-words whitespace-pre-line">{org.bio}</p>}
            {website && org.website && (
              <a href={org.website} target="_blank" rel="nofollow noopener noreferrer" className="text-primary-ink mt-3 inline-block text-sm font-semibold break-all underline-offset-4 hover:underline">
                {website.host}
              </a>
            )}
          </div>
        </header>

        <div className="mt-12 grid gap-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
          <div className="min-w-0 space-y-12">
            {stats && <OrgTotals stats={stats} />}
            {apps.length > 0 && (
              <PageSection
                id="org-apps"
                title="Apps"
                aside={
                  <Link href={`/apps?org=${encodeURIComponent(org.handle)}`} className="text-primary-ink text-sm font-semibold underline-offset-4 hover:underline">
                    See in the app directory
                  </Link>
                }
              >
                <ul className="grid gap-5 sm:grid-cols-2">
                  {apps.map((app) => (
                    <li key={app.appDid}>
                      <AppTile app={app} />
                    </li>
                  ))}
                </ul>
              </PageSection>
            )}
            {links.length > 0 && (
              <PageSection id="org-links" title="Links">
                <LinkChips links={links} />
              </PageSection>
            )}
            {!stats && apps.length === 0 && links.length === 0 && (
              <p className="text-ink-muted">{org.name} has not published any apps on Renown yet.</p>
            )}
          </div>
          <aside className="min-w-0 space-y-10">
            {members.length > 0 && <OrgMembers members={members} total={org.memberCount} />}
            <OrgIdentity org={org} />
          </aside>
        </div>
      </Container>
    </SiteLayout>
  )
}
```

(`linkTarget(url)` returns `{ host, … }` for http(s) URLs and null otherwise, as on the app page.)

Create `components/profile/member-of.tsx`:

```tsx
import Link from 'next/link'
import { orgPath, roleLabel } from '../../lib/orgs/format'
import type { OrgAffiliation } from '../../services/orgs'
import { PageSection } from '../identity/page-section'
import { OrgAvatar } from '../org/org-avatar'

/** The organisations a person is a public member of (archived ones left out); nothing when there are none. */
export function MemberOf({ orgs }: { orgs: OrgAffiliation[] }) {
  const shown = orgs.filter((affiliation) => !affiliation.org.archived)
  if (shown.length === 0) return null
  return (
    <PageSection id="member-of" title="Member of">
      <ul className="flex flex-wrap gap-2">
        {shown.map(({ org, role }) => (
          <li key={org.id} className="max-w-full">
            <Link
              href={orgPath(org.handle)}
              className="border-hairline-strong bg-surface-1 hover:border-primary/50 flex max-w-full items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors"
            >
              <OrgAvatar org={org} className="h-7 w-7" />
              <span className="text-ink truncate font-semibold">{org.name}</span>
              <span className="text-ink-muted shrink-0">{roleLabel(role)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  )
}
```

(`PageSection` renders `<section aria-labelledby>`, which is the "Member of" region the test finds.)

- [ ] **Step 6: Branch `/@handle` and add "Member of" in `pages/profile/[id].tsx`**

Add imports:

```tsx
import { OrgPage } from '../../components/org/org-page'
import { MemberOf } from '../../components/profile/member-of'
import { orgPath } from '../../lib/orgs/format'
import { loadOrgPageData, type OrgPageData } from '../../lib/orgs/org-page-data'
import { fetchOrganization, organizationsByMember, type OrgAffiliation, type Organization } from '../../services/orgs'
```

In `interface ProfilePageProps`, after `qr: QrCode | null`, add:

```tsx
  /** Set when /@handle belongs to an organisation: the page renders OrgPage instead. */
  org: OrgPageData | null
  /** The person's public organisation memberships. */
  memberOf: OrgAffiliation[]
```

Replace the component's first lines:

```tsx
const ProfilePage: NextPage<ProfilePageProps> = ({ profile, ensVerified, art, apps, stats, canonicalUrl, ogImage, qr, error }) => {
  if (error) return <NotFoundPage title="Something went wrong" message={error} />
```

with:

```tsx
const ProfilePage: NextPage<ProfilePageProps> = ({ profile, ensVerified, art, apps, stats, canonicalUrl, ogImage, qr, org, memberOf, error }) => {
  if (error) return <NotFoundPage title="Something went wrong" message={error} />
  if (org) return <OrgPage data={org} />
```

Replace `const hasContent = Boolean(profile.bio?.trim()) || links.length > 0 || apps.length > 0 || groups.length > 0` with:

```tsx
  const hasContent = Boolean(profile.bio?.trim()) || links.length > 0 || apps.length > 0 || groups.length > 0 || memberOf.length > 0
```

and render "Member of" after the apps:

```tsx
                <ProfileApps apps={apps} />
                <MemberOf orgs={memberOf} />
                <ProfileActivity groups={groups} />
```

In `getServerSideProps`, replace the `empty` line with:

```tsx
  const empty = { profile: null, ensVerified: false, art: null, apps: [], stats: [], canonicalUrl: null, ogImage: null, qr: null, org: null, memberOf: [] }
```

Replace the lookup block, from `let profile: RenownProfile | null` through the `if (!profile) { … return { props: empty } }` block, with:

```tsx
  let profile: RenownProfile | null
  // Handles are one namespace for people and organisations: /@handle asks both at once.
  let orgLookup: Promise<Organization | null | 'unavailable'> | null = null
  try {
    if (byHandle) {
      const handle = id.toLowerCase()
      orgLookup = withTimeout(fetchOrganization({ handle }), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
        console.error('Failed to fetch organization from switchboard:', error instanceof Error ? error.message : error)
        return 'unavailable' as const
      })
      profile = await fetchProfile({ driveId: DEFAULT_DRIVE_ID, handle })
    } else if (ADDRESS_RE.test(id)) {
      profile = await fetchProfile({ driveId: `renown-${id.toLowerCase()}`, ethAddress: id.toLowerCase() })
    } else {
      profile =
        (await fetchProfile({ driveId: DEFAULT_DRIVE_ID, id })) ??
        (await fetchProfile({ driveId: DEFAULT_DRIVE_ID, username: id }))
    }
  } catch (error) {
    // An outage is not "no such profile": a 404 would make crawlers drop valid profiles.
    console.error('Failed to fetch profile from switchboard:', error)
    context.res.statusCode = 503
    context.res.setHeader('Cache-Control', 'no-store')
    context.res.setHeader('Retry-After', '30')
    return { props: { ...empty, error: 'Profiles are temporarily unavailable. Please try again in a moment.' } }
  }
  if (!profile && orgLookup) {
    const org = await orgLookup
    if (org === 'unavailable') {
      // No person has this handle, and organisations could not be asked: never a cacheable 404.
      context.res.statusCode = 503
      context.res.setHeader('Cache-Control', 'no-store')
      context.res.setHeader('Retry-After', '30')
      return { props: { ...empty, error: 'Profiles are temporarily unavailable. Please try again in a moment.' } }
    }
    if (org) {
      if (org.handle !== id) return { redirect: { destination: orgPath(org.handle), permanent: false } }
      context.res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
      return { props: { ...empty, org: await loadOrgPageData(org) } }
    }
  }
  if (!profile) {
    context.res.statusCode = 404
    return { props: empty }
  }
```

Replace the secondary reads:

```tsx
  const [ensVerified, apps, stats] = await Promise.all([
    isEnsVerified(profile.username, profile.ethAddress),
    wallet ? optional(getAppProfilesByPublisher(address.toLowerCase()), []) : Promise.resolve([]),
    wallet ? optional(getUserStats(address), []) : Promise.resolve([]),
  ])
```

with:

```tsx
  const [ensVerified, apps, stats, memberOf] = await Promise.all([
    isEnsVerified(profile.username, profile.ethAddress),
    wallet ? optional(getAppProfilesByPublisher(address.toLowerCase()), []) : Promise.resolve([]),
    wallet ? optional(getUserStats(address), []) : Promise.resolve([]),
    wallet ? optional(organizationsByMember(address.toLowerCase()), []) : Promise.resolve([]),
  ])
```

and in the returned props add `org: null,` and `memberOf,` after `qr: qrCode(canonicalUrl),`.

- [ ] **Step 7: `/org/[id]` and `did.json`**

Create `pages/org/[id]/index.tsx`:

```tsx
import type { GetServerSideProps, NextPage } from 'next'
import { NotFoundPage } from '../../../components/ui/not-found-page'
import { orgPath } from '../../../lib/orgs/format'
import { orgRef } from '../../../lib/orgs/handles'
import { fetchOrganization } from '../../../services/orgs'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../../../utils/with-timeout'

interface Props {
  unavailable: boolean
}

/** /org/<id or handle>: the canonical organisation URL is /@handle. */
const OrgById: NextPage<Props> = ({ unavailable }) =>
  unavailable ? (
    <NotFoundPage title="Something went wrong" message="Organisations are temporarily unavailable. Please try again in a moment." />
  ) : (
    <NotFoundPage title="Organisation not found" message="No organisation on Renown has this name or id. Check the link, or browse the directory." />
  )

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, res }) => {
  const ref = String(params?.id ?? '')
  try {
    const org = ref ? await withTimeout(fetchOrganization(orgRef(ref)), SSR_DATA_TIMEOUT_MS) : null
    if (org) return { redirect: { destination: orgPath(org.handle), permanent: false } }
    res.statusCode = 404
    return { props: { unavailable: false } }
  } catch (error) {
    console.error('Failed to fetch organization from switchboard:', error instanceof Error ? error.message : error)
    res.statusCode = 503
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Retry-After', '30')
    return { props: { unavailable: true } }
  }
}

export default OrgById
```

Create `pages/api/org-did/[id].ts`:

```ts
// GET /org/<id>/did.json (rewritten here by next.config.ts): the did:web
// document of did:web:<host>:org:<id>, as renown-orgs builds it
// (organizationDidDocument). 404 when unknown or taken down.
import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchOrganizationDidDocument } from '../../../services/orgs'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../../../utils/with-timeout'

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const id = String(req.query.id ?? '')
  if (!ID_RE.test(id)) {
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.status(404).json({ error: 'Not found' })
    return
  }
  let document: string | null
  try {
    document = await withTimeout(fetchOrganizationDidDocument(id), SSR_DATA_TIMEOUT_MS)
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    res.status(503).json({ error: 'DID documents are temporarily unavailable' })
    return
  }
  if (!document) {
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.status(404).json({ error: 'Not found' })
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(document)
  } catch {
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: 'The DID document could not be read' })
    return
  }
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  res.status(200).json(parsed)
}
```

In `next.config.ts`, add to the `rewrites()` array, after the `/@:handle` entry:

```ts
            // did:web:<host>:org:<id> resolves to https://<host>/org/<id>/did.json.
            { source: "/org/:id/did.json", destination: "/api/org-did/:id" },
```

- [ ] **Step 8: Run the spec**

Run: `pnpm exec playwright test e2e/org-page.spec.ts e2e/profile-page.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS (the new 7 tests, and the existing profile page tests unchanged).

- [ ] **Step 9: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed" (`/profile/[id]` now also renders `OrgPage`, which has no wallet code).

```bash
git add lib/orgs/format.ts lib/orgs/org-page-data.ts lib/json-ld.ts services/app-profiles.ts components/org components/profile/member-of.tsx "pages/profile/[id].tsx" "pages/org/[id]/index.tsx" "pages/api/org-did/[id].ts" next.config.ts e2e/org-page.spec.ts
git commit -m "feat(orgs): organisation pages at /@handle, did.json and Member of"
```

---

### Task 4: The `/orgs` directory, footer link, sitemap and wallet check

**Files:**
- Create: `pages/orgs.tsx`, `components/orgs/org-card.tsx`, `components/orgs/use-org-directory.ts`
- Modify: `components/site/nav.ts` (footer), `lib/sitemap.ts` (`STATIC_PATHS`), `scripts/check-wallet-chunks.mjs` (`MARKETING_PAGES`)
- Test: `e2e/orgs-directory.spec.ts`

**Interfaces:**
- Consumes: `searchOrganizations`, `parseOrgQuery`, `isOrgSearchable`, `ORG_QUERY_MAX`, `OrgCard`, `OrgSearchPage` (Task 1); `OrgAvatar`, `orgPath`, `plural` (Task 3); `DIRECTORY_ORGS`, `installDirectoryFixture` (Task 1).
- Produces: `OrgCardView({ org: OrgCard })`; `useOrgDirectory(query: string, initial: OrgSearchPage): { items; next; more: 'idle' | 'loading' | 'error'; loadMore }`; `appendOrgs(items, more): OrgCard[]`; the page `/orgs` (h1 "Organisations on Renown", list "Organisations").

- [ ] **Step 1: Write the failing test**

Create `e2e/orgs-directory.spec.ts`:

```ts
import { test, expect, type Route } from '@playwright/test'
import { fixtureStub, graphqlError, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { DIRECTORY_ORGS, installDirectoryFixture, orgSummary } from './support/org-fixtures'

const MORE = {
  ...orgSummary({ id: 'org-dir-3', handle: 'acme-dir-more', name: 'Acme Dir More' }),
  bio: null,
  memberCount: 2,
  archived: false,
  takenDown: false,
  notAffiliatedWith: null,
}

test.beforeAll(async () => {
  await installDirectoryFixture()
  await fixtureStub({ match: 'query OrgSearch', variables: '"query":"acme-dir"', response: { data: { organizationSearch: { items: [DIRECTORY_ORGS[0]], next: 'cursor-2' } } } })
  await fixtureStub({ match: 'query OrgSearch', variables: '"query":"nomatch-dir"', response: { data: { organizationSearch: { items: [], next: null } } } })
  await fixtureStub({ match: 'query OrgSearch', variables: '"query":"down-dir"', response: graphqlError('down', 'SERVICE_UNAVAILABLE') })
})

test.describe('/orgs', () => {
  test('lists the listed organisations with their verification', async ({ page }) => {
    await page.goto('/orgs')
    await expect(page.getByRole('heading', { level: 1, name: 'Organisations on Renown' })).toBeVisible()
    const list = page.getByRole('list', { name: 'Organisations' })
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await expect(list.getByRole('link', { name: /Acme Directory Works/ })).toHaveAttribute('href', '/@acme-directory')
    await expect(list.getByText('Verified: acme-directory.example')).toBeVisible()
    await expect(list.getByText('Unverified organisation')).toBeVisible()
    await expect(list.getByText('Not affiliated with the verified Acme Directory Works')).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Create an organisation' })).toHaveAttribute('href', '/org/new')
  })

  test('searches by query, pages with Load more, and is not indexed', async ({ page }) => {
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const body = route.request().postDataJSON() as { query: string; variables: { after?: string } }
      if (body.query.includes('query OrgSearch') && body.variables.after === 'cursor-2') {
        return route.fulfill({ json: { data: { organizationSearch: { items: [MORE], next: null } } } })
      }
      return route.continue()
    })
    await page.goto('/orgs?q=acme-dir')
    await expect(page.getByRole('searchbox', { name: 'Search organisations by name or handle' })).toHaveValue('acme-dir')
    await expect(page.getByRole('status').filter({ hasText: 'matching' })).toHaveText('1+ organisations matching “acme-dir”')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await page.getByRole('button', { name: 'Load more organisations' }).click()
    await expect(page.getByRole('list', { name: 'Organisations' }).getByRole('listitem')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Load more organisations' })).toHaveCount(0)
  })

  test('says when nothing matches, when the directory is down, and when a query is too short', async ({ page }) => {
    await page.goto('/orgs?q=nomatch-dir')
    await expect(page.getByRole('heading', { name: 'No organisation matches “nomatch-dir”' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Show all organisations' })).toHaveAttribute('href', '/orgs')
    await page.goto('/orgs?q=down-dir')
    await expect(page.getByRole('alert')).toContainText('The organisation directory is unavailable')
    await page.goto('/orgs?q=a')
    await expect(page.getByText('Type at least 2 characters.')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Organisations' }).getByRole('listitem')).toHaveCount(2)
  })

  test('is linked from the footer and listed in the sitemap', async ({ page, request }) => {
    await page.goto('/trust')
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Organisations' })).toHaveAttribute('href', '/orgs')
    expect(await (await request.get('/sitemap.xml')).text()).toContain('/orgs</loc>')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/orgs-directory.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL (`/orgs` is a 404).

- [ ] **Step 3: Implement the card, the paging hook and the page**

Create `components/orgs/org-card.tsx`:

```tsx
import Link from 'next/link'
import { identityAccent } from '../../lib/identity-art'
import { orgPath, plural } from '../../lib/orgs/format'
import type { OrgCard } from '../../services/orgs'
import { markdownPlainText } from '../../utils/markdown-lite'
import { OrgAvatar } from '../org/org-avatar'
import { Badge } from '../site/primitives'

/** A directory entry: avatar, name, handle, verification, member count and the start of the bio. */
export function OrgCardView({ org }: { org: OrgCard }) {
  const accent = identityAccent(org.id)
  const bio = org.bio ? markdownPlainText(org.bio, 140) : ''
  const domain = org.verifiedDomains[0]
  return (
    <Link
      href={orgPath(org.handle)}
      data-org-id={org.id}
      className="group border-hairline bg-surface-1 shadow-card rounded-card hover:border-primary/40 relative flex h-full flex-col overflow-hidden border p-5 transition-[border-color,box-shadow] duration-300"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-center gap-4">
        <span className="shrink-0 rounded-full p-[2px]" style={{ background: accent }}>
          <OrgAvatar org={org} className="ring-background h-14 w-14 ring-2" />
        </span>
        <div className="min-w-0">
          <h2 className="text-ink truncate text-[17px] leading-6 font-semibold group-hover:underline group-hover:underline-offset-4">{org.name}</h2>
          <p className="text-ink-muted truncate text-sm">@{org.handle}</p>
        </div>
      </div>
      <div className="mt-4 flex min-w-0 flex-wrap gap-2">
        {domain ? (
          <Badge tone="signal" className="max-w-full">
            <span className="truncate">Verified: {domain}</span>
          </Badge>
        ) : (
          <Badge>Unverified organisation</Badge>
        )}
        <Badge>{plural(org.memberCount, 'member', 'members')}</Badge>
      </div>
      {org.notAffiliatedWith && (
        <p className="text-caution-ink mt-3 text-sm leading-6">Not affiliated with the verified {org.notAffiliatedWith.name}</p>
      )}
      {bio && <p className="text-ink-muted mt-3 line-clamp-2 text-sm leading-6">{bio}</p>}
    </Link>
  )
}
```

Create `components/orgs/use-org-directory.ts`:

```ts
import { useCallback, useState } from 'react'
import { searchOrganizations, type OrgCard, type OrgSearchPage } from '../../services/orgs'
import { CLIENT_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'

/** `items` followed by the organisations of `more` it does not already hold. */
export function appendOrgs(items: OrgCard[], more: OrgCard[]): OrgCard[] {
  const seen = new Set(items.map((org) => org.id))
  return [...items, ...more.filter((org) => !seen.has(org.id))]
}

/** The directory list for one query (the page keys it by query): the server's first page, then "Load more". */
export function useOrgDirectory(query: string, initial: OrgSearchPage) {
  const [items, setItems] = useState(initial.items)
  const [next, setNext] = useState(initial.next)
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle')

  const loadMore = useCallback(() => {
    if (!next || more === 'loading') return
    setMore('loading')
    withTimeout(searchOrganizations(query, next), CLIENT_DATA_TIMEOUT_MS).then(
      (page) => {
        setItems((current) => appendOrgs(current, page.items))
        setNext(page.next)
        setMore('idle')
      },
      (error: unknown) => {
        console.warn('Organisation directory: next page unavailable:', error instanceof Error ? error.name : 'error')
        setMore('error')
      },
    )
  }, [query, next, more])

  return { items, next, more, loadMore }
}
```

Create `pages/orgs.tsx`:

```tsx
import type { GetServerSideProps, NextPage } from 'next'
import type { ReactNode } from 'react'
import { OrgCardView } from '../components/orgs/org-card'
import { useOrgDirectory } from '../components/orgs/use-org-directory'
import { PageMeta } from '../components/site/page-meta'
import { ButtonLink, buttonClasses, Container, Heading, Lead } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'
import { isOrgSearchable, ORG_QUERY_MAX, parseOrgQuery, searchOrganizations, type OrgSearchPage } from '../services/orgs'
import { peopleCacheControl } from '../utils/cache-control'
import { cx } from '../utils/cx'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../utils/with-timeout'

interface OrgsPageProps {
  /** The searched query ('' lists every listed organisation). */
  query: string
  /** A one-character query was given and ignored. */
  tooShort: boolean
  /** The first page; null when the directory could not be read. */
  page: OrgSearchPage | null
}

const DESCRIPTION =
  'Teams, companies and communities that publish apps on Renown. Only organisations that chose to be listed appear here.'
const EMPTY: OrgSearchPage = { items: [], next: null }

function countText(count: number, more: boolean): string {
  if (count === 1 && !more) return '1 organisation'
  return `${count}${more ? '+' : ''} organisations`
}

function Notice({ title, children, alert = false }: { title: string; children: ReactNode; alert?: boolean }) {
  return (
    <div role={alert ? 'alert' : undefined} className="border-hairline-strong rounded-panel flex flex-col items-center border border-dashed px-6 py-16 text-center">
      <h2 className="text-ink text-h3">{title}</h2>
      <div className="text-ink-muted mt-3 max-w-[46ch]">{children}</div>
    </div>
  )
}

function DirectoryList({ query, page }: { query: string; page: OrgSearchPage | null }) {
  const directory = useOrgDirectory(query, page ?? EMPTY)
  if (page === null) {
    return (
      <Notice title="The organisation directory is unavailable" alert>
        <p>Renown did not answer. Nothing is wrong with your search; try again in a moment.</p>
        <a href={query ? `/orgs?q=${encodeURIComponent(query)}` : '/orgs'} className={buttonClasses('primary', 'md', 'mt-6')}>
          Try again
        </a>
      </Notice>
    )
  }
  const status = query
    ? directory.items.length > 0
      ? `${countText(directory.items.length, directory.next !== null)} matching “${query}”`
      : ''
    : ''
  return (
    <>
      <p role="status" className={cx('text-ink-muted min-h-6 text-sm', !status && 'sr-only')}>
        {status}
      </p>
      <div className="mt-4">
        {directory.items.length === 0 ? (
          query ? (
            <Notice title={`No organisation matches “${query}”`}>
              <p>Search looks at the start of handles and names, and finds only organisations that chose to be listed.</p>
              <a href="/orgs" className={buttonClasses('secondary', 'md', 'mt-6')}>
                Show all organisations
              </a>
            </Notice>
          ) : (
            <Notice title="No organisations are listed yet">
              <p>Organisations appear here once their admins choose to list them.</p>
            </Notice>
          )
        ) : (
          <ul aria-label="Organisations" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {directory.items.map((org) => (
              <li key={org.id}>
                <OrgCardView org={org} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {directory.next && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <button type="button" aria-disabled={directory.more === 'loading'} onClick={directory.loadMore} className={buttonClasses('secondary', 'lg')}>
            {directory.more === 'loading' ? 'Loading…' : 'Load more organisations'}
          </button>
          {directory.more === 'error' && (
            <p role="alert" className="text-ink-muted text-sm">
              More organisations didn&apos;t load. Select the button to try again.
            </p>
          )}
        </div>
      )}
    </>
  )
}

const OrgsPage: NextPage<OrgsPageProps> = ({ query, tooShort, page }) => (
  <SiteLayout>
    <PageMeta title="Organisations" description={DESCRIPTION} path="/orgs" noindex={query !== ''} />
    <section aria-labelledby="orgs-title">
      <Container className="pt-14 pb-8 md:pt-20 md:pb-10">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Heading level={1} id="orgs-title">
              Organisations on Renown
            </Heading>
            <Lead>{DESCRIPTION}</Lead>
          </div>
          <ButtonLink href="/org/new" variant="secondary" className="self-start md:self-auto">
            Create an organisation
          </ButtonLink>
        </div>
        <form role="search" action="/orgs" method="get" className="mt-10 flex max-w-[640px] gap-3">
          <label htmlFor="orgs-q" className="sr-only">
            Search organisations by name or handle
          </label>
          <input
            id="orgs-q"
            type="search"
            name="q"
            defaultValue={query}
            maxLength={ORG_QUERY_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder="Name or handle"
            className="border-hairline-strong bg-surface-1 text-ink placeholder:text-ink-muted focus:border-primary/60 rounded-card h-12 min-w-0 flex-1 border px-4 text-[17px] outline-none"
          />
          <button type="submit" className={buttonClasses('primary', 'lg', 'shrink-0')}>
            Search
          </button>
        </form>
        <p className="text-ink-muted mt-2 min-h-5 text-sm">{tooShort ? 'Type at least 2 characters.' : ''}</p>
      </Container>
    </section>
    <Container className="pb-24 md:pb-32">
      <DirectoryList key={query} query={query} page={page} />
    </Container>
  </SiteLayout>
)

export const getServerSideProps: GetServerSideProps<OrgsPageProps> = async ({ query, res }) => {
  const raw = parseOrgQuery(query['q'])
  const tooShort = !isOrgSearchable(raw)
  const q = tooShort ? '' : raw
  const page = await withTimeout(searchOrganizations(q), SSR_DATA_TIMEOUT_MS).catch((error: unknown) => {
    console.error('Organisation directory unavailable:', error instanceof Error ? error.message : error)
    return null
  })
  // A result page is never stored (an organisation may unlist itself at any moment); the bare listing is cached like /apps.
  res.setHeader('Cache-Control', peopleCacheControl(q, page !== null))
  return { props: { query: q, tooShort, page } }
}

export default OrgsPage
```

- [ ] **Step 4: Footer, sitemap, wallet check**

In `components/site/nav.ts`, in the `Product` column, add after `{ label: 'People', href: '/people' },`:

```ts
      { label: 'Organisations', href: '/orgs' },
```

In `lib/sitemap.ts`, replace `STATIC_PATHS` with:

```ts
export const STATIC_PATHS = ['/', '/apps', '/people', '/orgs', '/verify', '/developers', '/trust', '/ecosystem']
```

In `scripts/check-wallet-chunks.mjs`, replace `MARKETING_PAGES` with:

```js
const MARKETING_PAGES = ['/', '/apps', '/people', '/orgs', '/org/[id]', '/verify', '/developers', '/trust', '/ecosystem', '/app/[did]', '/profile/[id]', '/404', '/500']
```

- [ ] **Step 5: Run the specs**

Run: `pnpm exec playwright test e2e/orgs-directory.spec.ts e2e/site-shell.spec.ts e2e/crawling.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS. (If `crawling.spec.ts` pins the exact sitemap list, add `/orgs` to its expectation in the same position as in `STATIC_PATHS`.)

- [ ] **Step 6: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed: 13 marketing pages load no wallet code."

```bash
git add pages/orgs.tsx components/orgs components/site/nav.ts lib/sitemap.ts scripts/check-wallet-chunks.mjs e2e/orgs-directory.spec.ts e2e/crawling.spec.ts
git commit -m "feat(orgs): the /orgs directory"
```

### Task 5: Create an organisation and join by invite link

**Files:**
- Create: `e2e/support/org-manage.ts`, `lib/orgs/create-form.ts`, `lib/orgs/invites.ts`, `components/org/sign-in-panel.tsx`, `components/org/org-body-loading.tsx`, `components/org/switch-row.tsx`, `components/org/use-org-handle-availability.ts`, `components/org-new/create-org-body.tsx`, `pages/org/new.tsx`, `components/org/invite-accept.tsx`, `pages/invite/[token].tsx`
- Modify: `services/analytics/events.ts` (three events), `components/analytics/analytics.tsx` (invite paths), `scripts/check-wallet-chunks.mjs` (`/invite/[token]`)
- Test: `e2e/org-join.spec.ts`

**Interfaces:**
- Consumes: `useMeSession`, `MeSession` (`components/me/use-me-session.ts`); `orgWriter`, `sessionSigner` (Task 2); `orgHandleAvailability`, `orgInviteLinkPreview`, `Organization`, `OrgSummary`, `OrgInviteLinkPreview` (Task 1); `normalizeOrgHandle`, `orgHandleProblem`, `handleFromName` (Task 1); `manageHref`, `roleLabel`, `shortAddress` (Task 3); `OrgAvatar`, `OrgVerification` (Task 3); `Field`, `inputClass` (`components/profile-edit/field.tsx`); `withLazyWalletShell`; `useOpenPanelAnalytics`, `ANALYTICS_EVENTS`; `formatDay` (`lib/verify/format.ts`).
- Produces:
  - `lib/orgs/create-form.ts`: `ORG_LIMITS = { name: 64, bio: 280, url: 2048 }`, `interface CreateOrgForm { name; handle; bio; website; listed; membersPublic }`, `type CreateOrgField = 'name' | 'handle' | 'bio' | 'website'`, `EMPTY_CREATE_FORM`, `isHttpUrl(value): boolean`, `isCreateOrgField(value: string): value is CreateOrgField`, `createOrgProblems(form): Partial<Record<CreateOrgField, string>>`, `createOrgArgs(form): Record<string, unknown>`.
  - `lib/orgs/invites.ts`: `type InviteLinkState = 'usable' | 'expired' | 'revoked' | 'full'`, `inviteLinkState(preview): InviteLinkState`, `INVITE_STATE_TEXT`, `ROLE_MEANING: Record<OrgRole, string>`, `INVITE_TOKEN_RE`.
  - `SignInPanel({ title, text, login })`, `OrgBodyLoading({ error })`, `SwitchRow({ id, label, hint, checked, onChange, disabled? })` (role `switch`, named by `label`), `useOrgHandleAvailability(handle): HandleState` with `type HandleState = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'reserved' | 'unknown'`.
  - Pages `/org/new` (h1 "Create an organisation") and `/invite/<token>` (h1 "Join <name>", button "Join <name>").
  - `e2e/support/org-manage.ts`: `OWNER`, `BOB`, `CAROL`, `DAVE` addresses; `interface ManageSetup { wallet; orgId; me; org }`; `openManagePage(page, { role, section, org?, members?, answers?, ready? }): Promise<ManageSetup>`; `defaultMembers(orgId, me, role): OrgMember[]`; `signedWrite(wallet, mutation, orgId, match?): Promise<Record<string, unknown>>` (finds the forwarded request, checks the wallet signed exactly its arguments, returns them without `auth`).
  - `ANALYTICS_EVENTS.orgCreated = 'org.created'`, `orgInviteSent = 'org.invite.sent'`, `orgInviteAccepted = 'org.invite.accepted'`.

- [ ] **Step 1: Write the failing test**

Create `e2e/org-join.spec.ts`:

```ts
import { test, expect, type Route } from '@playwright/test'
import { dirname, join } from 'node:path'
import { createOrgArgs, createOrgProblems, EMPTY_CREATE_FORM } from '../lib/orgs/create-form'
import { inviteLinkState } from '../lib/orgs/invites'
import { organization, orgMember, orgSummary } from './support/org-fixtures'
import { signedWrite } from './support/org-manage'
import { fixtureStub, STUB_SWITCHBOARD_URL, stubRequests } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'

const ORG = orgSummary({ id: 'a0c0ffee-0000-4000-8000-00000000b001', handle: 'acme-join', name: 'Acme Join Works', verifiedDomains: ['acme-join.example'] })
const TOKEN = 'joinTokenUsableAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const preview = (over: Record<string, unknown>) => ({
  data: { orgInviteLink: { org: ORG, role: 'PUBLISHER', expiresAt: '2026-10-19T10:00:00.000Z', expired: false, revoked: false, full: false, usable: true, ...over } },
})
const OPENPANEL_TRACKER = join(
  dirname(require.resolve('@openpanel/web', { paths: [dirname(require.resolve('@openpanel/nextjs'))] })),
  'src/tracker.global.js',
)

test.beforeAll(async () => {
  await fixtureStub({ match: 'query OrgInviteLinkPreview', variables: TOKEN, response: preview({}) })
  await fixtureStub({ match: 'query OrgInviteLinkPreview', variables: 'joinTokenExpiredAAAAAAAAAAAAAAAAAAAAAAAAAAAA', response: preview({ expired: true, usable: false }) })
  await fixtureStub({ match: 'query OrgInviteLinkPreview', variables: 'joinTokenRevokedAAAAAAAAAAAAAAAAAAAAAAAAAAAA', response: preview({ revoked: true, usable: false }) })
  await fixtureStub({ match: 'query OrgInviteLinkPreview', variables: 'joinTokenFullAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', response: preview({ full: true, usable: false }) })
  await fixtureStub({
    match: 'mutation AcceptOrgInviteLink',
    variables: TOKEN,
    response: { data: { acceptOrgInviteLink: orgMember({ orgId: ORG.id, address: '0x0e000000000000000000000000000000000000e5', role: 'PUBLISHER' }) } },
  })
})

test.describe('create form rules', () => {
  test('asks for a name and a valid handle, omits blank optional fields', () => {
    expect(createOrgProblems(EMPTY_CREATE_FORM)).toEqual({ name: 'Give the organisation a name.', handle: 'Choose a handle.' })
    expect(createOrgProblems({ ...EMPTY_CREATE_FORM, name: 'Acme', handle: 'acme', website: 'acme.example' })).toEqual({
      website: 'Use a full address starting with https://.',
    })
    expect(createOrgArgs({ ...EMPTY_CREATE_FORM, name: ' Acme ', handle: ' @Acme ', bio: '  ', website: '' })).toEqual({
      handle: 'acme',
      name: 'Acme',
      listed: false,
      membersPublic: false,
    })
    expect(inviteLinkState({ usable: false, expired: true, revoked: true, full: true })).toBe('revoked')
    expect(inviteLinkState({ usable: true, expired: false, revoked: false, full: false })).toBe('usable')
  })
})

test.describe('/invite/[token]', () => {
  test('previews the organisation and role without leaking the token', async ({ page }) => {
    const res = await page.goto(`/invite/${TOKEN}`)
    expect(res?.status()).toBe(200)
    expect(res?.headers()['cache-control']).toBe('private, no-store')
    expect(res?.headers()['referrer-policy']).toBe('no-referrer')
    await expect(page.getByRole('heading', { level: 1, name: 'Join Acme Join Works' })).toBeVisible()
    await expect(page.getByText('Verified: acme-join.example')).toBeVisible()
    await expect(page.getByText('You are invited to join as Publisher.')).toBeVisible()
    await expect(page.getByText('This link expires on 19 October 2026.')).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
    await expect(page.getByRole('button', { name: 'Sign in to join' })).toBeVisible({ timeout: 30_000 })
  })

  test('explains expired, revoked and used-up links, and 404s unknown ones', async ({ page }) => {
    for (const [token, text] of [
      ['joinTokenExpiredAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'This invite link has expired.'],
      ['joinTokenRevokedAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'This invite link was revoked.'],
      ['joinTokenFullAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'This invite link has been used as many times as it allows.'],
    ]) {
      await page.goto(`/invite/${token}`)
      await expect(page.getByRole('status')).toContainText(text)
      await expect(page.getByRole('button', { name: /Join/ })).toHaveCount(0)
    }
    expect((await page.goto('/invite/joinTokenUnknownAAAAAAAAAAAAAAAAAAAAAAAAAAAA'))?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Invite not found' })).toBeVisible()
    expect((await page.goto('/invite/short'))?.status()).toBe(404)
  })

  test('joins with one signature and opens the organisation', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-join-bearer' })
    await page.goto(`/invite/${TOKEN}`)
    await page.getByRole('button', { name: 'Join Acme Join Works' }).click()
    await expect(page).toHaveURL(/\/org\/acme-join\/manage\/members$/, { timeout: 30_000 })
    expect(await signedWrite(wallet, 'acceptOrgInviteLink', null, (v) => v.token === TOKEN)).toEqual({ token: TOKEN })
  })

  test('never sends the invite token to analytics', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as { __renownE2eOpenPanel?: string }).__renownE2eOpenPanel = 'e2e-openpanel'
    })
    await page.route(/openpanel\.dev\/op1\.js/, (route) => route.fulfill({ path: OPENPANEL_TRACKER, contentType: 'application/javascript' }))
    const events: string[] = []
    await page.route(/api\.openpanel\.dev/, (route: Route) => {
      events.push(route.request().postData() ?? '')
      return route.fulfill({ json: {} })
    })
    await page.goto(`/invite/${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Join Acme Join Works' })).toBeVisible()
    await page.getByRole('contentinfo').getByRole('link', { name: 'Organisations' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Organisations on Renown' })).toBeVisible()
    await expect.poll(() => events.some((e) => e.includes('/orgs')), { timeout: 15_000 }).toBe(true)
    await page.waitForTimeout(500)
    expect(events.join('\n')).not.toContain(TOKEN)
    expect(events.join('\n')).not.toContain('/invite/')
  })
})

test.describe('/org/new', () => {
  test('asks visitors to sign in', async ({ page }) => {
    await page.goto('/org/new')
    await expect(page.getByRole('heading', { level: 1, name: 'Create an organisation' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('creates an organisation with a suggested handle and opens it', async ({ page }) => {
    const handle = `acme-${Date.now().toString(36)}`
    await fixtureStub({
      match: 'mutation CreateOrganization',
      variables: handle,
      response: { data: { createOrganization: organization({ id: crypto.randomUUID(), handle, name: 'Acme Create' }) } },
    })
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const body = route.request().postDataJSON() as { query: string; variables: { handle?: string } }
      if (!body.query.includes('query OrgHandleAvailability')) return route.continue()
      const taken = body.variables.handle === 'acme-taken'
      return route.fulfill({ json: { data: { orgHandleAvailability: { handle: body.variables.handle, available: !taken, reason: taken ? 'TAKEN' : null } } } })
    })
    const wallet = await signInTestWallet(page, { bearer: 'e2e-create-bearer' })
    await page.goto('/org/new')
    await page.getByLabel('Name', { exact: true }).fill('Acme Create')
    await expect(page.getByLabel('Handle')).toHaveValue('acme-create')
    await page.getByLabel('Handle').fill('acme-taken')
    await expect(page.getByText('This handle is taken.')).toBeVisible()
    await page.getByRole('button', { name: 'Create organisation' }).click()
    expect(await stubRequests('mutation CreateOrganization(').then((r) => r.filter((x) => x.variables.handle === 'acme-taken'))).toEqual([])
    await page.getByLabel('Handle').fill(handle)
    await expect(page.getByText(`renown.id/@${handle} is available.`)).toBeVisible()
    await page.getByRole('switch', { name: 'List in the organisation directory' }).click()
    await page.getByRole('button', { name: 'Create organisation' }).click()
    await expect(page).toHaveURL(new RegExp(`/org/${handle}/manage/members$`), { timeout: 30_000 })
    expect(await signedWrite(wallet, 'createOrganization', null, (v) => v.handle === handle)).toEqual({
      handle,
      name: 'Acme Create',
      listed: true,
      membersPublic: false,
    })
  })
})
```

(`signedWrite` comes from `e2e/support/org-manage.ts`, created in Step 2.)

- [ ] **Step 2: Add the manage-page test support**

The join test checks its signed write with the helper the manage specs share; it lives in its own support file.

Create `e2e/support/org-manage.ts`:

```ts
// Manage-page test support: a signed-in test wallet with a role in a fresh
// organisation (reads answered in the browser), and a check that a write
// reached the switchboard signed over exactly its arguments.
import { expect, type Page } from '@playwright/test'
import { verifyMessage, type Hex } from 'viem'
import type { Organization, OrgMember, OrgRole } from '../../services/orgs'
import { orgMessage } from '../../services/org-signed-messages'
import type { InjectedWallet } from './injected-wallet'
import { APP_DID_A, APP_DID_B, membership, organization, orgInvite, orgInviteLink, orgMember, serveOrgReads } from './org-fixtures'
import { stubRequests, type RecordedRequest } from './stub-switchboard-client'
import { signInTestWallet } from './test-session'

export const OWNER = '0x0a000000000000000000000000000000000000a1'
export const BOB = '0x0b000000000000000000000000000000000000b2'
export const CAROL = '0x0c000000000000000000000000000000000000c3'
export const DAVE = '0x0d000000000000000000000000000000000000d4'

export interface ManageSetup {
  wallet: InjectedWallet
  orgId: string
  /** The test wallet, lowercase. */
  me: string
  org: Organization
}

export function defaultMembers(orgId: string, me: string, role: OrgRole): OrgMember[] {
  return [
    orgMember({ orgId, address: me, role, displayName: 'You Tester' }),
    orgMember({ orgId, address: OWNER, role: 'OWNER', displayName: 'Olga Owner' }),
    orgMember({ orgId, address: BOB, role: 'PUBLISHER', displayName: 'Bob Builder', handle: 'bob-builder', teams: ['core'] }),
    orgMember({ orgId, address: CAROL, role: 'MEMBER', displayName: 'Carol Member' }),
  ]
}

type Answer = (variables: Record<string, unknown>) => unknown

export async function openManagePage(
  page: Page,
  options: {
    role: OrgRole
    section: string
    org?: Partial<Organization>
    members?: (orgId: string, me: string) => OrgMember[]
    answers?: Record<string, Answer>
    /** false: do not wait for the organisation's heading (a non-member sees a notice instead). */
    ready?: boolean
  },
): Promise<ManageSetup> {
  const wallet = await signInTestWallet(page, { bearer: 'e2e-org-bearer' })
  const orgId = crypto.randomUUID()
  const me = wallet.address.toLowerCase()
  const org = organization({
    id: orgId,
    did: `did:web:www.renown.id:org:${orgId}`,
    handle: 'acme-manage',
    name: 'Acme Manage',
    apps: [
      { appDid: APP_DID_A, addedAt: '2026-10-02T10:00:00.000Z', frozen: false },
      { appDid: APP_DID_B, addedAt: '2026-10-03T10:00:00.000Z', frozen: false },
    ],
    viewerMembership: membership(orgId, me, options.role),
    ...options.org,
  })
  const members = options.members?.(orgId, me) ?? defaultMembers(orgId, me, options.role)
  await serveOrgReads(page, {
    OrgByRef: () => ({ organization: org }),
    OrgMembers: () => ({ organizationMembers: members }),
    OrgInvites: () => ({ orgInvites: [orgInvite({ id: 'inv-dave', orgId, address: DAVE, role: 'PUBLISHER' })] }),
    OrgInviteLinks: () => ({ orgInviteLinks: [orgInviteLink({ orgId })] }),
    ...options.answers,
  })
  await page.goto(`/org/acme-manage/manage/${options.section}`)
  if (options.ready !== false) await expect(page.getByRole('heading', { level: 1, name: org.name })).toBeVisible({ timeout: 30_000 })
  return { wallet, orgId, me, org }
}

/**
 * The arguments of the `mutation` the switchboard received from this wallet
 * (for `orgId`, and matching `match`), after checking that the wallet personal_signed
 * orgMessage() of exactly those arguments. `auth` is removed.
 */
export async function signedWrite(
  wallet: InjectedWallet,
  mutation: string,
  orgId: string | null,
  match?: (variables: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  const operation = mutation.charAt(0).toUpperCase() + mutation.slice(1)
  const found: { request?: RecordedRequest } = {}
  await expect
    .poll(
      async () => {
        found.request = (await stubRequests(`mutation ${operation}(`)).find(
          (r) =>
            (r.variables.auth as { address?: string } | undefined)?.address?.toLowerCase() === wallet.address.toLowerCase() &&
            (orgId === null || r.variables.orgId === orgId) &&
            (!match || match(r.variables)),
        )
        return found.request !== undefined
      },
      { timeout: 15_000 },
    )
    .toBe(true)
  const { auth, ...args } = found.request!.variables as Record<string, unknown> & { auth: { signature: Hex; timestamp: string } }
  const message = await orgMessage(mutation, orgId, args, auth.timestamp)
  expect(wallet.personalSignRequests).toContain(message)
  expect(await verifyMessage({ address: wallet.address, message, signature: auth.signature })).toBe(true)
  return args
}
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-join.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../lib/orgs/create-form'`.

- [ ] **Step 4: Pure rules for the form and invite links**

Create `lib/orgs/create-form.ts`:

```ts
// The create-organisation form: what it checks before signing and the exact
// arguments it signs. The switchboard checks everything again. Pure.
import { normalizeOrgHandle, orgHandleProblem } from './handles'

export const ORG_LIMITS = { name: 64, bio: 280, url: 2048 } as const

export interface CreateOrgForm {
  name: string
  handle: string
  bio: string
  website: string
  listed: boolean
  membersPublic: boolean
}

export type CreateOrgField = 'name' | 'handle' | 'bio' | 'website'

export const EMPTY_CREATE_FORM: CreateOrgForm = { name: '', handle: '', bio: '', website: '', listed: false, membersPublic: false }

export function isHttpUrl(value: string): boolean {
  if (value.length > ORG_LIMITS.url) return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export function isCreateOrgField(value: string): value is CreateOrgField {
  return value === 'name' || value === 'handle' || value === 'bio' || value === 'website'
}

export function createOrgProblems(form: CreateOrgForm): Partial<Record<CreateOrgField, string>> {
  const problems: Partial<Record<CreateOrgField, string>> = {}
  const name = form.name.trim()
  if (!name) problems.name = 'Give the organisation a name.'
  else if (name.length > ORG_LIMITS.name) problems.name = `Use at most ${ORG_LIMITS.name} characters.`
  const handle = orgHandleProblem(normalizeOrgHandle(form.handle))
  if (handle) problems.handle = handle
  if (form.bio.trim().length > ORG_LIMITS.bio) problems.bio = `Use at most ${ORG_LIMITS.bio} characters.`
  const website = form.website.trim()
  if (website && !isHttpUrl(website)) problems.website = 'Use a full address starting with https://.'
  return problems
}

/** The createOrganization arguments: trimmed, handle normalised, blank optional fields left out (not sent, not signed). */
export function createOrgArgs(form: CreateOrgForm): Record<string, unknown> {
  const bio = form.bio.trim()
  const website = form.website.trim()
  return {
    handle: normalizeOrgHandle(form.handle),
    name: form.name.trim(),
    ...(bio && { bio }),
    ...(website && { website }),
    listed: form.listed,
    membersPublic: form.membersPublic,
  }
}
```

Create `lib/orgs/invites.ts`:

```ts
// Invite links as the invite page explains them. Pure.
import type { OrgRole } from '../../services/org-signed-messages'

/** 32 random bytes in base64url are 43 characters; anything far off is not a token. */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/

export type InviteLinkState = 'usable' | 'expired' | 'revoked' | 'full'

export function inviteLinkState(preview: { usable: boolean; expired: boolean; revoked: boolean; full: boolean }): InviteLinkState {
  if (preview.revoked) return 'revoked'
  if (preview.expired) return 'expired'
  if (preview.full) return 'full'
  return preview.usable ? 'usable' : 'expired'
}

export const INVITE_STATE_TEXT: Record<Exclude<InviteLinkState, 'usable'>, string> = {
  expired: 'This invite link has expired. Ask the organisation for a new one.',
  revoked: 'This invite link was revoked. Ask the organisation for a new one.',
  full: 'This invite link has been used as many times as it allows. Ask the organisation for a new one.',
}

export const ROLE_MEANING: Record<OrgRole, string> = {
  MEMBER: 'Members see who else belongs, and apps that ask about your organisations learn that you are one.',
  PUBLISHER: 'Publishers also edit the apps they are given, authorise app keys for them and sign off releases.',
  ADMIN: 'Admins also manage members, teams, domains and settings.',
  OWNER: 'Owners also approve high-risk changes such as new owners and transfers.',
}
```

- [ ] **Step 5: Shared pieces for signed-in organisation pages**

Create `components/org/sign-in-panel.tsx`:

```tsx
import { buttonClasses } from '../site/primitives'

/** A page body for signed-out visitors: what the page is for and a sign-in button. */
export function SignInPanel({ title, text, login }: { title: string; text: string; login: () => void }) {
  return (
    <div className="border-hairline bg-surface-1 shadow-card rounded-panel mx-auto max-w-lg border px-6 py-12 text-center md:px-10">
      <h1 className="text-ink text-h2">{title}</h1>
      <p className="text-ink-muted mt-4 leading-7">{text}</p>
      <button type="button" onClick={login} className={buttonClasses('primary', 'lg', 'mt-8')}>
        Sign in
      </button>
    </div>
  )
}
```

Create `components/org/org-body-loading.tsx`:

```tsx
import type { WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'

/** An organisation page body while the session (or the wallet code) loads. */
export function OrgBodyLoading({ error }: WalletFallbackProps) {
  if (error) return <WalletLoadError />
  return (
    <p role="status" className="text-ink-muted py-24 text-center">
      Loading…
    </p>
  )
}
```

Create `components/org/switch-row.tsx`:

```tsx
import { cx } from '../../utils/cx'

interface SwitchRowProps {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

/** A labelled on/off switch with a sentence on what it does. */
export function SwitchRow({ id, label, hint, checked, onChange, disabled = false }: SwitchRowProps) {
  return (
    <div className="border-hairline flex items-start justify-between gap-4 rounded-xl border p-4">
      <div className="min-w-0 space-y-1">
        <span id={`${id}-label`} className="text-ink block text-sm font-semibold">
          {label}
        </span>
        <p id={`${id}-hint`} className="text-ink-muted text-xs leading-5">
          {hint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60',
          checked ? 'bg-primary border-primary' : 'bg-background border-ink-muted',
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'inline-block h-5 w-5 rounded-full shadow-sm transition-transform motion-reduce:transition-none',
            checked ? 'bg-background translate-x-5' : 'bg-ink-muted translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}
```

Create `components/org/use-org-handle-availability.ts`:

```ts
import { useEffect, useState } from 'react'
import { orgHandleProblem } from '../../lib/orgs/handles'
import { orgHandleAvailability } from '../../services/orgs'

export type HandleState = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'reserved' | 'unknown'

/** Whether `handle` (normalised) is free, asked 400 ms after the last change. */
export function useOrgHandleAvailability(handle: string): HandleState {
  const [answer, setAnswer] = useState<{ handle: string; state: HandleState } | null>(null)
  const checkable = handle !== '' && orgHandleProblem(handle) === null

  useEffect(() => {
    if (!checkable) return
    let cancelled = false
    const timer = setTimeout(() => {
      orgHandleAvailability(handle).then(
        (result) => {
          if (cancelled) return
          const state: HandleState = result.available
            ? 'available'
            : result.reason === 'RESERVED'
              ? 'reserved'
              : result.reason === 'INVALID'
                ? 'invalid'
                : 'taken'
          setAnswer({ handle, state })
        },
        () => {
          if (!cancelled) setAnswer({ handle, state: 'unknown' })
        },
      )
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [handle, checkable])

  if (!handle) return 'idle'
  if (!checkable) return 'invalid'
  return answer?.handle === handle ? answer.state : 'checking'
}
```

- [ ] **Step 6: `/org/new`**

Create `components/org-new/create-org-body.tsx`:

```tsx
// /org/new's form. It signs with the wallet session, so pages/org/new.tsx
// loads it inside the wallet shell.
import { useRouter } from 'next/router'
import { useState, type FormEvent } from 'react'
import { createOrgArgs, createOrgProblems, EMPTY_CREATE_FORM, isCreateOrgField, ORG_LIMITS, type CreateOrgField, type CreateOrgForm } from '../../lib/orgs/create-form'
import { manageHref } from '../../lib/orgs/format'
import { handleFromName, normalizeOrgHandle } from '../../lib/orgs/handles'
import { ANALYTICS_EVENTS, useOpenPanelAnalytics } from '../../services/analytics'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import type { Organization } from '../../services/orgs'
import { useMeSession, type MeSession } from '../me/use-me-session'
import { OrgBodyLoading } from '../org/org-body-loading'
import { SignInPanel } from '../org/sign-in-panel'
import { SwitchRow } from '../org/switch-row'
import { useOrgHandleAvailability, type HandleState } from '../org/use-org-handle-availability'
import { Field, inputClass } from '../profile-edit/field'
import { buttonClasses } from '../site/primitives'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

const HANDLE_HINT: Record<HandleState, string> = {
  idle: 'Your organisation’s address on Renown: renown.id/@handle.',
  invalid: '',
  checking: 'Checking…',
  available: '',
  taken: '',
  reserved: '',
  unknown: 'Availability could not be checked. Renown checks it again when you create the organisation.',
}

export function CreateOrgBody() {
  const session = useMeSession()
  if (session.state === 'loading') return <OrgBodyLoading error={null} />
  if (session.state === 'signed-out') {
    return (
      <SignInPanel
        title="Create an organisation"
        text="Sign in to create an organisation. You become its first owner and can invite others once it exists."
        login={session.login}
      />
    )
  }
  return <CreateOrgForm key={session.address} session={session} />
}

function CreateOrgForm({ session }: { session: SignedIn }) {
  const router = useRouter()
  const { track } = useOpenPanelAnalytics()
  const [form, setForm] = useState<CreateOrgForm>(EMPTY_CREATE_FORM)
  const [handleEdited, setHandleEdited] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverErrors, setServerErrors] = useState<Partial<Record<CreateOrgField, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const handle = normalizeOrgHandle(form.handle)
  const availability = useOrgHandleAvailability(handle)
  const problems = { ...createOrgProblems(form), ...serverErrors }
  const handleError =
    problems.handle ?? (availability === 'taken' ? 'This handle is taken.' : availability === 'reserved' ? 'This handle is reserved.' : undefined)
  const handleHint = availability === 'available' ? `renown.id/@${handle} is available.` : HANDLE_HINT[availability]

  function set<K extends keyof CreateOrgForm>(key: K, value: CreateOrgForm[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'name' && !handleEdited) next.handle = handleFromName(String(value))
      return next
    })
    if (isCreateOrgField(key)) {
      setServerErrors((errors) => {
        const next = { ...errors }
        delete next[key]
        return next
      })
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setFailure(null)
    if (Object.values(createOrgProblems(form)).some(Boolean) || availability === 'taken' || availability === 'reserved') return
    setSaving(true)
    const result = await orgWriter(sessionSigner(session)).write<Organization>('createOrganization', createOrgArgs(form))
    if (result.ok) {
      track(ANALYTICS_EVENTS.orgCreated)
      await router.push(manageHref(result.data.handle))
      return
    }
    setSaving(false)
    if (result.code === 'HANDLE_TAKEN' || result.code === 'HANDLE_RESERVED') setServerErrors({ handle: result.message })
    else if (result.code === 'BAD_USER_INPUT' && result.field && isCreateOrgField(result.field)) setServerErrors({ [result.field]: result.message })
    else setFailure(result.message)
  }

  const show = (field: CreateOrgField) => (submitted ? problems[field] : undefined)

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-ink text-h2">Create an organisation</h1>
        <p className="text-ink-muted mt-3 leading-7">
          An organisation has its own page, handle and identity. You become its first owner; add a second owner later so no single
          wallet controls it.
        </p>
      </div>
      <Field id="org-name" label="Name" error={show('name')} counter={`${form.name.trim().length}/${ORG_LIMITS.name}`}>
        <input id="org-name" className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="organization" />
      </Field>
      <Field id="org-handle" label="Handle" error={submitted || form.handle ? handleError : undefined} hint={handleHint}>
        <input
          id="org-handle"
          className={inputClass}
          value={form.handle}
          onChange={(e) => {
            setHandleEdited(true)
            set('handle', e.target.value)
          }}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field id="org-bio" label="Bio" error={show('bio')} hint="Optional." counter={`${form.bio.trim().length}/${ORG_LIMITS.bio}`}>
        <textarea id="org-bio" rows={3} className={inputClass} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
      </Field>
      <Field id="org-website" label="Website" error={show('website')} hint="Optional. You can verify your domain later.">
        <input id="org-website" type="url" className={inputClass} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
      </Field>
      <SwitchRow
        id="org-listed"
        label="List in the organisation directory"
        hint="Anyone can find it on renown.id/orgs. Its page is public either way."
        checked={form.listed}
        onChange={(value) => set('listed', value)}
      />
      <SwitchRow
        id="org-members-public"
        label="Show members publicly"
        hint="Members can still hide themselves. When off, only members see who belongs."
        checked={form.membersPublic}
        onChange={(value) => set('membersPublic', value)}
      />
      {failure && (
        <p role="alert" className="text-danger-ink text-sm">
          {failure}
        </p>
      )}
      <button type="submit" disabled={saving} className={buttonClasses('primary', 'lg')}>
        {saving ? 'Creating…' : 'Create organisation'}
      </button>
    </form>
  )
}
```

Create `pages/org/new.tsx`:

```tsx
import type { NextPage } from 'next'
import { OrgBodyLoading } from '../../components/org/org-body-loading'
import { PageMeta } from '../../components/site/page-meta'
import { Container } from '../../components/site/primitives'
import { SiteLayout } from '../../components/site/site-layout'
import { withLazyWalletShell } from '../../components/wallet/lazy-wallet-shell'

// The form with the wallet stack, loaded in the browser only.
const CreateOrgBody = withLazyWalletShell(
  () => import('../../components/org-new/create-org-body').then((m) => m.CreateOrgBody),
  OrgBodyLoading,
)

const NewOrgPage: NextPage = () => (
  <SiteLayout>
    <PageMeta title="Create an organisation" description="Create an organisation on Renown: a shared identity for a team that publishes apps." path="/org/new" noindex />
    <Container className="min-h-[60vh] pt-12 pb-24 md:pt-16">
      <CreateOrgBody />
    </Container>
  </SiteLayout>
)

export default NewOrgPage
```

- [ ] **Step 7: `/invite/[token]`**

Create `components/org/invite-accept.tsx`:

```tsx
// The invite page's "Join" control. It signs with the wallet session, so
// pages/invite/[token].tsx loads it inside the wallet shell.
import { useRouter } from 'next/router'
import { useState } from 'react'
import { manageHref, shortAddress } from '../../lib/orgs/format'
import { ANALYTICS_EVENTS, useOpenPanelAnalytics } from '../../services/analytics'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import type { OrgRole, OrgSummary } from '../../services/orgs'
import { useMeSession } from '../me/use-me-session'
import { buttonClasses } from '../site/primitives'
import type { WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'

export function InviteAcceptLoading({ error }: WalletFallbackProps) {
  if (error) return <WalletLoadError />
  return <span aria-hidden="true" className="bg-surface-2 mx-auto block h-12 w-56 rounded-full motion-safe:animate-pulse" />
}

export function InviteAccept({ token, org, role }: { token: string; org: OrgSummary; role: OrgRole }) {
  const session = useMeSession()
  const router = useRouter()
  const { track } = useOpenPanelAnalytics()
  const [state, setState] = useState<{ status: 'idle' | 'joining' } | { status: 'error'; message: string }>({ status: 'idle' })

  if (session.state === 'loading') return <InviteAcceptLoading error={null} />
  if (session.state === 'signed-out') {
    return (
      <button type="button" onClick={session.login} className={buttonClasses('primary', 'lg')}>
        Sign in to join
      </button>
    )
  }
  const signedIn = session

  async function join() {
    setState({ status: 'joining' })
    const result = await orgWriter(sessionSigner(signedIn)).write('acceptOrgInviteLink', { token })
    if (result.ok) {
      track(ANALYTICS_EVENTS.orgInviteAccepted, { role })
      await router.push(manageHref(org.handle))
      return
    }
    setState({ status: 'error', message: result.message })
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => void join()} disabled={state.status === 'joining'} className={buttonClasses('primary', 'lg')}>
        {state.status === 'joining' ? 'Joining…' : `Join ${org.name}`}
      </button>
      <p className="text-ink-muted text-xs">
        Signed in as <span className="font-mono">{shortAddress(signedIn.address)}</span>
      </p>
      {state.status === 'error' && (
        <p role="alert" className="text-danger-ink text-sm">
          {state.message}
        </p>
      )}
    </div>
  )
}
```

Create `pages/invite/[token].tsx`:

```tsx
import type { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'
import { InviteAcceptLoading } from '../../components/org/invite-accept'
import { OrgAvatar } from '../../components/org/org-avatar'
import { OrgVerification } from '../../components/org/org-verification'
import { Container } from '../../components/site/primitives'
import { SiteLayout } from '../../components/site/site-layout'
import { NotFoundPage } from '../../components/ui/not-found-page'
import { withLazyWalletShell } from '../../components/wallet/lazy-wallet-shell'
import { roleLabel } from '../../lib/orgs/format'
import { INVITE_STATE_TEXT, INVITE_TOKEN_RE, inviteLinkState, ROLE_MEANING } from '../../lib/orgs/invites'
import { formatDay } from '../../lib/verify/format'
import { orgInviteLinkPreview, type OrgInviteLinkPreview } from '../../services/orgs'
import { SSR_DATA_TIMEOUT_MS, withTimeout } from '../../utils/with-timeout'

interface InvitePageProps {
  preview: OrgInviteLinkPreview | null
  token: string
  unavailable: boolean
}

// Only the Join control loads the wallet stack; the preview is plain HTML.
const InviteAccept = withLazyWalletShell(
  () => import('../../components/org/invite-accept').then((m) => m.InviteAccept),
  InviteAcceptLoading,
)

const InvitePage: NextPage<InvitePageProps> = ({ preview, token, unavailable }) => {
  if (unavailable) return <NotFoundPage title="Something went wrong" message="Invites are temporarily unavailable. Please try again in a moment." />
  if (!preview) return <NotFoundPage title="Invite not found" message="This invite link does not exist. Ask the organisation for a new one." />
  const { org, role } = preview
  const state = inviteLinkState(preview)
  return (
    <SiteLayout>
      <Head>
        <title>{`Join ${org.name} - Renown`}</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <Container className="pt-14 pb-24 md:pt-20">
        <div className="border-hairline bg-surface-1 shadow-card rounded-panel mx-auto max-w-lg border px-6 py-10 text-center md:px-10">
          <span className="mx-auto block w-fit">
            <OrgAvatar org={org} className="h-20 w-20" />
          </span>
          <h1 className="text-ink text-h2 mt-6 text-balance break-words">Join {org.name}</h1>
          <p className="text-ink-muted mt-2 break-all">@{org.handle}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <OrgVerification verifiedDomains={org.verifiedDomains} />
          </div>
          <p className="text-ink mt-6 leading-7">
            You are invited to join as {roleLabel(role)}. <span className="text-ink-muted">{ROLE_MEANING[role]}</span>
          </p>
          {state === 'usable' ? (
            <>
              <p className="text-ink-muted mt-2 text-sm">This link expires on {formatDay(preview.expiresAt)}.</p>
              <div className="mt-8">
                <InviteAccept token={token} org={org} role={role} />
              </div>
            </>
          ) : (
            <p role="status" className="text-ink mt-8 font-semibold">
              {INVITE_STATE_TEXT[state]}
            </p>
          )}
          <p className="text-ink-muted mt-8 text-xs leading-5">
            Joining is signed with your wallet. The organisation sees your address, and your public profile if you have one.
          </p>
        </div>
      </Container>
    </SiteLayout>
  )
}

export const getServerSideProps: GetServerSideProps<InvitePageProps> = async ({ params, res }) => {
  const token = String(params?.token ?? '')
  // The URL carries a secret: never stored by a cache, never passed on as a Referer.
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (!INVITE_TOKEN_RE.test(token)) {
    res.statusCode = 404
    return { props: { preview: null, token: '', unavailable: false } }
  }
  try {
    const preview = await withTimeout(orgInviteLinkPreview(token), SSR_DATA_TIMEOUT_MS)
    if (!preview) res.statusCode = 404
    return { props: { preview, token: preview ? token : '', unavailable: false } }
  } catch (error) {
    console.error('Invite preview unavailable:', error instanceof Error ? error.name : 'error')
    res.statusCode = 503
    res.setHeader('Retry-After', '30')
    return { props: { preview: null, token: '', unavailable: true } }
  }
}

export default InvitePage
```

(The sentence "You are invited to join as Publisher." is followed by the role's meaning in a `<span>`; the test's `getByText` finds the paragraph by its first sentence because Playwright matches a substring of the element's text unless `exact` is set.)

- [ ] **Step 8: Analytics events and the invite guard**

In `services/analytics/events.ts`, add to `ANALYTICS_EVENTS` before `signOut`:

```ts
  orgCreated: 'org.created',
  orgInviteSent: 'org.invite.sent',
  orgInviteAccepted: 'org.invite.accepted',
```

In `components/analytics/analytics.tsx`, replace:

```tsx
/** A /verify share link: its fragment carries what someone pasted and must never be recorded. */
function hasPrivateFragment(): boolean {
  return window.location.hash.startsWith('#v=')
}
```

with:

```tsx
/**
 * A URL that carries a secret and must never be recorded: a /verify share
 * link (its fragment holds what someone pasted) or an invite link (its path
 * holds the token).
 */
function hasPrivateFragment(): boolean {
  return window.location.hash.startsWith('#v=') || window.location.pathname.startsWith('/invite/')
}
```

and update the comment above `clientSnapshot` to "The cookies, or null while the URL holds a secret (OpenPanel records the full URL)."

In `scripts/check-wallet-chunks.mjs`, add `'/invite/[token]'` to `MARKETING_PAGES` after `'/org/[id]'`.

- [ ] **Step 9: Run the specs**

Run: `pnpm exec playwright test e2e/org-join.spec.ts e2e/verify-page.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS (the verify page's analytics test still passes with the extended guard).

- [ ] **Step 10: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed: 14 marketing pages load no wallet code."

```bash
git add e2e/support/org-manage.ts lib/orgs/create-form.ts lib/orgs/invites.ts components/org components/org-new pages/org/new.tsx "pages/invite/[token].tsx" services/analytics/events.ts components/analytics/analytics.tsx scripts/check-wallet-chunks.mjs e2e/org-join.spec.ts
git commit -m "feat(orgs): create an organisation and join by invite link"
```

---

### Task 6: Manage shell and the members section

**Files:**
- Create: `lib/orgs/manage-sections.ts`, `lib/orgs/members.ts`, `lib/orgs/active-org.ts`, `hooks/use-now.ts`, `components/org-manage/manage-context.ts`, `components/org-manage/manage-loading.tsx`, `components/org-manage/manage-ui.tsx`, `components/org-manage/manage-nav.tsx`, `components/org-manage/manage-body.tsx`, `components/org-manage/section-components.tsx`, `components/org-manage/members-section.tsx`, `components/org-manage/invite-panel.tsx`, `components/org-manage/invite-links-panel.tsx`, `components/org-manage/member-list.tsx`, `components/org-manage/scope-editor.tsx`, `pages/org/[id]/manage/index.tsx`, `pages/org/[id]/manage/[section].tsx`
- Test: `e2e/org-manage-members.spec.ts` (uses `e2e/support/org-manage.ts` from Task 5)

**Interfaces:**
- Consumes: `useMeSession`; `useRemote`, `Remote` (Task 2); `orgWriter`, `sessionSigner` (Task 2); `fetchOrganization`, `organizationMembers`, `orgInvites`, `orgInviteLinks`, types (Task 1); `OrgMutationName` (Task 1); `roleAtLeast` (Task 1); `orgRef`, `normalizeOrgHandle`, `ORG_HANDLE_RE` (Task 1); `orgErrorText` (Task 1); `manageHref`, `orgPath`, `roleLabel`, `memberLabel`, `plural`, `shortAddress`, `inviteLinkUrl` (Task 3); `OrgAvatar` (Task 3); `SignInPanel` (Task 5); `Field`, `inputClass`; `useToasts`, `ToastRegion`; `formatRelative`.
- Produces:
  - `lib/orgs/manage-sections.ts`: `interface ManageSectionMeta { key: string; label: string; minRole: OrgRole }`, `MANAGE_SECTIONS: ManageSectionMeta[]` (Task 7 and B2 add entries), `manageSection(key): ManageSectionMeta | null`, `sectionsFor(role): ManageSectionMeta[]`, `minRoleText(role): string`.
  - `lib/orgs/members.ts`: `inviteRoles(viewer): OrgRole[]`, `LINK_ROLES`, `assignableRoles(viewer, target): OrgRole[]`, `canRemove(viewer, target): boolean`, `canRevokeInvite(viewer, inviteRole): boolean`, `parseInvitee(raw): { invitee: string } | { problem: string }`, `LINK_EXPIRY_DAYS`, `linkExpiresAt(days, now): string`, `linkUsesProblem(raw): string | null`, `expiryText(expiresAt, now): string`.
  - `lib/orgs/active-org.ts`: `ACTIVE_ORG_KEY = 'renown.activeOrg'`, `readActiveOrg(): string | null`, `writeActiveOrg(orgId: string): void`, `activeFirst<T extends { org: { id: string } }>(items: T[], active: string | null): T[]`.
  - `hooks/use-now.ts`: `useNow(intervalMs?: number): Date`.
  - `components/org-manage/manage-context.ts`: `interface ManageContext { org: Organization; role: OrgRole; address: string; getBearer: () => Promise<string | null>; run: <T>(name: OrgMutationName, args: Record<string, unknown>, success: string) => Promise<T | null>; reloadOrg: () => void; notify: (tone: 'success' | 'error', text: string) => void }`, `interface ManageSectionProps { ctx: ManageContext }`.
  - `components/org-manage/manage-ui.tsx`: `Panel({ id, title, description?, actions?, children })` (an `h3` region), `RemoteView<T>({ remote, what, onRetry, children: (value: T) => ReactNode })`, `ConfirmButton({ label, confirm, onConfirm, busy? })`.
  - `components/org-manage/section-components.tsx`: `SECTION_COMPONENTS: Record<string, ComponentType<ManageSectionProps>>` (Task 7 and B2 add entries).
  - Route `/org/<handle or id>/manage/<section>` (unknown section: 404); `/org/<id>/manage` → `/org/<id>/manage/members`.

- [ ] **Step 1: Write the failing test**

Create `e2e/org-manage-members.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { assignableRoles, canRemove, canRevokeInvite, inviteRoles, linkExpiresAt, linkUsesProblem, parseInvitee } from '../lib/orgs/members'
import { APP_DID_A, orgInvite, orgInviteLink, orgMember } from './support/org-fixtures'
import { BOB, CAROL, openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub } from './support/stub-switchboard-client'

test.describe('member rules', () => {
  test('only the roles the viewer may grant, remove or revoke', () => {
    expect(inviteRoles('OWNER')).toEqual(['MEMBER', 'PUBLISHER', 'ADMIN'])
    expect(inviteRoles('ADMIN')).toEqual(['MEMBER', 'PUBLISHER'])
    expect(inviteRoles('PUBLISHER')).toEqual([])
    expect(assignableRoles('ADMIN', 'PUBLISHER')).toEqual(['MEMBER', 'PUBLISHER'])
    expect(assignableRoles('ADMIN', 'ADMIN')).toEqual([])
    expect(assignableRoles('OWNER', 'ADMIN')).toEqual(['MEMBER', 'PUBLISHER', 'ADMIN'])
    expect(assignableRoles('OWNER', 'OWNER')).toEqual([])
    expect(canRemove('ADMIN', 'PUBLISHER')).toBe(true)
    expect(canRemove('ADMIN', 'ADMIN')).toBe(false)
    expect(canRemove('OWNER', 'ADMIN')).toBe(true)
    expect(canRemove('OWNER', 'OWNER')).toBe(false)
    expect(canRevokeInvite('ADMIN', 'ADMIN')).toBe(false)
    expect(canRevokeInvite('OWNER', 'ADMIN')).toBe(true)
  })

  test('invitees, link expiry and uses', () => {
    expect(parseInvitee(' 0xAbC0000000000000000000000000000000000001 ')).toEqual({ invitee: '0xabc0000000000000000000000000000000000001' })
    expect(parseInvitee('@Bob-Builder')).toEqual({ invitee: 'bob-builder' })
    expect(parseInvitee('bo')).toEqual({ problem: 'Enter a 0x wallet address or a Renown handle.' })
    const now = new Date('2026-10-12T12:00:00.000Z')
    expect(linkExpiresAt(7, now)).toBe('2026-10-19T12:00:00.000Z')
    // 30 days is the switchboard's limit: stay 10 minutes inside it for clock skew.
    expect(linkExpiresAt(30, now)).toBe('2026-11-11T11:50:00.000Z')
    expect(linkUsesProblem('0')).toBe('Use a whole number from 1 to 100.')
    expect(linkUsesProblem('1.5')).toBe('Use a whole number from 1 to 100.')
    expect(linkUsesProblem('101')).toBe('Use a whole number from 1 to 100.')
    expect(linkUsesProblem('100')).toBeNull()
  })
})

test.describe('manage: members', () => {
  test('asks visitors to sign in', async ({ page }) => {
    await page.goto('/org/acme-manage/manage/members')
    await expect(page.getByRole('heading', { level: 1, name: 'Manage an organisation' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('a signed-in wallet that is not a member is told so', async ({ page }) => {
    await openManagePage(page, { role: 'MEMBER', section: 'members', org: { viewerMembership: null }, ready: false })
    await expect(page.getByRole('heading', { level: 1, name: 'You are not a member of Acme Manage' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('link', { name: 'View its public page' })).toHaveAttribute('href', '/@acme-manage')
  })

  test('an admin invites a handle as publisher with one signature', async ({ page }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'members' })
    await fixtureStub({
      match: 'mutation InviteOrgMember',
      variables: setup.orgId,
      response: { data: { inviteOrgMember: orgInvite({ orgId: setup.orgId, address: '0x0f000000000000000000000000000000000000f6', role: 'PUBLISHER' }) } },
    })
    await page.getByLabel('Address or handle').fill('not a handle!')
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expect(page.getByText('Enter a 0x wallet address or a Renown handle.')).toBeVisible()
    await page.getByLabel('Address or handle').fill('@Bob-Builder2')
    await page.getByLabel('Role', { exact: true }).first().selectOption('PUBLISHER')
    await page.getByRole('button', { name: 'Send invite' }).click()
    await expect(page.getByText('Invite sent to bob-builder2.')).toBeVisible()
    expect(await signedWrite(setup.wallet, 'inviteOrgMember', setup.orgId)).toEqual({ orgId: setup.orgId, invitee: 'bob-builder2', role: 'PUBLISHER' })
  })

  test('offers only the roles the viewer may grant', async ({ page, browser }) => {
    await openManagePage(page, { role: 'ADMIN', section: 'members' })
    const rows = page.getByRole('list', { name: 'Members' }).getByRole('listitem')
    await expect(rows.filter({ hasText: 'Bob Builder' }).getByLabel('Role of Bob Builder').locator('option')).toHaveText(['Member', 'Publisher'])
    const owner = rows.filter({ hasText: 'Olga Owner' })
    await expect(owner.getByText('Owner', { exact: true })).toBeVisible()
    await expect(owner.getByRole('combobox')).toHaveCount(0)
    await expect(owner.getByRole('button', { name: /Remove/ })).toHaveCount(0)
    const ownerPage = await browser.newPage()
    await openManagePage(ownerPage, { role: 'OWNER', section: 'members' })
    await expect(
      ownerPage.getByRole('list', { name: 'Members' }).getByLabel('Role of Bob Builder').locator('option'),
    ).toHaveText(['Member', 'Publisher', 'Admin'])
    await ownerPage.close()
  })

  test('creates an invite link and shows it once', async ({ page }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'members' })
    const token = 'manageLinkTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    await fixtureStub({
      match: 'mutation CreateOrgInviteLink',
      variables: setup.orgId,
      response: { data: { createOrgInviteLink: { link: orgInviteLink({ orgId: setup.orgId, role: 'PUBLISHER', maxUses: 5 }), token } } },
    })
    await page.getByLabel('Role', { exact: true }).nth(1).selectOption('PUBLISHER')
    await page.getByLabel('Uses').fill('5')
    await page.getByLabel('Expires after').selectOption('30')
    const before = Date.now()
    await page.getByRole('button', { name: 'Create invite link' }).click()
    const shown = page.getByRole('region', { name: 'New invite link' })
    await expect(shown).toContainText(`http://localhost:3000/invite/${token}`)
    await expect(shown).toContainText('Renown shows it only once')
    const args = await signedWrite(setup.wallet, 'createOrgInviteLink', setup.orgId)
    expect(args).toMatchObject({ orgId: setup.orgId, role: 'PUBLISHER', maxUses: 5 })
    const expires = Date.parse(String(args.expiresAt))
    expect(expires).toBeGreaterThan(before + 30 * 86_400_000 - 11 * 60_000)
    expect(expires).toBeLessThanOrEqual(Date.now() + 30 * 86_400_000 - 10 * 60_000)
  })

  test('removes a member after confirming, revokes an invite and sets app access', async ({ page }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'members' })
    const answer = (name: string, value: unknown) =>
      fixtureStub({ match: `mutation ${name}`, variables: setup.orgId, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
    await answer('RemoveOrgMember', orgMember({ orgId: setup.orgId, address: CAROL, status: 'REMOVED' }))
    await answer('RevokeOrgInvite', orgInvite({ orgId: setup.orgId, address: '0x0d000000000000000000000000000000000000d4', status: 'REVOKED' }))
    await answer('SetOrgMemberAppScope', orgMember({ orgId: setup.orgId, address: BOB, role: 'PUBLISHER' }))
    const rows = page.getByRole('list', { name: 'Members' }).getByRole('listitem')

    await rows.filter({ hasText: 'Carol Member' }).getByRole('button', { name: 'Remove Carol Member' }).click()
    await page.getByRole('button', { name: 'Yes, remove Carol Member' }).click()
    expect(await signedWrite(setup.wallet, 'removeOrgMember', setup.orgId)).toEqual({ orgId: setup.orgId, address: CAROL })

    await page.getByRole('button', { name: 'Revoke the invite for 0x0d00…00d4' }).click()
    expect(await signedWrite(setup.wallet, 'revokeOrgInvite', setup.orgId)).toEqual({ orgId: setup.orgId, inviteId: 'inv-dave' })

    const bob = rows.filter({ hasText: 'Bob Builder' })
    await bob.getByRole('button', { name: 'App access' }).click()
    await bob.getByLabel('Only these apps').check()
    await bob.getByLabel(APP_DID_A).check()
    await bob.getByRole('button', { name: 'Save app access' }).click()
    expect(await signedWrite(setup.wallet, 'setOrgMemberAppScope', setup.orgId)).toEqual({
      orgId: setup.orgId,
      address: BOB,
      appScope: { all: false, appDids: [APP_DID_A] },
    })
  })

  test('an unknown section is a 404 and the bare manage URL opens members', async ({ request }) => {
    expect((await request.get('/org/acme-manage/manage/nope')).status()).toBe(404)
    const bare = await request.get('/org/acme-manage/manage', { maxRedirects: 0 })
    expect(bare.status()).toBe(307)
    expect(bare.headers().location).toBe('/org/acme-manage/manage/members')
  })
})
```

(`openManagePage` waits for the organisation's `h1` unless `ready: false`; a non-member gets a notice instead.)

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-manage-members.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../lib/orgs/members'`.

- [ ] **Step 3: Pure rules, the remembered org and a clock**

Create `lib/orgs/manage-sections.ts`:

```ts
// The manage sections, their order and who may open them. The components live
// in components/org-manage/section-components.tsx (loaded with the wallet
// shell); this list is all the page route needs. Pure.
import { roleAtLeast, type OrgRole } from '../../services/org-signed-messages'

export interface ManageSectionMeta {
  key: string
  label: string
  minRole: OrgRole
}

export const MANAGE_SECTIONS: ManageSectionMeta[] = [{ key: 'members', label: 'Members', minRole: 'MEMBER' }]

export function manageSection(key: string): ManageSectionMeta | null {
  return MANAGE_SECTIONS.find((section) => section.key === key) ?? null
}

export function sectionsFor(role: OrgRole): ManageSectionMeta[] {
  return MANAGE_SECTIONS.filter((section) => roleAtLeast(role, section.minRole))
}

/** "admins and owners", for "Only … can open Settings." */
export function minRoleText(role: OrgRole): string {
  if (role === 'OWNER') return 'owners'
  if (role === 'ADMIN') return 'admins and owners'
  if (role === 'PUBLISHER') return 'publishers, admins and owners'
  return 'members'
}
```

Create `lib/orgs/members.ts`:

```ts
// Who may do what to whom on the members page (renown-package A1 ruling 11),
// and the invite helpers. The switchboard decides; the UI hides what it would
// refuse. Pure.
import { formatRelative } from '../../utils/relative-time'
import type { OrgRole } from '../../services/org-signed-messages'
import { normalizeOrgHandle, ORG_HANDLE_RE } from './handles'

const RANK: Record<OrgRole, number> = { MEMBER: 0, PUBLISHER: 1, ADMIN: 2, OWNER: 3 }
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Roles a viewer may invite with. */
export function inviteRoles(viewer: OrgRole): OrgRole[] {
  if (viewer === 'OWNER') return ['MEMBER', 'PUBLISHER', 'ADMIN']
  if (viewer === 'ADMIN') return ['MEMBER', 'PUBLISHER']
  return []
}

/** Invite links grant at most PUBLISHER. */
export const LINK_ROLES: OrgRole[] = ['MEMBER', 'PUBLISHER']

/** Roles a viewer may set on a member of role `target` (empty: no control). Owners change only through proposals. */
export function assignableRoles(viewer: OrgRole, target: OrgRole): OrgRole[] {
  if (target === 'OWNER') return []
  if (viewer === 'OWNER') return ['MEMBER', 'PUBLISHER', 'ADMIN']
  if (viewer === 'ADMIN' && target !== 'ADMIN') return ['MEMBER', 'PUBLISHER']
  return []
}

export function canRemove(viewer: OrgRole, target: OrgRole): boolean {
  if (target === 'OWNER') return false
  return viewer === 'OWNER' || (viewer === 'ADMIN' && RANK[target] <= RANK.PUBLISHER)
}

export function canRevokeInvite(viewer: OrgRole, inviteRole: OrgRole): boolean {
  return viewer === 'OWNER' || (viewer === 'ADMIN' && RANK[inviteRole] <= RANK.PUBLISHER)
}

/** An invitee as the switchboard takes it: a lowercase address or a handle. */
export function parseInvitee(raw: string): { invitee: string } | { problem: string } {
  const text = raw.trim()
  if (/^0x[0-9a-fA-F]{40}$/.test(text)) return { invitee: text.toLowerCase() }
  const handle = normalizeOrgHandle(text)
  if (ORG_HANDLE_RE.test(handle)) return { invitee: handle }
  return { problem: 'Enter a 0x wallet address or a Renown handle.' }
}

export const LINK_EXPIRY_DAYS = [1, 7, 14, 30] as const

/** `days` from `now`; the 30-day choice stays 10 minutes inside the switchboard's 30-day limit. */
export function linkExpiresAt(days: number, now: Date): string {
  const ms = days * DAY - (days >= 30 ? 10 * MINUTE : 0)
  return new Date(now.getTime() + ms).toISOString()
}

export function linkUsesProblem(raw: string): string | null {
  const uses = Number(raw)
  return raw.trim() !== '' && Number.isInteger(uses) && uses >= 1 && uses <= 100 ? null : 'Use a whole number from 1 to 100.'
}

/** "Expires in 6 days" or "Expired". */
export function expiryText(expiresAt: string, now: Date): string {
  return Date.parse(expiresAt) <= now.getTime() ? 'Expired' : `Expires ${formatRelative(expiresAt, now)}`
}
```

Create `lib/orgs/active-org.ts`:

```ts
// The organisation the visitor last managed (spec 5: localStorage
// "renown.activeOrg"): listed first in the account menu. Storage may be
// unavailable; then nothing is remembered.

export const ACTIVE_ORG_KEY = 'renown.activeOrg'

export function readActiveOrg(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_ORG_KEY)
  } catch {
    return null
  }
}

export function writeActiveOrg(orgId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_ORG_KEY, orgId)
  } catch {
    // storage blocked: the menu keeps its default order
  }
}

/** `items` with the active organisation first, the rest in their order. */
export function activeFirst<T extends { org: { id: string } }>(items: T[], active: string | null): T[] {
  if (!active) return items
  return [...items.filter((item) => item.org.id === active), ...items.filter((item) => item.org.id !== active)]
}
```

Create `hooks/use-now.ts`:

```ts
import { useEffect, useState } from 'react'

/** "Now", refreshed every `intervalMs` so countdowns and expiry texts stay true. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
```

- [ ] **Step 4: The manage shell**

Create `components/org-manage/manage-context.ts`:

```ts
import type { OrgMutationName } from '../../services/org-mutations'
import type { Organization, OrgRole } from '../../services/orgs'

/** What every manage section gets from the shell. */
export interface ManageContext {
  /** The organisation as the viewer sees it (teams and apps included). */
  org: Organization
  /** The viewer's role. */
  role: OrgRole
  /** The viewer's address, lowercase. */
  address: string
  getBearer: () => Promise<string | null>
  /** Signs and sends a write, then shows a toast with `success` or the failure. Resolves with the result, or null when it failed. */
  run: <T>(name: OrgMutationName, args: Record<string, unknown>, success: string) => Promise<T | null>
  /** Re-reads the organisation (its teams, apps, settings and the viewer's role). */
  reloadOrg: () => void
  notify: (tone: 'success' | 'error', text: string) => void
}

export interface ManageSectionProps {
  ctx: ManageContext
}
```

Create `components/org-manage/manage-loading.tsx`:

```tsx
import type { WalletFallbackProps } from '../wallet/lazy-wallet-shell'
import { WalletLoadError } from '../wallet/wallet-load-error'

/** The manage pages while the session, the wallet code or the organisation load. */
export function ManageLoading({ error }: WalletFallbackProps) {
  if (error) return <WalletLoadError />
  return (
    <p role="status" className="text-ink-muted py-24 text-center">
      Loading the organisation…
    </p>
  )
}
```

Create `components/org-manage/manage-ui.tsx`:

```tsx
import { useState, type ReactNode } from 'react'
import type { Remote } from '../../hooks/use-remote'
import { orgErrorText } from '../../lib/orgs/errors'
import { buttonClasses } from '../site/primitives'

/** A titled block of a manage section (h3 region). */
export function Panel({ id, title, description, actions, children }: { id: string; title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-hairline bg-surface-1 rounded-card min-w-0 border p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={id} className="text-ink text-lg font-semibold">
            {title}
          </h3>
          {description && <p className="text-ink-muted mt-1 max-w-[70ch] text-sm leading-6">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

/** A read's three states: loading, failed (with a retry) or its content. */
export function RemoteView<T>({ remote, what, onRetry, children }: { remote: Remote<T>; what: string; onRetry: () => void; children: (value: T) => ReactNode }) {
  if (remote.status === 'loading') {
    return (
      <p role="status" className="text-ink-muted text-sm">
        Loading {what}…
      </p>
    )
  }
  if (remote.status === 'error') {
    return (
      <div role="alert" className="text-sm">
        <p className="text-ink">
          The {what} did not load. {orgErrorText(remote.error.code)}
        </p>
        <button type="button" onClick={onRetry} className={buttonClasses('secondary', 'md', 'mt-3')}>
          Try again
        </button>
      </div>
    )
  }
  return <>{children(remote.value)}</>
}

/** A destructive action that asks once more in place before it runs. */
export function ConfirmButton({ label, confirm, onConfirm, busy = false }: { label: string; confirm: string; onConfirm: () => void; busy?: boolean }) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <button type="button" disabled={busy} onClick={() => setAsking(true)} className={buttonClasses('ghost', 'md', 'text-danger-ink')}>
        {label}
      </button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
        className={buttonClasses('secondary', 'md', 'border-danger-ink/50 text-danger-ink')}
      >
        {confirm}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={buttonClasses('ghost', 'md')}>
        Cancel
      </button>
    </span>
  )
}
```

Create `components/org-manage/manage-nav.tsx`:

```tsx
import Link from 'next/link'
import { manageHref } from '../../lib/orgs/format'
import type { ManageSectionMeta } from '../../lib/orgs/manage-sections'
import { cx } from '../../utils/cx'

/** The sections the viewer may open: a row that scrolls sideways on phones, a column from lg. */
export function ManageNav({ handle, sections, current }: { handle: string; sections: ManageSectionMeta[]; current: string }) {
  return (
    <nav aria-label="Organisation settings" className="-mx-4 min-w-0 lg:mx-0">
      <ul className="flex gap-1 overflow-x-auto px-4 pb-2 lg:flex-col lg:overflow-visible lg:px-0">
        {sections.map((section) => (
          <li key={section.key} className="shrink-0">
            <Link
              href={manageHref(handle, section.key)}
              aria-current={section.key === current ? 'page' : undefined}
              className={cx(
                'block rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors lg:rounded-xl',
                section.key === current ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

Create `components/org-manage/section-components.tsx`:

```tsx
import type { ComponentType } from 'react'
import type { ManageSectionProps } from './manage-context'
import { MembersSection } from './members-section'

/** Each section key of lib/orgs/manage-sections.ts with its component. */
export const SECTION_COMPONENTS: Record<string, ComponentType<ManageSectionProps>> = {
  members: MembersSection,
}
```

Create `components/org-manage/manage-body.tsx`:

```tsx
// The manage pages' body, inside the wallet shell: the session, the
// organisation as the viewer sees it, the section nav and the section.
import Link from 'next/link'
import { useCallback, useEffect, type ReactNode } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { writeActiveOrg } from '../../lib/orgs/active-org'
import { orgPath, roleLabel } from '../../lib/orgs/format'
import { orgRef } from '../../lib/orgs/handles'
import { manageSection, minRoleText, sectionsFor } from '../../lib/orgs/manage-sections'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import type { OrgMutationName } from '../../services/org-mutations'
import { roleAtLeast } from '../../services/org-signed-messages'
import { fetchOrganization, type Organization, type OrgRole } from '../../services/orgs'
import { useMeSession, type MeSession } from '../me/use-me-session'
import { OrgAvatar } from '../org/org-avatar'
import { SignInPanel } from '../org/sign-in-panel'
import { Badge, buttonClasses } from '../site/primitives'
import { ToastRegion, useToasts } from '../site/toast'
import type { ManageContext } from './manage-context'
import { ManageLoading } from './manage-loading'
import { ManageNav } from './manage-nav'
import { SECTION_COMPONENTS } from './section-components'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-hairline bg-surface-1 rounded-panel mx-auto max-w-lg border px-6 py-12 text-center">
      <h1 className="text-ink text-h3">{title}</h1>
      <div className="text-ink-muted mt-3 leading-7">{children}</div>
    </div>
  )
}

function ManageHeader({ org, role }: { org: Organization; role: OrgRole }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <OrgAvatar org={org} className="h-14 w-14" />
        <div className="min-w-0">
          <p className="text-ink-muted text-sm">Manage organisation</p>
          <h1 className="text-ink text-h2 truncate">{org.name}</h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">Your role: {roleLabel(role)}</Badge>
        <Link href={orgPath(org.handle)} className={buttonClasses('secondary', 'md')}>
          View public page
        </Link>
      </div>
    </header>
  )
}

export function ManageBody({ reference, section }: { reference: string; section: string }) {
  const session = useMeSession()
  if (session.state === 'loading') return <ManageLoading error={null} />
  if (session.state === 'signed-out') {
    return <SignInPanel title="Manage an organisation" text="Sign in with the wallet that belongs to this organisation." login={session.login} />
  }
  return <ManageOrg key={session.address} session={session} reference={reference} section={section} />
}

function ManageOrg({ session, reference, section }: { session: SignedIn; reference: string; section: string }) {
  const { toasts, show, dismiss } = useToasts()
  const { getBearer } = session
  const load = useCallback(async () => fetchOrganization(orgRef(reference), await getBearer()), [reference, getBearer])
  const remote = useRemote(`${reference}:${session.address.toLowerCase()}`, load)
  const org = remote.state.status === 'ready' ? remote.state.value : null
  const memberOf = org?.viewerMembership ? org.id : null

  useEffect(() => {
    if (memberOf) writeActiveOrg(memberOf)
  }, [memberOf])

  if (remote.state.status === 'loading') return <ManageLoading error={null} />
  if (remote.state.status === 'error') {
    return (
      <Notice title="The organisation did not load">
        <p>Renown did not answer. Nothing was changed.</p>
        <button type="button" onClick={remote.reload} className={buttonClasses('primary', 'md', 'mt-6')}>
          Try again
        </button>
      </Notice>
    )
  }
  if (!org) {
    return (
      <Notice title="Organisation not found">
        <p>No organisation has this name or id.</p>
      </Notice>
    )
  }
  const membership = org.viewerMembership
  if (!membership) {
    return (
      <Notice title={`You are not a member of ${org.name}`}>
        <p>Only members can open these pages. If you were invited, accept the invite on Your Renown first.</p>
        <Link href={orgPath(org.handle)} className={buttonClasses('secondary', 'md', 'mt-6')}>
          View its public page
        </Link>
      </Notice>
    )
  }

  const writer = orgWriter(sessionSigner(session))
  async function run<T>(name: OrgMutationName, args: Record<string, unknown>, success: string): Promise<T | null> {
    const result = await writer.write<T>(name, args)
    if (result.ok) {
      show('success', success)
      return result.data
    }
    show('error', result.message)
    return null
  }
  const ctx: ManageContext = {
    org,
    role: membership.role,
    address: session.address.toLowerCase(),
    getBearer,
    run,
    reloadOrg: remote.reload,
    notify: show,
  }
  const meta = manageSection(section)
  const Section = SECTION_COMPONENTS[section]
  const allowed = meta !== null && roleAtLeast(membership.role, meta.minRole)

  return (
    <>
      <ManageHeader org={org} role={membership.role} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <ManageNav handle={org.handle} sections={sectionsFor(membership.role)} current={section} />
        <div className="min-w-0">
          <h2 className="text-ink text-h3">{meta?.label ?? 'Not found'}</h2>
          {meta && allowed && Section ? (
            <Section ctx={ctx} />
          ) : (
            <p role="status" className="text-ink-muted mt-4">
              {meta ? `Only ${minRoleText(meta.minRole)} can open ${meta.label}.` : 'This section does not exist.'}
            </p>
          )}
        </div>
      </div>
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
```

Create `pages/org/[id]/manage/[section].tsx`:

```tsx
import type { GetServerSideProps, NextPage } from 'next'
import { ManageLoading } from '../../../../components/org-manage/manage-loading'
import { PageMeta } from '../../../../components/site/page-meta'
import { Container } from '../../../../components/site/primitives'
import { SiteLayout } from '../../../../components/site/site-layout'
import { withLazyWalletShell } from '../../../../components/wallet/lazy-wallet-shell'
import { manageSection } from '../../../../lib/orgs/manage-sections'

interface ManagePageProps {
  /** The org handle (or id) from the URL. */
  reference: string
  section: string
  label: string
}

// The manage body with the wallet stack, loaded in the browser only.
const ManageBody = withLazyWalletShell(
  () => import('../../../../components/org-manage/manage-body').then((m) => m.ManageBody),
  ManageLoading,
)

const ManagePage: NextPage<ManagePageProps> = ({ reference, section, label }) => (
  <SiteLayout>
    <PageMeta title={`${label} - Manage organisation`} description="Manage an organisation on Renown." noindex />
    <Container className="min-h-[60vh] max-w-[1120px] pt-10 pb-24 md:pt-14">
      <ManageBody reference={reference} section={section} />
    </Container>
  </SiteLayout>
)

export const getServerSideProps: GetServerSideProps<ManagePageProps> = async ({ params, res }) => {
  const meta = manageSection(String(params?.section ?? ''))
  if (!meta) return { notFound: true }
  res.setHeader('Cache-Control', 'private, no-store')
  return { props: { reference: String(params?.id ?? ''), section: meta.key, label: meta.label } }
}

export default ManagePage
```

Create `pages/org/[id]/manage/index.tsx`:

```tsx
import type { GetServerSideProps } from 'next'

/** /org/<id>/manage opens the members section. */
export const getServerSideProps: GetServerSideProps = async ({ params }) => ({
  redirect: { destination: `/org/${encodeURIComponent(String(params?.id ?? ''))}/manage/members`, permanent: false },
})

export default function ManageIndex() {
  return null
}
```

- [ ] **Step 5: The members section**

Create `components/org-manage/members-section.tsx`:

```tsx
import { useCallback } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { roleAtLeast } from '../../services/org-signed-messages'
import { organizationMembers, orgInviteLinks, orgInvites } from '../../services/orgs'
import { InviteLinksPanel } from './invite-links-panel'
import { InvitePanel } from './invite-panel'
import type { ManageSectionProps } from './manage-context'
import { MemberList } from './member-list'

/** Invites and invite links (admins and owners), then the members. */
export function MembersSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const admin = roleAtLeast(ctx.role, 'ADMIN')
  const loadMembers = useCallback(async () => organizationMembers(org.id, false, await getBearer()), [org.id, getBearer])
  const loadInvites = useCallback(async () => orgInvites(org.id, await getBearer()), [org.id, getBearer])
  const loadLinks = useCallback(async () => orgInviteLinks(org.id, await getBearer()), [org.id, getBearer])
  const members = useRemote(`members:${org.id}`, loadMembers)
  const invites = useRemote(admin ? `invites:${org.id}` : null, loadInvites)
  const links = useRemote(admin ? `links:${org.id}` : null, loadLinks)
  return (
    <div className="mt-6 space-y-8">
      {admin && <InvitePanel ctx={ctx} invites={invites.state} onChange={invites.reload} />}
      {admin && <InviteLinksPanel ctx={ctx} links={links.state} onChange={links.reload} />}
      <MemberList ctx={ctx} members={members.state} onChange={members.reload} />
    </div>
  )
}
```

Create `components/org-manage/invite-panel.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import type { Remote } from '../../hooks/use-remote'
import { useNow } from '../../hooks/use-now'
import { roleLabel, shortAddress } from '../../lib/orgs/format'
import { canRevokeInvite, expiryText, inviteRoles, parseInvitee } from '../../lib/orgs/members'
import { ANALYTICS_EVENTS, useOpenPanelAnalytics } from '../../services/analytics'
import type { OrgInvite, OrgRole } from '../../services/orgs'
import { Field, inputClass } from '../profile-edit/field'
import { buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'
import { Panel, RemoteView } from './manage-ui'

export function InvitePanel({ ctx, invites, onChange }: { ctx: ManageContext; invites: Remote<OrgInvite[]>; onChange: () => void }) {
  const { track } = useOpenPanelAnalytics()
  const roles = inviteRoles(ctx.role)
  const now = useNow()
  const [text, setText] = useState('')
  const [role, setRole] = useState<OrgRole>('MEMBER')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function invite(event: FormEvent) {
    event.preventDefault()
    const parsed = parseInvitee(text)
    if ('problem' in parsed) {
      setProblem(parsed.problem)
      return
    }
    setProblem(null)
    setBusy('invite')
    const done = await ctx.run<OrgInvite>('inviteOrgMember', { orgId: ctx.org.id, invitee: parsed.invitee, role }, `Invite sent to ${parsed.invitee}.`)
    setBusy(null)
    if (done) {
      setText('')
      track(ANALYTICS_EVENTS.orgInviteSent, { role })
      onChange()
    }
  }

  async function revoke(item: OrgInvite) {
    setBusy(item.id)
    const done = await ctx.run<OrgInvite>('revokeOrgInvite', { orgId: ctx.org.id, inviteId: item.id }, 'Invite revoked.')
    setBusy(null)
    if (done) onChange()
  }

  return (
    <Panel id="invite-title" title="Invite people" description="Invite a wallet address or a Renown handle. They join when they accept; invites expire after 14 days.">
      <form onSubmit={(event) => void invite(event)} noValidate className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <Field id="invite-invitee" label="Address or handle" error={problem ?? undefined}>
            <input
              id="invite-invitee"
              className={inputClass}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setProblem(null)
              }}
              placeholder="0x… or handle"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
        <div className="md:w-44">
          <Field id="invite-role" label="Role">
            <select id="invite-role" className={inputClass} value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
              {roles.map((option) => (
                <option key={option} value={option}>
                  {roleLabel(option)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button type="submit" disabled={busy === 'invite'} className={buttonClasses('primary', 'md', 'md:mt-[1.625rem]')}>
          {busy === 'invite' ? 'Sending…' : 'Send invite'}
        </button>
      </form>
      <h4 className="text-ink mt-6 text-sm font-semibold">Pending invites</h4>
      <div className="mt-2">
        <RemoteView remote={invites} what="pending invites" onRetry={onChange}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">No pending invites.</p>
            ) : (
              <ul aria-label="Pending invites" className="divide-hairline divide-y">
                {list.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-ink truncate font-mono text-sm">{item.address}</p>
                      <p className="text-ink-muted text-xs">
                        {roleLabel(item.role)}, {expiryText(item.expiresAt, now).toLowerCase()}
                      </p>
                    </div>
                    {canRevokeInvite(ctx.role, item.role) && item.status === 'INVITED' && (
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => void revoke(item)}
                        aria-label={`Revoke the invite for ${shortAddress(item.address)}`}
                        className={buttonClasses('ghost', 'md')}
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </div>
    </Panel>
  )
}
```

Create `components/org-manage/invite-links-panel.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import type { Remote } from '../../hooks/use-remote'
import { useNow } from '../../hooks/use-now'
import { inviteLinkUrl, plural, roleLabel } from '../../lib/orgs/format'
import { expiryText, LINK_EXPIRY_DAYS, LINK_ROLES, linkExpiresAt, linkUsesProblem } from '../../lib/orgs/members'
import type { OrgInviteLink, OrgInviteLinkCreated, OrgRole } from '../../services/orgs'
import { Field, inputClass } from '../profile-edit/field'
import { buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'
import { Panel, RemoteView } from './manage-ui'

export function InviteLinksPanel({ ctx, links, onChange }: { ctx: ManageContext; links: Remote<OrgInviteLink[]>; onChange: () => void }) {
  const now = useNow()
  const [role, setRole] = useState<OrgRole>('MEMBER')
  const [uses, setUses] = useState('10')
  const [days, setDays] = useState<number>(7)
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const usesProblem = linkUsesProblem(uses)

  async function create(event: FormEvent) {
    event.preventDefault()
    if (usesProblem) return
    setBusy('create')
    const done = await ctx.run<OrgInviteLinkCreated>(
      'createOrgInviteLink',
      { orgId: ctx.org.id, role, maxUses: Number(uses), expiresAt: linkExpiresAt(days, new Date()) },
      'Invite link created.',
    )
    setBusy(null)
    if (done) {
      setCreated(inviteLinkUrl(window.location.origin, done.token))
      setCopied(false)
      onChange()
    }
  }

  async function revoke(link: OrgInviteLink) {
    setBusy(link.id)
    const done = await ctx.run<OrgInviteLink>('revokeOrgInviteLink', { orgId: ctx.org.id, linkId: link.id }, 'Invite link revoked.')
    setBusy(null)
    if (done) onChange()
  }

  return (
    <Panel id="links-title" title="Invite links" description="Anyone with the link can join with the role you choose, until it expires or runs out of uses.">
      <form onSubmit={(event) => void create(event)} noValidate className="grid gap-3 sm:grid-cols-3">
        <Field id="link-role" label="Role">
          <select id="link-role" className={inputClass} value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
            {LINK_ROLES.map((option) => (
              <option key={option} value={option}>
                {roleLabel(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="link-uses" label="Uses" error={usesProblem ?? undefined}>
          <input id="link-uses" type="number" min={1} max={100} inputMode="numeric" className={inputClass} value={uses} onChange={(e) => setUses(e.target.value)} />
        </Field>
        <Field id="link-expiry" label="Expires after">
          <select id="link-expiry" className={inputClass} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {LINK_EXPIRY_DAYS.map((option) => (
              <option key={option} value={option}>
                {plural(option, 'day', 'days')}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" disabled={busy === 'create'} className={buttonClasses('primary', 'md', 'justify-self-start sm:col-span-3')}>
          {busy === 'create' ? 'Creating…' : 'Create invite link'}
        </button>
      </form>
      {created && (
        <div role="region" aria-label="New invite link" className="border-primary/30 bg-primary/[0.05] rounded-card mt-5 border p-4">
          <p className="text-ink text-sm font-semibold">Copy the link now: Renown shows it only once.</p>
          <p className="text-ink mt-2 font-mono text-[13px] break-all">{created}</p>
          <button
            type="button"
            onClick={() => {
              Promise.resolve()
                .then(() => navigator.clipboard.writeText(created))
                .then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
            }}
            className={buttonClasses('secondary', 'md', 'mt-3')}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
      <div className="mt-6">
        <RemoteView remote={links} what="invite links" onRetry={onChange}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">No invite links yet.</p>
            ) : (
              <ul aria-label="Invite links" className="divide-hairline divide-y">
                {list.map((link) => {
                  const live = !link.revoked && Date.parse(link.expiresAt) > now.getTime() && link.uses < link.maxUses
                  return (
                    <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <p className="text-ink text-sm">
                        {roleLabel(link.role)}, {link.uses} of {link.maxUses} used,{' '}
                        <span className="text-ink-muted">{link.revoked ? 'revoked' : expiryText(link.expiresAt, now).toLowerCase()}</span>
                      </p>
                      {live && (
                        <button type="button" disabled={busy === link.id} onClick={() => void revoke(link)} className={buttonClasses('ghost', 'md')}>
                          Revoke link
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          }
        </RemoteView>
      </div>
    </Panel>
  )
}
```

Create `components/org-manage/scope-editor.tsx`:

```tsx
import { useState } from 'react'
import { memberLabel } from '../../lib/orgs/format'
import type { OrgMember } from '../../services/orgs'
import { buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'

/** Which of the organisation's apps a publisher may act for: all, or a chosen list. */
export function ScopeEditor({ ctx, member, onSaved }: { ctx: ManageContext; member: OrgMember; onSaved: () => void }) {
  const [all, setAll] = useState(member.appScope.all)
  const [chosen, setChosen] = useState<string[]>(member.appScope.appDids)
  const [busy, setBusy] = useState(false)
  const name = memberLabel(member)

  async function save() {
    setBusy(true)
    const done = await ctx.run(
      'setOrgMemberAppScope',
      { orgId: ctx.org.id, address: member.address, appScope: { all, appDids: all ? [] : chosen } },
      `App access of ${name} saved.`,
    )
    setBusy(false)
    if (done) onSaved()
  }

  return (
    <fieldset className="border-hairline rounded-card mt-4 border p-4">
      <legend className="text-ink px-1 text-sm font-semibold">App access for {name}</legend>
      <label className="text-ink flex items-center gap-2 text-sm">
        <input type="radio" name={`scope-${member.id}`} checked={all} onChange={() => setAll(true)} />
        All of the organisation’s apps
      </label>
      <label className="text-ink mt-2 flex items-center gap-2 text-sm">
        <input type="radio" name={`scope-${member.id}`} checked={!all} onChange={() => setAll(false)} />
        Only these apps
      </label>
      {!all &&
        (ctx.org.apps.length === 0 ? (
          <p className="text-ink-muted mt-3 pl-6 text-sm">The organisation has no apps yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 pl-6">
            {ctx.org.apps.map((app) => (
              <li key={app.appDid}>
                <label className="text-ink flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={chosen.includes(app.appDid)}
                    onChange={(e) => setChosen((current) => (e.target.checked ? [...current, app.appDid] : current.filter((did) => did !== app.appDid)))}
                  />
                  <span className="font-mono text-xs break-all">{app.appDid}</span>
                </label>
              </li>
            ))}
          </ul>
        ))}
      <p className="text-ink-muted mt-3 text-xs">Teams add their apps on top of this.</p>
      <button type="button" disabled={busy} onClick={() => void save()} className={buttonClasses('primary', 'md', 'mt-4')}>
        {busy ? 'Saving…' : 'Save app access'}
      </button>
    </fieldset>
  )
}
```

Create `components/org-manage/member-list.tsx`:

```tsx
import { useState } from 'react'
import type { Remote } from '../../hooks/use-remote'
import { memberLabel, roleLabel } from '../../lib/orgs/format'
import { assignableRoles, canRemove } from '../../lib/orgs/members'
import { roleAtLeast } from '../../services/org-signed-messages'
import type { OrgMember, OrgRole } from '../../services/orgs'
import { cx } from '../../utils/cx'
import { inputClass } from '../profile-edit/field'
import { ProfileAvatar } from '../profile/profile-avatar'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'
import { ScopeEditor } from './scope-editor'

export function MemberList({ ctx, members, onChange }: { ctx: ManageContext; members: Remote<OrgMember[]>; onChange: () => void }) {
  const admin = roleAtLeast(ctx.role, 'ADMIN')
  const [busy, setBusy] = useState<string | null>(null)
  const [scopeFor, setScopeFor] = useState<string | null>(null)

  async function changeRole(member: OrgMember, role: OrgRole) {
    setBusy(member.id)
    const done = await ctx.run('setOrgMemberRole', { orgId: ctx.org.id, address: member.address, role }, `${memberLabel(member)} is now ${roleLabel(role)}.`)
    setBusy(null)
    if (done) onChange()
  }

  async function remove(member: OrgMember) {
    setBusy(member.id)
    const done = await ctx.run('removeOrgMember', { orgId: ctx.org.id, address: member.address }, `${memberLabel(member)} was removed.`)
    setBusy(null)
    if (done) onChange()
  }

  return (
    <Panel
      id="members-title"
      title="Members"
      description={admin ? 'Owners are added and removed through proposals under Security.' : 'Everyone who belongs to the organisation.'}
    >
      <RemoteView remote={members} what="members" onRetry={onChange}>
        {(list) => (
          <ul aria-label="Members" className="divide-hairline divide-y">
            {list
              .filter((member) => member.status === 'ACTIVE')
              .map((member) => {
                const you = member.address === ctx.address
                const roles = admin && !you ? assignableRoles(ctx.role, member.role) : []
                const label = memberLabel(member)
                return (
                  <li key={member.id} className="py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <ProfileAvatar seed={member.address} alt="" className="h-10 w-10" />
                      <div className="min-w-0 flex-1">
                        <p className="text-ink truncate font-semibold">
                          {label}
                          {you && <span className="text-ink-muted font-normal"> (you)</span>}
                        </p>
                        <p className="text-ink-muted truncate font-mono text-xs">{member.address}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {member.hidden && <Badge>Hidden from the public list</Badge>}
                        {roles.length > 0 ? (
                          <>
                            <label htmlFor={`role-${member.id}`} className="sr-only">
                              Role of {label}
                            </label>
                            <select
                              id={`role-${member.id}`}
                              value={member.role}
                              disabled={busy === member.id}
                              onChange={(e) => void changeRole(member, e.target.value as OrgRole)}
                              className={cx(inputClass, 'w-auto')}
                            >
                              {roles.map((option) => (
                                <option key={option} value={option}>
                                  {roleLabel(option)}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <Badge tone={member.role === 'OWNER' ? 'primary' : 'neutral'}>{roleLabel(member.role)}</Badge>
                        )}
                        {admin && member.role === 'PUBLISHER' && (
                          <button
                            type="button"
                            aria-expanded={scopeFor === member.id}
                            onClick={() => setScopeFor(scopeFor === member.id ? null : member.id)}
                            className={buttonClasses('ghost', 'md')}
                          >
                            App access
                          </button>
                        )}
                        {admin && !you && canRemove(ctx.role, member.role) && (
                          <ConfirmButton label={`Remove ${label}`} confirm={`Yes, remove ${label}`} busy={busy === member.id} onConfirm={() => void remove(member)} />
                        )}
                      </div>
                    </div>
                    {member.teams.length > 0 && <p className="text-ink-muted mt-2 text-xs">Teams: {member.teams.join(', ')}</p>}
                    {scopeFor === member.id && (
                      <ScopeEditor
                        ctx={ctx}
                        member={member}
                        onSaved={() => {
                          setScopeFor(null)
                          onChange()
                        }}
                      />
                    )}
                  </li>
                )
              })}
          </ul>
        )}
      </RemoteView>
    </Panel>
  )
}
```

(`roleLabel` returns "Publisher", so the toast reads "Bob Builder is now Publisher." — the role names are capitalised like the badges.)

- [ ] **Step 6: Run the spec**

Run: `pnpm exec playwright test e2e/org-manage-members.spec.ts e2e/org-join.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 7: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed".

```bash
git add lib/orgs/manage-sections.ts lib/orgs/members.ts lib/orgs/active-org.ts hooks/use-now.ts components/org-manage "pages/org/[id]/manage" e2e/org-manage-members.spec.ts
git commit -m "feat(orgs): manage pages and the members section"
```

### Task 7: Manage teams and settings

**Files:**
- Create: `lib/orgs/teams.ts`, `lib/orgs/settings-form.ts`, `components/org-manage/teams-section.tsx`, `components/org-manage/settings-section.tsx`
- Modify: `lib/orgs/manage-sections.ts` (teams, settings), `components/org-manage/section-components.tsx`, `e2e/support/org-fixtures.ts` (`orgProposal`)
- Test: `e2e/org-manage-teams-settings.spec.ts`

**Interfaces:**
- Consumes: `ManageContext`, `ManageSectionProps`, `Panel`, `RemoteView`, `ConfirmButton` (Task 6); `useRemote` (Task 2); `organizationMembers`, `Organization`, `OrgLink`, `OrgMember`, `OrgTeam`, `OrgProposal` (Task 1); `normalizeOrgHandle`, `orgHandleProblem` (Task 1); `isHttpUrl`, `ORG_LIMITS` (Task 5); `SwitchRow`, `useOrgHandleAvailability` (Task 5); `memberLabel`, `plural` (Task 3); `AvatarUploader`, `LinksEditor`, `Field`, `inputClass` (`components/profile-edit/*`); `ProfileAvatar`; `openManagePage`, `signedWrite`, `BOB`, `CAROL` (Task 5).
- Produces:
  - `lib/orgs/teams.ts`: `TEAM_SLUG_RE`, `MAX_TEAMS = 50`, `MAX_TEAM_NAME = 64`, `teamProblems({ slug, name }): { slug?: string; name?: string }`, `slugFromName(name): string`, `sameSet(a, b): boolean`, `teamPatch(team: OrgTeam, draft: { slug; name; appDids }): Record<string, unknown>`.
  - `lib/orgs/settings-form.ts`: `interface OrgSettingsForm { name; bio; website; avatar: string | null; links: OrgLink[] }`, `type SettingsField = 'name' | 'bio' | 'website' | 'links'`, `settingsFormFrom(org): OrgSettingsForm`, `settingsProblems(form): Partial<Record<SettingsField, string>>`, `settingsPatch(initial, current): Record<string, unknown>` (changed fields only; `''` clears bio, website or avatar; `links` replaces).
  - `TeamsSection`, `SettingsSection` registered as `teams` (MEMBER) and `settings` (ADMIN).
  - `e2e/support/org-fixtures.ts`: `orgProposal(over: Partial<OrgProposal> & { orgId: string }): OrgProposal`.

- [ ] **Step 1: Write the failing test**

Add to `e2e/support/org-fixtures.ts` (and `OrgProposal` to its type import):

```ts
export function orgProposal(over: Partial<OrgProposal> & { orgId: string }): OrgProposal {
  return {
    id: 'proposal-1',
    kind: 'CHANGE_HANDLE',
    payload: { address: null, demoteToAdmin: null, appDid: null, toKind: null, toId: null, handle: null, domain: null },
    proposer: '0x0a000000000000000000000000000000000000a1',
    approvals: ['0x0a000000000000000000000000000000000000a1'],
    threshold: 2,
    status: 'PENDING',
    createdAt: AT,
    executableAt: null,
    expiresAt: '2026-10-15T10:00:00.000Z',
    executedAt: null,
    reason: null,
    ...over,
  }
}
```

Create `e2e/org-manage-teams-settings.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { settingsFormFrom, settingsPatch } from '../lib/orgs/settings-form'
import { slugFromName, teamPatch, teamProblems } from '../lib/orgs/teams'
import { APP_DID_A, organization, orgProposal } from './support/org-fixtures'
import { BOB, CAROL, openManagePage, signedWrite } from './support/org-manage'
import { fixtureStub } from './support/stub-switchboard-client'

const CORE = { id: 'team-core', orgId: 'x', slug: 'core', name: 'Core', appDids: [APP_DID_A], memberAddresses: [BOB] }

/** A standing answer for `name` (the mutation's operation name) for this organisation only. */
async function answer(orgId: string, name: string, value: unknown) {
  await fixtureStub({ match: `mutation ${name}`, variables: orgId, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
}

test.describe('team and settings rules', () => {
  test('team slugs, names and patches', () => {
    expect(teamProblems({ slug: 'Core', name: ' ' })).toEqual({
      slug: 'Use 1 to 40 lowercase letters, digits or hyphens, starting and ending with a letter or digit.',
      name: 'Give the team a name.',
    })
    expect(teamProblems({ slug: 'web', name: 'Web' })).toEqual({})
    expect(slugFromName('Web & Mobile')).toBe('web-mobile')
    expect(teamPatch(CORE, { slug: 'core', name: ' Core team ', appDids: [APP_DID_A] })).toEqual({ name: 'Core team' })
    expect(teamPatch(CORE, { slug: 'core', name: 'Core', appDids: [] })).toEqual({ appDids: [] })
  })

  test('settings send only what changed, and "" to clear', () => {
    const initial = settingsFormFrom(organization({ name: 'Acme', bio: 'Hi', website: 'https://acme.example' }))
    expect(settingsPatch(initial, initial)).toEqual({})
    expect(settingsPatch(initial, { ...initial, name: ' Acme Ltd ', website: '' })).toEqual({ name: 'Acme Ltd', website: '' })
    expect(settingsPatch(initial, { ...initial, links: [{ id: 'l1', label: ' Site ', url: 'https://acme.example ' }] })).toEqual({
      links: [{ id: 'l1', label: 'Site', url: 'https://acme.example' }],
    })
  })
})

test.describe('manage: teams', () => {
  test('an admin creates, edits and deletes a team', async ({ page }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'teams', org: { teams: [CORE] } })
    await answer(setup.orgId, 'CreateOrgTeam', { ...CORE, id: 'team-web', slug: 'web', name: 'Web' })
    await answer(setup.orgId, 'UpdateOrgTeam', { ...CORE, name: 'Core team' })
    await answer(setup.orgId, 'SetOrgTeamMembers', { ...CORE, memberAddresses: [BOB, CAROL] })
    await answer(setup.orgId, 'DeleteOrgTeam', true)

    await page.getByLabel('Team name').fill('Web')
    await expect(page.getByLabel('Slug', { exact: true })).toHaveValue('web')
    await page.getByRole('button', { name: 'Create team' }).click()
    expect(await signedWrite(setup.wallet, 'createOrgTeam', setup.orgId)).toEqual({ orgId: setup.orgId, slug: 'web', name: 'Web' })

    await page.getByRole('button', { name: 'Edit Core' }).click()
    await page.getByLabel('Name', { exact: true }).fill('Core team')
    await page.getByLabel('Carol Member').check()
    await page.getByRole('button', { name: 'Save team' }).click()
    expect(await signedWrite(setup.wallet, 'updateOrgTeam', setup.orgId)).toEqual({ orgId: setup.orgId, teamId: 'team-core', name: 'Core team' })
    expect(await signedWrite(setup.wallet, 'setOrgTeamMembers', setup.orgId)).toEqual({
      orgId: setup.orgId,
      teamId: 'team-core',
      addresses: [BOB, CAROL],
    })

    await page.getByRole('button', { name: 'Delete Core' }).click()
    await page.getByRole('button', { name: 'Yes, delete Core' }).click()
    expect(await signedWrite(setup.wallet, 'deleteOrgTeam', setup.orgId)).toEqual({ orgId: setup.orgId, teamId: 'team-core' })
  })

  test('a member sees the teams but cannot change them', async ({ page }) => {
    await openManagePage(page, { role: 'MEMBER', section: 'teams', org: { teams: [CORE] } })
    await expect(page.getByRole('list', { name: 'Teams' }).getByText('Core', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create team' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit Core' })).toHaveCount(0)
  })
})

test.describe('manage: settings', () => {
  test('an admin edits the profile and the directory listing, without owner controls', async ({ page }) => {
    const setup = await openManagePage(page, { role: 'ADMIN', section: 'settings', org: { bio: 'Old bio', listed: false } })
    await answer(setup.orgId, 'UpdateOrganization', organization({ id: setup.orgId, handle: 'acme-manage', name: 'Acme Manage Ltd', bio: 'We manage.' }))
    await answer(setup.orgId, 'SetOrgListed', organization({ id: setup.orgId, handle: 'acme-manage', listed: true }))
    await expect(page.getByRole('button', { name: 'Propose handle change' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Propose deleting the organisation' })).toHaveCount(0)

    await page.getByLabel('Name', { exact: true }).fill('Acme Manage Ltd')
    await page.getByLabel('Bio').fill('We manage.')
    await page.getByRole('button', { name: 'Save profile' }).click()
    expect(await signedWrite(setup.wallet, 'updateOrganization', setup.orgId)).toEqual({ orgId: setup.orgId, name: 'Acme Manage Ltd', bio: 'We manage.' })

    await page.getByRole('switch', { name: 'List in the organisation directory' }).click()
    expect(await signedWrite(setup.wallet, 'setOrgListed', setup.orgId)).toEqual({ orgId: setup.orgId, listed: true })
  })

  test('an owner proposes a handle change and deleting the organisation', async ({ page }) => {
    const setup = await openManagePage(page, {
      role: 'OWNER',
      section: 'settings',
      org: { apps: [] },
      answers: { OrgHandleAvailability: (v) => ({ orgHandleAvailability: { handle: v.handle, available: true, reason: null } }) },
    })
    await answer(setup.orgId, 'ProposeOrgChange', orgProposal({ orgId: setup.orgId }))
    await page.getByLabel('New handle').fill('acme-two')
    await expect(page.getByText('renown.id/@acme-two is available.')).toBeVisible()
    await page.getByRole('button', { name: 'Propose handle change' }).click()
    expect(await signedWrite(setup.wallet, 'proposeOrgChange', setup.orgId, (v) => v.kind === 'CHANGE_HANDLE')).toEqual({
      orgId: setup.orgId,
      kind: 'CHANGE_HANDLE',
      payload: { handle: 'acme-two' },
    })

    const remove = page.getByRole('button', { name: 'Propose deleting the organisation' })
    await expect(remove).toBeDisabled()
    await page.getByLabel('Type acme-manage to confirm').fill('acme-manage')
    await remove.click()
    expect(await signedWrite(setup.wallet, 'proposeOrgChange', setup.orgId, (v) => v.kind === 'DELETE_ORG')).toEqual({
      orgId: setup.orgId,
      kind: 'DELETE_ORG',
      payload: {},
    })
  })

  test('a member is told only admins open settings', async ({ page }) => {
    await openManagePage(page, { role: 'MEMBER', section: 'settings' })
    await expect(page.getByText('Only admins and owners can open Settings.')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Organisation settings' }).getByRole('link', { name: 'Settings' })).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-manage-teams-settings.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../lib/orgs/settings-form'`.

- [ ] **Step 3: Pure rules**

Create `lib/orgs/teams.ts`:

```ts
// Teams (renown-package A1: slug 1-40 lowercase, name 1-64, at most 50 per org). Pure.
import type { OrgTeam } from '../../services/orgs'

export const TEAM_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/
export const MAX_TEAMS = 50
export const MAX_TEAM_NAME = 64

export function teamProblems({ slug, name }: { slug: string; name: string }): { slug?: string; name?: string } {
  const problems: { slug?: string; name?: string } = {}
  if (!TEAM_SLUG_RE.test(slug)) problems.slug = 'Use 1 to 40 lowercase letters, digits or hyphens, starting and ending with a letter or digit.'
  const trimmed = name.trim()
  if (!trimmed) problems.name = 'Give the team a name.'
  else if (trimmed.length > MAX_TEAM_NAME) problems.name = `Use at most ${MAX_TEAM_NAME} characters.`
  return problems
}

/** A slug suggested from a team name ("Web & Mobile" → "web-mobile"); '' when none fits. */
export function slugFromName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return TEAM_SLUG_RE.test(slug) ? slug : ''
}

export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((value) => set.has(value))
}

/** The updateOrgTeam arguments that changed (slug, trimmed name, app list). */
export function teamPatch(team: OrgTeam, draft: { slug: string; name: string; appDids: string[] }): Record<string, unknown> {
  const name = draft.name.trim()
  return {
    ...(draft.slug !== team.slug && { slug: draft.slug }),
    ...(name !== team.name && { name }),
    ...(!sameSet(draft.appDids, team.appDids) && { appDids: draft.appDids }),
  }
}
```

Create `lib/orgs/settings-form.ts`:

```ts
// The organisation profile form in Settings. updateOrganization patches: an
// absent field is kept, '' clears bio, website or avatar, links replaces the
// list. Only changed fields are sent (and signed). Pure.
import type { Organization, OrgLink } from '../../services/orgs'
import { isHttpUrl, ORG_LIMITS } from './create-form'

export interface OrgSettingsForm {
  name: string
  bio: string
  website: string
  avatar: string | null
  links: OrgLink[]
}

export type SettingsField = 'name' | 'bio' | 'website' | 'links'

const MAX_LINKS = 8
const MAX_LINK_LABEL = 40

export function settingsFormFrom(org: Pick<Organization, 'name' | 'bio' | 'website' | 'avatar' | 'links'>): OrgSettingsForm {
  return { name: org.name, bio: org.bio ?? '', website: org.website ?? '', avatar: org.avatar, links: org.links.map(({ id, label, url }) => ({ id, label, url })) }
}

export function settingsProblems(form: OrgSettingsForm): Partial<Record<SettingsField, string>> {
  const problems: Partial<Record<SettingsField, string>> = {}
  const name = form.name.trim()
  if (!name) problems.name = 'Give the organisation a name.'
  else if (name.length > ORG_LIMITS.name) problems.name = `Use at most ${ORG_LIMITS.name} characters.`
  if (form.bio.trim().length > ORG_LIMITS.bio) problems.bio = `Use at most ${ORG_LIMITS.bio} characters.`
  const website = form.website.trim()
  if (website && !isHttpUrl(website)) problems.website = 'Use a full address starting with https://.'
  if (form.links.length > MAX_LINKS) problems.links = `Use at most ${MAX_LINKS} links.`
  else if (form.links.some((link) => !link.label.trim() || link.label.trim().length > MAX_LINK_LABEL || !isHttpUrl(link.url.trim()))) {
    problems.links = 'Every link needs a label of up to 40 characters and a full https:// address.'
  }
  return problems
}

function cleanLinks(links: OrgLink[]): OrgLink[] {
  return links.map(({ id, label, url }) => ({ id, label: label.trim(), url: url.trim() }))
}

export function settingsPatch(initial: OrgSettingsForm, current: OrgSettingsForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const name = current.name.trim()
  if (name !== initial.name.trim()) patch.name = name
  const bio = current.bio.trim()
  if (bio !== initial.bio.trim()) patch.bio = bio
  const website = current.website.trim()
  if (website !== initial.website.trim()) patch.website = website
  if ((current.avatar ?? '') !== (initial.avatar ?? '')) patch.avatar = current.avatar ?? ''
  const links = cleanLinks(current.links)
  if (JSON.stringify(links) !== JSON.stringify(cleanLinks(initial.links))) patch.links = links
  return patch
}
```

- [ ] **Step 4: The teams section**

Create `components/org-manage/teams-section.tsx`:

```tsx
import { useCallback, useState, type FormEvent } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { memberLabel, plural } from '../../lib/orgs/format'
import { MAX_TEAMS, sameSet, slugFromName, teamPatch, teamProblems } from '../../lib/orgs/teams'
import { roleAtLeast } from '../../services/org-signed-messages'
import { organizationMembers, type OrgMember, type OrgTeam } from '../../services/orgs'
import { Field, inputClass } from '../profile-edit/field'
import { buttonClasses } from '../site/primitives'
import type { ManageContext, ManageSectionProps } from './manage-context'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'

function toggle(list: string[], value: string, on: boolean): string[] {
  return on ? [...list, value] : list.filter((item) => item !== value)
}

function CreateTeam({ ctx, count }: { ctx: ManageContext; count: number }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const problems = teamProblems({ slug, name })
  const full = count >= MAX_TEAMS

  async function create(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (problems.slug || problems.name || full) return
    setBusy(true)
    const done = await ctx.run<OrgTeam>('createOrgTeam', { orgId: ctx.org.id, slug, name: name.trim() }, `${name.trim()} was created.`)
    setBusy(false)
    if (done) {
      setName('')
      setSlug('')
      setSlugEdited(false)
      setSubmitted(false)
      ctx.reloadOrg()
    }
  }

  return (
    <Panel id="create-team-title" title="Create a team" description={`${plural(count, 'team', 'teams')} of ${MAX_TEAMS}.`}>
      <form onSubmit={(event) => void create(event)} noValidate className="grid gap-3 sm:grid-cols-2">
        <Field id="team-name" label="Team name" error={submitted ? problems.name : undefined}>
          <input
            id="team-name"
            className={inputClass}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slugEdited) setSlug(slugFromName(e.target.value))
            }}
          />
        </Field>
        <Field id="team-slug" label="Slug" error={submitted ? problems.slug : undefined} hint="Apps that ask about your organisations see it.">
          <input
            id="team-slug"
            className={inputClass}
            value={slug}
            onChange={(e) => {
              setSlugEdited(true)
              setSlug(e.target.value.trim().toLowerCase())
            }}
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <button type="submit" disabled={busy || full} className={buttonClasses('primary', 'md', 'justify-self-start sm:col-span-2')}>
          {busy ? 'Creating…' : 'Create team'}
        </button>
      </form>
    </Panel>
  )
}

function TeamEditor({ ctx, team, members, onDone }: { ctx: ManageContext; team: OrgTeam; members: OrgMember[]; onDone: () => void }) {
  const [name, setName] = useState(team.name)
  const [slug, setSlug] = useState(team.slug)
  const [apps, setApps] = useState<string[]>(team.appDids)
  const [people, setPeople] = useState<string[]>(team.memberAddresses)
  const [busy, setBusy] = useState(false)
  const problems = teamProblems({ slug, name })
  const patch = teamPatch(team, { slug, name, appDids: apps })
  const membersChanged = !sameSet(people, team.memberAddresses)
  const dirty = Object.keys(patch).length > 0 || membersChanged

  async function save() {
    if (problems.slug || problems.name || !dirty) return
    setBusy(true)
    let ok = true
    if (Object.keys(patch).length > 0) {
      ok = (await ctx.run<OrgTeam>('updateOrgTeam', { orgId: ctx.org.id, teamId: team.id, ...patch }, `${name.trim()} was saved.`)) !== null
    }
    if (ok && membersChanged) {
      ok = (await ctx.run<OrgTeam>('setOrgTeamMembers', { orgId: ctx.org.id, teamId: team.id, addresses: people }, `Members of ${name.trim()} were saved.`)) !== null
    }
    setBusy(false)
    if (ok) {
      ctx.reloadOrg()
      onDone()
    }
  }

  return (
    <div className="border-hairline rounded-card mt-4 space-y-5 border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`team-${team.id}-name`} label="Name" error={problems.name}>
          <input id={`team-${team.id}-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id={`team-${team.id}-slug`} label="Team slug" error={problems.slug}>
          <input id={`team-${team.id}-slug`} className={inputClass} value={slug} onChange={(e) => setSlug(e.target.value.trim().toLowerCase())} autoCapitalize="none" spellCheck={false} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-ink text-sm font-semibold">Apps</legend>
        {ctx.org.apps.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">The organisation has no apps yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {ctx.org.apps.map((app) => (
              <li key={app.appDid}>
                <label className="text-ink flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={apps.includes(app.appDid)} onChange={(e) => setApps((list) => toggle(list, app.appDid, e.target.checked))} />
                  <span className="font-mono text-xs break-all">{app.appDid}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <fieldset>
        <legend className="text-ink text-sm font-semibold">Members</legend>
        <ul className="mt-2 space-y-2">
          {members.map((member) => (
            <li key={member.id}>
              <label className="text-ink flex items-center gap-2 text-sm">
                <input type="checkbox" checked={people.includes(member.address)} onChange={(e) => setPeople((list) => toggle(list, member.address, e.target.checked))} />
                {memberLabel(member)}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <p className="text-ink-muted text-xs">Saving asks for one signature for the team and one for its members when both changed.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !dirty} onClick={() => void save()} className={buttonClasses('primary', 'md')}>
          {busy ? 'Saving…' : 'Save team'}
        </button>
        <button type="button" onClick={onDone} className={buttonClasses('ghost', 'md')}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export function TeamsSection({ ctx }: ManageSectionProps) {
  const admin = roleAtLeast(ctx.role, 'ADMIN')
  const { org, getBearer } = ctx
  const loadMembers = useCallback(async () => organizationMembers(org.id, false, await getBearer()), [org.id, getBearer])
  const members = useRemote(admin ? `team-members:${org.id}` : null, loadMembers)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function remove(team: OrgTeam) {
    setBusy(team.id)
    const done = await ctx.run<boolean>('deleteOrgTeam', { orgId: org.id, teamId: team.id }, `${team.name} was deleted.`)
    setBusy(null)
    if (done !== null) ctx.reloadOrg()
  }

  return (
    <div className="mt-6 space-y-8">
      {admin && <CreateTeam ctx={ctx} count={org.teams.length} />}
      <Panel
        id="teams-title"
        title="Teams"
        description="A team gives its members access to its apps, on top of their own app access. Apps that ask about your organisations see team slugs."
      >
        {org.teams.length === 0 ? (
          <p className="text-ink-muted text-sm">No teams yet.</p>
        ) : (
          <ul aria-label="Teams" className="divide-hairline divide-y">
            {org.teams.map((team) => (
              <li key={team.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ink font-semibold break-words">{team.name}</p>
                    <p className="text-ink-muted text-xs">
                      <span className="font-mono">{team.slug}</span>, {plural(team.appDids.length, 'app', 'apps')}, {plural(team.memberAddresses.length, 'member', 'members')}
                    </p>
                  </div>
                  {admin && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" aria-expanded={editing === team.id} onClick={() => setEditing(editing === team.id ? null : team.id)} className={buttonClasses('ghost', 'md')}>
                        Edit {team.name}
                      </button>
                      <ConfirmButton label={`Delete ${team.name}`} confirm={`Yes, delete ${team.name}`} busy={busy === team.id} onConfirm={() => void remove(team)} />
                    </div>
                  )}
                </div>
                {admin && editing === team.id && (
                  <RemoteView remote={members.state} what="members" onRetry={members.reload}>
                    {(list) => <TeamEditor ctx={ctx} team={team} members={list.filter((m) => m.status === 'ACTIVE')} onDone={() => setEditing(null)} />}
                  </RemoteView>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
```

(The editor's slug field is labelled "Team slug" so that "Slug" stays unique to the create form.)

- [ ] **Step 5: The settings section**

Create `components/org-manage/settings-section.tsx`:

```tsx
import { useCallback, useState, type FormEvent } from 'react'
import { ORG_LIMITS } from '../../lib/orgs/create-form'
import { normalizeOrgHandle, orgHandleProblem } from '../../lib/orgs/handles'
import { settingsFormFrom, settingsPatch, settingsProblems, type OrgSettingsForm } from '../../lib/orgs/settings-form'
import type { Organization, OrgProposal } from '../../services/orgs'
import { SwitchRow } from '../org/switch-row'
import { useOrgHandleAvailability } from '../org/use-org-handle-availability'
import { AvatarUploader } from '../profile-edit/avatar-uploader'
import { Field, inputClass } from '../profile-edit/field'
import { LinksEditor } from '../profile-edit/links-editor'
import { ProfileAvatar } from '../profile/profile-avatar'
import { buttonClasses } from '../site/primitives'
import type { ManageContext, ManageSectionProps } from './manage-context'
import { Panel } from './manage-ui'

function ProfilePanel({ ctx }: { ctx: ManageContext }) {
  const { getBearer } = ctx
  const [initial, setInitial] = useState<OrgSettingsForm>(() => settingsFormFrom(ctx.org))
  const [form, setForm] = useState<OrgSettingsForm>(initial)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const problems = settingsProblems(form)
  const patch = settingsPatch(initial, form)
  const dirty = Object.keys(patch).length > 0
  const uploadBearer = useCallback(async () => {
    const bearer = await getBearer()
    if (!bearer) throw new Error('Sign in to Renown to upload an image')
    return bearer
  }, [getBearer])

  async function save(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!dirty || uploading || Object.values(problems).some(Boolean)) return
    setBusy(true)
    const done = await ctx.run<Organization>('updateOrganization', { orgId: ctx.org.id, ...patch }, 'Profile saved.')
    setBusy(false)
    if (done) {
      const next = settingsFormFrom(done)
      setInitial(next)
      setForm(next)
      ctx.reloadOrg()
    }
  }

  return (
    <Panel id="profile-title" title="Profile" description="What everyone sees on the organisation’s page.">
      <form onSubmit={(event) => void save(event)} noValidate className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <ProfileAvatar documentId={ctx.org.id} avatar={form.avatar} previewUrl={preview} seed={ctx.org.id} alt="" className="h-16 w-16" />
          <AvatarUploader
            hasAvatar={Boolean(form.avatar)}
            getBearer={uploadBearer}
            onUploaded={(ref, url) => {
              if (preview) URL.revokeObjectURL(preview)
              setPreview(url)
              setForm((f) => ({ ...f, avatar: ref }))
            }}
            onClear={() => {
              if (preview) URL.revokeObjectURL(preview)
              setPreview(null)
              setForm((f) => ({ ...f, avatar: null }))
            }}
            onUseEnsAvatar={() => undefined}
            onBusyChange={setUploading}
          />
        </div>
        <Field id="settings-name" label="Name" error={submitted ? problems.name : undefined} counter={`${form.name.trim().length}/${ORG_LIMITS.name}`}>
          <input id="settings-name" className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field id="settings-bio" label="Bio" error={submitted ? problems.bio : undefined} counter={`${form.bio.trim().length}/${ORG_LIMITS.bio}`}>
          <textarea id="settings-bio" rows={3} className={inputClass} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
        </Field>
        <Field id="settings-website" label="Website" error={submitted ? problems.website : undefined}>
          <input id="settings-website" type="url" className={inputClass} value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://" />
        </Field>
        <LinksEditor links={form.links} onChange={(links) => setForm((f) => ({ ...f, links }))} error={submitted ? problems.links : undefined} />
        <button type="submit" disabled={busy || uploading || !dirty} className={buttonClasses('primary', 'md')}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </Panel>
  )
}

function VisibilityPanel({ ctx }: { ctx: ManageContext }) {
  const [busy, setBusy] = useState(false)

  async function update(name: 'setOrgListed' | 'updateOrganization', args: Record<string, unknown>, success: string) {
    setBusy(true)
    const done = await ctx.run<Organization>(name, { orgId: ctx.org.id, ...args }, success)
    setBusy(false)
    if (done) ctx.reloadOrg()
  }

  return (
    <Panel id="visibility-title" title="Visibility">
      <div className="space-y-3">
        <SwitchRow
          id="settings-listed"
          label="List in the organisation directory"
          hint="Anyone can find it on renown.id/orgs. Its page is public either way."
          checked={ctx.org.listed}
          disabled={busy}
          onChange={(listed) => void update('setOrgListed', { listed }, listed ? 'Listed in the directory.' : 'Removed from the directory.')}
        />
        <SwitchRow
          id="settings-members-public"
          label="Show members publicly"
          hint="Members can still hide themselves. When off, only members see who belongs."
          checked={ctx.org.membersPublic}
          disabled={busy}
          onChange={(membersPublic) => void update('updateOrganization', { membersPublic }, membersPublic ? 'Members are now public.' : 'Members are now private.')}
        />
      </div>
    </Panel>
  )
}

function HandlePanel({ ctx }: { ctx: ManageContext }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const handle = normalizeOrgHandle(text)
  const availability = useOrgHandleAvailability(handle)
  const problem = handle
    ? (orgHandleProblem(handle) ??
      (handle === ctx.org.handle
        ? 'This is the current handle.'
        : availability === 'taken'
          ? 'This handle is taken.'
          : availability === 'reserved'
            ? 'This handle is reserved.'
            : null))
    : null

  async function propose(event: FormEvent) {
    event.preventDefault()
    if (!handle || problem) return
    setBusy(true)
    const done = await ctx.run<OrgProposal>('proposeOrgChange', { orgId: ctx.org.id, kind: 'CHANGE_HANDLE', payload: { handle } }, 'Handle change proposed. Follow it under Security.')
    setBusy(false)
    if (done) setText('')
  }

  return (
    <Panel
      id="handle-title"
      title="Handle"
      description={`renown.id/@${ctx.org.handle}. A new handle needs a second owner’s approval when there is one, then waits 48 hours. The old handle stays reserved for this organisation for 30 days.`}
    >
      <form onSubmit={(event) => void propose(event)} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <Field id="settings-handle" label="New handle" error={problem ?? undefined} hint={availability === 'available' ? `renown.id/@${handle} is available.` : undefined}>
            <input id="settings-handle" className={inputClass} value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="none" spellCheck={false} />
          </Field>
        </div>
        <button type="submit" disabled={busy || !handle || Boolean(problem)} className={buttonClasses('primary', 'md', 'sm:mt-[1.625rem]')}>
          {busy ? 'Proposing…' : 'Propose handle change'}
        </button>
      </form>
    </Panel>
  )
}

function DeletePanel({ ctx }: { ctx: ManageContext }) {
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const hasApps = ctx.org.apps.length > 0
  const ready = !hasApps && confirm.trim().toLowerCase() === ctx.org.handle

  async function propose() {
    setBusy(true)
    const done = await ctx.run<OrgProposal>('proposeOrgChange', { orgId: ctx.org.id, kind: 'DELETE_ORG', payload: {} }, 'Deletion proposed. Follow it under Security.')
    setBusy(false)
    if (done) setConfirm('')
  }

  return (
    <Panel
      id="delete-title"
      title="Delete the organisation"
      description="Deleting archives it: its page says Archived, every membership ends and the handle stays reserved for 90 days. It needs a second owner’s approval when there is one, then waits 48 hours."
    >
      {hasApps && <p className="text-caution-ink mb-4 text-sm">It still has apps. Transfer every app away first.</p>}
      <Field id="settings-delete" label={`Type ${ctx.org.handle} to confirm`}>
        <input id="settings-delete" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="none" spellCheck={false} />
      </Field>
      <button type="button" disabled={!ready || busy} onClick={() => void propose()} className={buttonClasses('secondary', 'md', 'border-danger-ink/50 text-danger-ink mt-4')}>
        {busy ? 'Proposing…' : 'Propose deleting the organisation'}
      </button>
    </Panel>
  )
}

export function SettingsSection({ ctx }: ManageSectionProps) {
  const owner = ctx.role === 'OWNER'
  return (
    <div className="mt-6 space-y-8">
      <ProfilePanel ctx={ctx} />
      <VisibilityPanel ctx={ctx} />
      {owner && <HandlePanel ctx={ctx} />}
      {owner && <DeletePanel ctx={ctx} />}
    </div>
  )
}
```

- [ ] **Step 6: Register the sections**

In `lib/orgs/manage-sections.ts`, replace `MANAGE_SECTIONS` with:

```ts
export const MANAGE_SECTIONS: ManageSectionMeta[] = [
  { key: 'members', label: 'Members', minRole: 'MEMBER' },
  { key: 'teams', label: 'Teams', minRole: 'MEMBER' },
  { key: 'settings', label: 'Settings', minRole: 'ADMIN' },
]
```

In `components/org-manage/section-components.tsx`, add the imports `import { SettingsSection } from './settings-section'` and `import { TeamsSection } from './teams-section'`, and the entries `teams: TeamsSection,` and `settings: SettingsSection,` after `members`.

- [ ] **Step 7: Run the specs**

Run: `pnpm exec playwright test e2e/org-manage-teams-settings.spec.ts e2e/org-manage-members.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 8: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed".

```bash
git add lib/orgs/teams.ts lib/orgs/settings-form.ts lib/orgs/manage-sections.ts components/org-manage e2e/support/org-fixtures.ts e2e/org-manage-teams-settings.spec.ts
git commit -m "feat(orgs): manage teams and settings"
```

---

### Task 8: Account surfaces — notifications bell and inbox, organisation switcher, `/me` memberships and invites

**Files:**
- Create: `lib/orgs/notifications.ts`, `components/site/use-renown-bearer.ts`, `components/site/use-unread-count.ts`, `components/site/notifications-bell.tsx`, `components/site/account-orgs.tsx`, `components/notifications/inbox.tsx`, `pages/notifications.tsx`, `components/me/org-memberships.tsx`
- Modify: `components/site/site-header.tsx` (bell), `components/site/account-menu.tsx` (organisations), `components/me/me-dashboard.tsx` (memberships), `scripts/check-wallet-chunks.mjs` (`/notifications`)
- Test: `e2e/org-account.spec.ts`

**Interfaces:**
- Consumes: `myUnreadNotificationCount`, `myNotifications`, `markNotificationsRead`, `organizationsByMember`, `myOrgInvites`, `OrgNotification`, `OrgAffiliation`, `OrgInvite`, `OrgProposalKind` (Task 1); `useRemote` (Task 2); `orgWriter`, `sessionSigner` (Task 2); `readActiveOrg`, `writeActiveOrg`, `activeFirst` (Task 6); `useNow` (Task 6); `RemoteView`, `ConfirmButton` (Task 6); `manageHref`, `orgPath`, `roleLabel`, `shortAddress` (Task 3); `OrgAvatar` (Task 3); `useSiteAuth`; `useMeSession`; `formatRelative`.
- Produces:
  - `lib/orgs/notifications.ts`: `notificationText(n: Pick<OrgNotification, 'kind' | 'org' | 'payload' | 'orgId'>): string`, `notificationHref(n): string`.
  - `useRenownBearer(): () => Promise<string | null>` (stable).
  - `useUnreadCount(address: string | null, getBearer): number`, `UNREAD_POLL_MS = 60_000`, `NOTIFICATIONS_CHANGED = 'renown:notifications-changed'`.
  - `NotificationsBell({ address })` (link "Notifications" / "Notifications, N unread").
  - `AccountOrgs({ state, active, onPick, onClose, itemClass })` (menu group "Your organisations").
  - `/notifications` (h1 "Notifications", list "Notifications").
  - `OrgMemberships({ session, onToast })` (section `#organisations`, h2 "Organisations"; lists "Pending invites" and "Your organisations") — B2 adds incoming app transfers to `/me`.

- [ ] **Step 1: Write the failing test**

Create `e2e/org-account.spec.ts`:

```ts
import { test, expect, type Page, type Route } from '@playwright/test'
import { notificationHref, notificationText } from '../lib/orgs/notifications'
import type { OrgNotification } from '../services/orgs'
import { orgInvite, orgSummary, serveOrgReads } from './support/org-fixtures'
import { signedWrite } from './support/org-manage'
import { fixtureStub, STUB_SWITCHBOARD_URL } from './support/stub-switchboard-client'
import { signInTestWallet } from './support/test-session'

const SESSION = '0x0a00000000000000000000000000000000000c01'
const INBOX_ORG = orgSummary({ id: 'org-inbox-1', handle: 'acme-inbox', name: 'Acme Inbox' })

function note(kind: OrgNotification['kind'], payload: Record<string, unknown>, over: Partial<OrgNotification> = {}): OrgNotification {
  return { id: `n-${kind}`, kind, orgId: INBOX_ORG.id, org: INBOX_ORG, payload: JSON.stringify(payload), createdAt: '2026-10-12T10:00:00.000Z', readAt: null, ...over }
}

/** The site chrome's Renown session stand-in (NEXT_PUBLIC_E2E_AUTH=1) with a bearer. */
async function standInSession(page: Page): Promise<void> {
  await page.addInitScript((address) => {
    const w = window as unknown as Record<string, unknown>
    w.__renownE2eSession = { address, calls: [] }
    w.__renownE2eBearer = 'e2e-account-bearer'
  }, SESSION)
}

test.describe('notification wording', () => {
  test('says what happened and links to where to act', () => {
    expect(notificationText(note('INVITED', { inviteId: 'i1', role: 'PUBLISHER' }))).toBe('Acme Inbox invited you to join as Publisher.')
    expect(notificationHref(note('INVITED', {}))).toBe('/me#organisations')
    expect(notificationText(note('INVITE_ACCEPTED', { address: '0x0b000000000000000000000000000000000000b2', role: 'MEMBER' }))).toBe('0x0b00…00b2 joined Acme Inbox as Member.')
    expect(notificationText(note('ROLE_CHANGED', { from: 'MEMBER', to: 'ADMIN' }))).toBe('Your role in Acme Inbox is now Admin.')
    expect(notificationText(note('PROPOSAL_NEEDS_APPROVAL', { proposalId: 'p1', kind: 'ADD_OWNER' }))).toBe('A proposal to add an owner in Acme Inbox needs your approval.')
    expect(notificationHref(note('PROPOSAL_NEEDS_APPROVAL', {}))).toBe('/org/acme-inbox/manage/security')
    expect(notificationText(note('PROPOSAL_EXECUTED', { proposalId: 'p1', kind: 'CHANGE_HANDLE', reason: 'The handle is taken' }))).toBe(
      'The proposal to change the handle in Acme Inbox failed: The handle is taken.',
    )
    expect(notificationText(note('PROPOSAL_CANCELLED', { kind: 'DELETE_ORG', status: 'EXPIRED' }))).toBe('The proposal to delete the organisation in Acme Inbox expired.')
    expect(notificationText(note('RECOVERY_STARTED', { kind: 'RECOVER', domain: 'acme.example' }))).toBe(
      'Someone started recovering Acme Inbox through acme.example. Any owner can cancel it within 7 days.',
    )
    expect(notificationHref(note('APP_TRANSFER_REQUEST', { from: INBOX_ORG.id }))).toBe('/me#app-transfers')
    expect(notificationHref(note('APP_TRANSFER_REQUEST', { from: '0x0b000000000000000000000000000000000000b2' }))).toBe('/org/acme-inbox/manage/apps')
    expect(notificationText(note('DOMAIN_LAPSED', { domain: 'acme.example' }))).toBe('acme.example is no longer verified for Acme Inbox.')
    expect(notificationText(note('INVITED', {}, { org: null, payload: 'not json' }))).toBe('An organisation invited you to join as Member.')
  })
})

test.describe('header and inbox', () => {
  test('the bell shows the unread count, read with the bearer', async ({ page }) => {
    await standInSession(page)
    const auth: string[] = []
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const { query } = route.request().postDataJSON() as { query: string }
      if (!query.includes('query MyUnreadNotificationCount')) return route.continue()
      auth.push(route.request().headers()['authorization'] ?? '')
      return route.fulfill({ json: { data: { myUnreadNotificationCount: 3 } } })
    })
    await page.goto('/trust')
    const bell = page.getByRole('link', { name: 'Notifications, 3 unread' })
    await expect(bell).toBeVisible({ timeout: 30_000 })
    await expect(bell).toHaveAttribute('href', '/notifications')
    expect(auth[0]).toBe('Bearer e2e-account-bearer')
  })

  test('the account menu lists my organisations, remembers the last one and offers to create one', async ({ page }) => {
    await standInSession(page)
    const beta = { ...orgSummary({ id: 'org-menu-2', handle: 'beta-menu', name: 'Beta Menu' }), archived: false }
    await serveOrgReads(page, {
      OrgsByMember: () => ({
        organizationsByMember: [
          { role: 'OWNER', hidden: false, org: { ...orgSummary({ id: 'org-menu-1', handle: 'acme-menu', name: 'Acme Menu' }), archived: false } },
          { role: 'MEMBER', hidden: true, org: beta },
        ],
      }),
    })
    await page.goto('/trust')
    await page.getByRole('button', { name: /Account menu/ }).click()
    const group = page.getByRole('group', { name: 'Your organisations' })
    await expect(group.getByRole('menuitem')).toHaveCount(3)
    await expect(group.getByRole('menuitem', { name: 'Create organisation' })).toHaveAttribute('href', '/org/new')
    await group.getByRole('menuitem', { name: /Beta Menu/ }).click()
    await expect(page).toHaveURL(/\/org\/beta-menu\/manage\/members$/)
    expect(await page.evaluate(() => localStorage.getItem('renown.activeOrg'))).toBe('org-menu-2')
    await page.goto('/trust')
    await page.getByRole('button', { name: /Account menu/ }).click()
    const first = page.getByRole('group', { name: 'Your organisations' }).getByRole('menuitem').first()
    await expect(first).toContainText('Beta Menu')
    await expect(first).toHaveAttribute('aria-current', 'true')
  })

  test('the inbox lists notifications, filters unread and marks all as read', async ({ page }) => {
    await standInSession(page)
    const marked: { variables: unknown; authorization: string }[] = []
    const unreadOnly: unknown[] = []
    await page.route(`${STUB_SWITCHBOARD_URL}/graphql/renown-orgs**`, async (route: Route) => {
      const body = route.request().postDataJSON() as { query: string; variables: Record<string, unknown> }
      if (body.query.includes('query MyNotifications')) {
        unreadOnly.push(body.variables.unreadOnly)
        return route.fulfill({
          json: {
            data: {
              myNotifications: {
                items: [
                  note('INVITED', { inviteId: 'i1', role: 'PUBLISHER' }),
                  note('PROPOSAL_NEEDS_APPROVAL', { proposalId: 'p1', kind: 'ADD_OWNER' }),
                  note('ROLE_CHANGED', { from: 'MEMBER', to: 'ADMIN' }, { readAt: '2026-10-12T11:00:00.000Z' }),
                ],
                next: null,
              },
            },
          },
        })
      }
      if (body.query.includes('mutation MarkNotificationsRead')) {
        marked.push({ variables: body.variables, authorization: route.request().headers()['authorization'] ?? '' })
        return route.fulfill({ json: { data: { markNotificationsRead: 2 } } })
      }
      return route.continue()
    })
    await page.goto('/notifications')
    const list = page.getByRole('list', { name: 'Notifications' })
    await expect(list.getByRole('link', { name: /Acme Inbox invited you to join as Publisher\./ })).toHaveAttribute('href', '/me#organisations')
    await expect(list.getByRole('link', { name: /needs your approval/ })).toHaveAttribute('href', '/org/acme-inbox/manage/security')
    await expect(list.getByText('Unread', { exact: true })).toHaveCount(2)
    await page.getByRole('button', { name: 'Mark all as read' }).click()
    await expect(list.getByText('Unread', { exact: true })).toHaveCount(0)
    expect(marked).toEqual([{ variables: { all: true }, authorization: 'Bearer e2e-account-bearer' }])
    await page.getByRole('button', { name: 'Unread', exact: true }).click()
    await expect.poll(() => unreadOnly.includes(true)).toBe(true)
  })

  test('the inbox asks visitors to sign in', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Sign in', exact: true }).last()).toBeVisible()
  })
})

test.describe('/me organisations', () => {
  test('accepts an invite, hides a membership and leaves an organisation', async ({ page }) => {
    const wallet = await signInTestWallet(page, { bearer: 'e2e-me-orgs' })
    const me = wallet.address.toLowerCase()
    const inviting = orgSummary({ id: crypto.randomUUID(), handle: 'acme-invite', name: 'Acme Invite' })
    const home = { ...orgSummary({ id: crypto.randomUUID(), handle: 'acme-home', name: 'Acme Home' }), archived: false }
    await serveOrgReads(page, {
      OrgsByMember: () => ({ organizationsByMember: [{ role: 'PUBLISHER', hidden: false, org: home }] }),
      MyOrgInvites: () => ({ myOrgInvites: [orgInvite({ id: 'inv-me', orgId: inviting.id, org: inviting, address: me, role: 'PUBLISHER' })] }),
    })
    for (const [name, orgId, value] of [
      ['RespondToOrgInvite', inviting.id, { id: 'inv-me' }],
      ['SetMyOrgMembershipHidden', home.id, { id: 'm-home' }],
      ['LeaveOrganization', home.id, true],
    ] as const) {
      await fixtureStub({ match: `mutation ${name}`, variables: orgId, response: { data: { [name.charAt(0).toLowerCase() + name.slice(1)]: value } } })
    }
    await page.goto('/me')
    const section = page.getByRole('region', { name: 'Organisations' })
    await expect(section).toBeVisible({ timeout: 30_000 })
    await section.getByRole('button', { name: 'Join Acme Invite' }).click()
    expect(await signedWrite(wallet, 'respondToOrgInvite', inviting.id)).toEqual({ orgId: inviting.id, inviteId: 'inv-me', accept: true })

    const row = section.getByRole('list', { name: 'Your organisations' }).getByRole('listitem').filter({ hasText: 'Acme Home' })
    await expect(row.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/org/acme-home/manage/members')
    await row.getByRole('button', { name: 'Hide from public lists' }).click()
    expect(await signedWrite(wallet, 'setMyOrgMembershipHidden', home.id)).toEqual({ orgId: home.id, hidden: true })
    await row.getByRole('button', { name: 'Leave Acme Home' }).click()
    await row.getByRole('button', { name: 'Yes, leave Acme Home' }).click()
    expect(await signedWrite(wallet, 'leaveOrganization', home.id)).toEqual({ orgId: home.id })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec playwright test e2e/org-account.spec.ts --reporter=line 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../lib/orgs/notifications'`.

- [ ] **Step 3: Notification wording**

Create `lib/orgs/notifications.ts`:

```ts
// What each inbox notification says and where it leads. Reads only the payload
// keys renown-package writes (A1 Task 7, A2 rulings 4 and 12, A3 ruling 2) and
// falls back to a plain sentence for anything else. Pure.
import type { OrgNotification, OrgProposalKind } from '../../services/orgs'
import { manageHref, orgPath, roleLabel, shortAddress } from './format'

type NotificationView = Pick<OrgNotification, 'kind' | 'org' | 'payload' | 'orgId'>

const PROPOSAL_TEXT: Record<OrgProposalKind, string> = {
  ADD_OWNER: 'add an owner',
  REMOVE_OWNER: 'remove an owner',
  TRANSFER_APP_OUT: 'transfer an app out',
  CHANGE_HANDLE: 'change the handle',
  DELETE_ORG: 'delete the organisation',
  RECOVER: 'recover the organisation',
  FREEZE_APP: 'freeze an app',
  UNFREEZE_APP: 'unfreeze an app',
}

function payloadOf(n: NotificationView): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(n.payload)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function who(value: unknown): string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) ? shortAddress(value.toLowerCase()) : 'Someone'
}

function proposalText(kind: unknown): string {
  return typeof kind === 'string' && Object.hasOwn(PROPOSAL_TEXT, kind) ? PROPOSAL_TEXT[kind as OrgProposalKind] : 'make a change'
}

export function notificationText(n: NotificationView): string {
  const p = payloadOf(n)
  const org = n.org?.name ?? 'an organisation'
  const Org = n.org?.name ?? 'An organisation'
  const proposal = proposalText(p.kind)
  switch (n.kind) {
    case 'INVITED':
      return `${Org} invited you to join as ${roleLabel(text(p.role) ?? 'MEMBER')}.`
    case 'INVITE_ACCEPTED':
      return `${who(p.address)} joined ${org} as ${roleLabel(text(p.role) ?? 'MEMBER')}.`
    case 'ROLE_CHANGED':
      return text(p.to) ? `Your role in ${org} is now ${roleLabel(text(p.to) ?? '')}.` : `Your role in ${org} changed.`
    case 'REMOVED':
      return `You were removed from ${org}.`
    case 'PROPOSAL_CREATED':
      return `A proposal to ${proposal} was made in ${org}.`
    case 'PROPOSAL_NEEDS_APPROVAL':
      return `A proposal to ${proposal} in ${org} needs your approval.`
    case 'PROPOSAL_EXECUTED': {
      const reason = text(p.reason)
      if (reason || p.status === 'FAILED') return `The proposal to ${proposal} in ${org} failed${reason ? `: ${reason}` : ''}.`
      return `The proposal to ${proposal} in ${org} was carried out.`
    }
    case 'PROPOSAL_CANCELLED':
      return p.status === 'EXPIRED' ? `The proposal to ${proposal} in ${org} expired.` : `The proposal to ${proposal} in ${org} was cancelled.`
    case 'RECOVERY_STARTED':
      return `Someone started recovering ${org}${text(p.domain) ? ` through ${text(p.domain)}` : ''}. Any owner can cancel it within 7 days.`
    case 'APP_TRANSFER_REQUEST':
      return text(p.from) === n.orgId ? `${Org} wants to transfer an app to you.` : `An app transfer to ${org} is waiting for a decision.`
    case 'APP_TRANSFER_DONE':
      return `An app transfer involving ${org} is complete.`
    case 'APP_FROZEN':
      return `An app of ${org} was frozen.`
    case 'DOMAIN_LAPSED':
      return `${text(p.domain) ?? 'A domain'} is no longer verified for ${org}.`
    case 'DELEGATION_ADDED':
      return `${who(p.issuer)} authorised a key for an app of ${org}.`
    default:
      return `Something changed in ${org}.`
  }
}

export function notificationHref(n: NotificationView): string {
  const p = payloadOf(n)
  if (n.kind === 'INVITED') return '/me#organisations'
  // A transfer out of the organisation to a person: the person decides on /me.
  if (n.kind === 'APP_TRANSFER_REQUEST' && text(p.from) === n.orgId) return '/me#app-transfers'
  const handle = n.org?.handle
  if (!handle) return '/notifications'
  switch (n.kind) {
    case 'INVITE_ACCEPTED':
    case 'ROLE_CHANGED':
      return manageHref(handle, 'members')
    case 'PROPOSAL_CREATED':
    case 'PROPOSAL_NEEDS_APPROVAL':
    case 'PROPOSAL_EXECUTED':
    case 'PROPOSAL_CANCELLED':
    case 'RECOVERY_STARTED':
    case 'DELEGATION_ADDED':
      return manageHref(handle, 'security')
    case 'APP_TRANSFER_REQUEST':
    case 'APP_TRANSFER_DONE':
    case 'APP_FROZEN':
      return manageHref(handle, 'apps')
    case 'DOMAIN_LAPSED':
      return manageHref(handle, 'domains')
    default:
      return orgPath(handle)
  }
}
```

(The `security`, `apps` and `domains` sections arrive with B2, which ships in the same release; the links are right for that release.)

- [ ] **Step 4: The bearer, the unread count and the bell**

Create `components/site/use-renown-bearer.ts`:

```ts
import { useRenown } from '@powerhousedao/reactor-browser/renown'
import { useCallback } from 'react'

// Playwright runs the dev server with NEXT_PUBLIC_E2E_AUTH=1: the bearer then
// comes from window.__renownE2eBearer when set. Inert in every other build.
const E2E_AUTH = process.env.NEXT_PUBLIC_E2E_AUTH === '1'

/** A stable function returning the signed-in visitor's Renown bearer (for reads about them), or null. */
export function useRenownBearer(): () => Promise<string | null> {
  const renown = useRenown()
  return useCallback(async () => {
    if (E2E_AUTH) {
      const injected = (window as { __renownE2eBearer?: string }).__renownE2eBearer
      if (injected) return injected
    }
    if (!renown?.user) return null
    try {
      return await renown.getBearerToken({ expiresIn: 600 })
    } catch (error) {
      // Only the name: the error can carry token material.
      console.warn('Renown bearer unavailable:', error instanceof Error ? error.name : 'error')
      return null
    }
  }, [renown])
}
```

Create `components/site/use-unread-count.ts`:

```ts
import { useEffect, useState } from 'react'
import { myUnreadNotificationCount } from '../../services/orgs'

export const UNREAD_POLL_MS = 60_000
/** Fired by the inbox after it marks notifications read, so the bell refreshes at once. */
export const NOTIFICATIONS_CHANGED = 'renown:notifications-changed'

/** Unread notifications of `address`: read now, every minute while the tab is visible, on return to the tab and after the inbox changes. */
export function useUnreadCount(address: string | null, getBearer: () => Promise<string | null>): number {
  const [answer, setAnswer] = useState<{ address: string; count: number } | null>(null)

  useEffect(() => {
    if (!address) return
    let cancelled = false
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      void getBearer()
        .then((bearer) => (bearer ? myUnreadNotificationCount(bearer) : null))
        .then(
          (count) => {
            if (!cancelled && count !== null) setAnswer({ address, count })
          },
          () => undefined,
        )
    }
    refresh()
    const timer = setInterval(refresh, UNREAD_POLL_MS)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh)
    }
  }, [address, getBearer])

  return answer && answer.address === address ? answer.count : 0
}
```

Create `components/site/notifications-bell.tsx`:

```tsx
import Link from 'next/link'
import { useRenownBearer } from './use-renown-bearer'
import { useUnreadCount } from './use-unread-count'

/** The header's inbox link with the unread count. */
export function NotificationsBell({ address }: { address: string }) {
  const getBearer = useRenownBearer()
  const count = useUnreadCount(address, getBearer)
  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      className="text-ink-muted hover:text-ink hover:bg-surface-2 relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span aria-hidden="true" className="bg-primary-strong text-primary-foreground absolute top-0.5 right-0.5 min-w-[18px] rounded-full px-1 text-center text-[11px] leading-[18px] font-semibold tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
```

In `components/site/site-header.tsx`, add `import { NotificationsBell } from './notifications-bell'` and replace:

```tsx
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
```

with:

```tsx
        <div className="ml-auto flex items-center gap-2">
          {auth.state === 'signed-in' && <NotificationsBell address={auth.address} />}
          <ThemeToggle />
```

- [ ] **Step 5: Organisations in the account menu**

Create `components/site/account-orgs.tsx`:

```tsx
import Link from 'next/link'
import type { Remote } from '../../hooks/use-remote'
import { activeFirst } from '../../lib/orgs/active-org'
import { manageHref, roleLabel } from '../../lib/orgs/format'
import type { OrgAffiliation } from '../../services/orgs'
import { OrgAvatar } from '../org/org-avatar'

const SHOWN = 6

/** The account menu's "Your organisations" group: the last managed first, then "Create organisation". */
export function AccountOrgs({
  state,
  active,
  onPick,
  onClose,
  itemClass,
}: {
  state: Remote<OrgAffiliation[]>
  active: string | null
  onPick: (orgId: string) => void
  onClose: () => void
  itemClass: string
}) {
  const list = state.status === 'ready' ? activeFirst(state.value.filter((a) => !a.org.archived), active) : []
  return (
    <div role="group" aria-label="Your organisations" className="border-hairline mt-1 border-t pt-1">
      <p aria-hidden="true" className="text-ink-muted px-3 pt-2 pb-1 text-xs font-medium">
        Your organisations
      </p>
      {state.status === 'loading' && <p className="text-ink-muted px-3 py-2 text-sm">Loading…</p>}
      {list.slice(0, SHOWN).map(({ org, role }) => (
        <Link
          key={org.id}
          href={manageHref(org.handle)}
          role="menuitem"
          aria-current={org.id === active ? 'true' : undefined}
          className={itemClass}
          onClick={() => onPick(org.id)}
        >
          <OrgAvatar org={org} className="mr-2 h-6 w-6 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{org.name}</span>
          <span className="text-ink-muted ml-2 shrink-0 text-xs">{roleLabel(role)}</span>
        </Link>
      ))}
      {list.length > SHOWN && (
        <Link href="/me#organisations" role="menuitem" className={itemClass} onClick={onClose}>
          All organisations
        </Link>
      )}
      <Link href="/org/new" role="menuitem" className={itemClass} onClick={onClose}>
        Create organisation
      </Link>
    </div>
  )
}
```

In `components/site/account-menu.tsx`:

- extend the imports:

```tsx
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { readActiveOrg, writeActiveOrg } from '../../lib/orgs/active-org'
import { organizationsByMember } from '../../services/orgs'
import { AccountOrgs } from './account-orgs'
import { useRenownBearer } from './use-renown-bearer'
```

(replacing the existing `react` import line);

- after `const name = …`, add:

```tsx
  const getBearer = useRenownBearer()
  // The memberships are read the first time the menu opens, with the bearer (hidden ones included).
  const [wanted, setWanted] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const loadOrgs = useCallback(async () => organizationsByMember(address, await getBearer()), [address, getBearer])
  const orgs = useRemote(wanted ? `menu-orgs:${address.toLowerCase()}` : null, loadOrgs)
```

- replace the button's `onClick={() => setOpen((value) => !value)}` with:

```tsx
        onClick={() => {
          setOpen((value) => !value)
          setWanted(true)
          setActive(readActiveOrg())
        }}
```

- after the `accountLinks(...).map(...)` block and before the "Sign out" button, insert:

```tsx
          <AccountOrgs
            state={orgs.state}
            active={active}
            itemClass={itemClass}
            onClose={() => setOpen(false)}
            onPick={(orgId) => {
              writeActiveOrg(orgId)
              setOpen(false)
            }}
          />
```

- [ ] **Step 6: The inbox page**

Create `components/notifications/inbox.tsx`:

```tsx
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useNow } from '../../hooks/use-now'
import { notificationHref, notificationText } from '../../lib/orgs/notifications'
import { markNotificationsRead, myNotifications, type OrgNotification } from '../../services/orgs'
import { cx } from '../../utils/cx'
import { formatRelative } from '../../utils/relative-time'
import { buttonClasses } from '../site/primitives'
import { useRenownBearer } from '../site/use-renown-bearer'
import { NOTIFICATIONS_CHANGED } from '../site/use-unread-count'
import { useSiteAuth } from '../site/use-site-auth'

type Filter = 'all' | 'unread'

interface ListState {
  key: string
  items: OrgNotification[]
  next: string | null
  status: 'ready' | 'error'
  more: 'idle' | 'loading' | 'error'
}

function InboxList({ address }: { address: string }) {
  const getBearer = useRenownBearer()
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('all')
  const [attempt, setAttempt] = useState(0)
  const [list, setList] = useState<ListState | null>(null)
  const key = `${address}:${filter}:${attempt}`

  useEffect(() => {
    let cancelled = false
    getBearer()
      .then((bearer) => myNotifications({ unreadOnly: filter === 'unread', after: null }, bearer))
      .then(
        (page) => {
          if (!cancelled) setList({ key, items: page.items, next: page.next, status: 'ready', more: 'idle' })
        },
        () => {
          if (!cancelled) setList({ key, items: [], next: null, status: 'error', more: 'idle' })
        },
      )
    return () => {
      cancelled = true
    }
  }, [key, filter, getBearer])

  const current = list && list.key === key ? list : null

  const loadMore = useCallback(async () => {
    if (!current?.next || current.more === 'loading') return
    const after = current.next
    setList((l) => (l ? { ...l, more: 'loading' } : l))
    try {
      const page = await myNotifications({ unreadOnly: filter === 'unread', after }, await getBearer())
      setList((l) => (l && l.key === key ? { ...l, items: [...l.items, ...page.items.filter((n) => !l.items.some((o) => o.id === n.id))], next: page.next, more: 'idle' } : l))
    } catch {
      setList((l) => (l ? { ...l, more: 'error' } : l))
    }
  }, [current, filter, getBearer, key])

  async function markRead(target: { ids: string[] } | { all: true }) {
    try {
      await markNotificationsRead(target, await getBearer())
    } catch {
      return
    }
    const at = new Date().toISOString()
    setList((l) => (l ? { ...l, items: l.items.map((n) => (!n.readAt && ('all' in target || target.ids.includes(n.id)) ? { ...n, readAt: at } : n)) } : l))
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
  }

  const unread = current?.items.filter((n) => !n.readAt).length ?? 0

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-ink text-h1">Notifications</h1>
          <p className="text-ink-muted mt-2">Invites, approvals and changes in your organisations. Kept for 90 days.</p>
        </div>
        <button type="button" disabled={!current || unread === 0} onClick={() => void markRead({ all: true })} className={buttonClasses('secondary', 'md')}>
          Mark all as read
        </button>
      </div>
      <div className="mt-6 flex gap-2">
        {(['all', 'unread'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cx(
              'h-9 rounded-full border px-4 text-sm font-medium transition-colors',
              filter === value ? 'bg-primary-strong text-primary-foreground border-transparent' : 'border-hairline-strong bg-surface-1 text-ink',
            )}
          >
            {value === 'all' ? 'All' : 'Unread'}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {current === null ? (
          <p role="status" className="text-ink-muted text-sm">
            Loading notifications…
          </p>
        ) : current.status === 'error' ? (
          <div role="alert" className="border-hairline-strong rounded-panel border border-dashed px-6 py-10 text-center">
            <p className="text-ink">Your notifications did not load.</p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={buttonClasses('primary', 'md', 'mt-4')}>
              Try again
            </button>
          </div>
        ) : current.items.length === 0 ? (
          <p className="text-ink-muted border-hairline-strong rounded-panel border border-dashed px-6 py-10 text-center">
            {filter === 'unread' ? 'Nothing unread.' : 'No notifications yet.'}
          </p>
        ) : (
          <ul aria-label="Notifications" className="border-hairline bg-surface-1 rounded-card divide-hairline divide-y border">
            {current.items.map((n) => (
              <li key={n.id}>
                <Link
                  href={notificationHref(n)}
                  onClick={() => {
                    if (!n.readAt) void markRead({ ids: [n.id] })
                  }}
                  className="hover:bg-surface-2 flex items-start gap-3 px-4 py-4 transition-colors"
                >
                  <span aria-hidden="true" className={cx('mt-2 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-sm leading-6 break-words', n.readAt ? 'text-ink-muted' : 'text-ink font-medium')}>{notificationText(n)}</span>
                    <time dateTime={n.createdAt} className="text-ink-muted text-xs">
                      {formatRelative(n.createdAt, now)}
                    </time>
                  </span>
                  {!n.readAt && <span className="sr-only">Unread</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {current?.next && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <button type="button" aria-disabled={current.more === 'loading'} onClick={() => void loadMore()} className={buttonClasses('secondary', 'md')}>
            {current.more === 'loading' ? 'Loading…' : 'Load more'}
          </button>
          {current.more === 'error' && (
            <p role="alert" className="text-ink-muted text-sm">
              More notifications didn&apos;t load. Select the button to try again.
            </p>
          )}
        </div>
      )}
    </>
  )
}

/** /notifications: the signed-in visitor's organisation inbox (bearer reads, no wallet). */
export function Inbox() {
  const auth = useSiteAuth()
  if (auth.state === 'loading') {
    return (
      <p role="status" className="text-ink-muted py-24 text-center">
        Loading…
      </p>
    )
  }
  if (auth.state === 'signed-out') {
    return (
      <div className="border-hairline bg-surface-1 shadow-card rounded-panel mx-auto max-w-lg border px-6 py-12 text-center">
        <h1 className="text-ink text-h2">Notifications</h1>
        <p className="text-ink-muted mt-4 leading-7">Sign in to see invites and changes in your organisations.</p>
        <button type="button" onClick={auth.login} className={buttonClasses('primary', 'lg', 'mt-8')}>
          Sign in
        </button>
      </div>
    )
  }
  return <InboxList key={auth.address} address={auth.address} />
}
```

Create `pages/notifications.tsx`:

```tsx
import type { NextPage } from 'next'
import { Inbox } from '../components/notifications/inbox'
import { PageMeta } from '../components/site/page-meta'
import { Container } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'

const NotificationsPage: NextPage = () => (
  <SiteLayout>
    <PageMeta title="Notifications" description="Your organisation notifications on Renown." path="/notifications" noindex />
    <Container className="min-h-[60vh] max-w-[760px] pt-12 pb-24 md:pt-16">
      <Inbox />
    </Container>
  </SiteLayout>
)

export default NotificationsPage
```

In `scripts/check-wallet-chunks.mjs`, add `'/notifications'` to `MARKETING_PAGES` after `'/invite/[token]'`.

- [ ] **Step 7: Memberships and invites on `/me`**

Create `components/me/org-memberships.tsx`:

```tsx
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useNow } from '../../hooks/use-now'
import { useRemote } from '../../hooks/use-remote'
import { manageHref, orgPath, roleLabel } from '../../lib/orgs/format'
import { expiryText } from '../../lib/orgs/members'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import type { OrgMutationName } from '../../services/org-mutations'
import { myOrgInvites, organizationsByMember } from '../../services/orgs'
import { OrgAvatar } from '../org/org-avatar'
import { ConfirmButton, RemoteView } from '../org-manage/manage-ui'
import { buttonClasses } from '../site/primitives'
import type { MeSession } from './use-me-session'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

/** /me's organisations: invites waiting for an answer, then every organisation the wallet belongs to. */
export function OrgMemberships({ session, onToast }: { session: SignedIn; onToast: (tone: 'success' | 'error', text: string) => void }) {
  const { address, getBearer } = session
  const loadOrgs = useCallback(async () => organizationsByMember(address, await getBearer()), [address, getBearer])
  const loadInvites = useCallback(async () => myOrgInvites(await getBearer()), [getBearer])
  const orgs = useRemote(`me-orgs:${address.toLowerCase()}`, loadOrgs)
  const invites = useRemote(`me-invites:${address.toLowerCase()}`, loadInvites)
  const now = useNow()
  const [busy, setBusy] = useState<string | null>(null)

  async function act(key: string, name: OrgMutationName, args: Record<string, unknown>, success: string, after: () => void) {
    setBusy(key)
    const result = await orgWriter(sessionSigner(session)).write(name, args)
    setBusy(null)
    if (result.ok) {
      onToast('success', success)
      after()
    } else {
      onToast('error', result.message)
    }
  }

  const refresh = () => {
    orgs.reload()
    invites.reload()
  }

  return (
    <section id="organisations" aria-labelledby="organisations-title" className="scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="organisations-title" className="text-ink text-h3">
          Organisations
        </h2>
        <Link href="/org/new" className="text-primary-ink text-sm font-semibold underline-offset-4 hover:underline">
          Create organisation
        </Link>
      </div>

      {invites.state.status === 'ready' && invites.state.value.length > 0 && (
        <ul aria-label="Pending invites" className="mt-4 space-y-3">
          {invites.state.value.map((invite) => (
            <li key={invite.id} className="border-primary/30 bg-primary/[0.05] rounded-card flex flex-wrap items-center gap-3 border p-4">
              <OrgAvatar org={invite.org} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm font-semibold break-words">
                  {invite.org.name} invited you as {roleLabel(invite.role)}
                </p>
                <p className="text-ink-muted text-xs">{expiryText(invite.expiresAt, now)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === invite.id}
                  onClick={() =>
                    void act(invite.id, 'respondToOrgInvite', { orgId: invite.orgId, inviteId: invite.id, accept: true }, `You joined ${invite.org.name}.`, refresh)
                  }
                  className={buttonClasses('primary', 'md')}
                >
                  Join {invite.org.name}
                </button>
                <button
                  type="button"
                  disabled={busy === invite.id}
                  aria-label={`Decline the invite from ${invite.org.name}`}
                  onClick={() =>
                    void act(invite.id, 'respondToOrgInvite', { orgId: invite.orgId, inviteId: invite.id, accept: false }, 'Invite declined.', refresh)
                  }
                  className={buttonClasses('ghost', 'md')}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <RemoteView remote={orgs.state} what="organisations" onRetry={orgs.reload}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">You are not in any organisation yet.</p>
            ) : (
              <ul aria-label="Your organisations" className="border-hairline bg-surface-1 rounded-card divide-hairline divide-y border">
                {list.map(({ org, role, hidden }) => (
                  <li key={org.id} className="flex flex-wrap items-center gap-3 p-4">
                    <OrgAvatar org={org} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <Link href={orgPath(org.handle)} className="text-ink block truncate font-semibold hover:underline">
                        {org.name}
                      </Link>
                      <p className="text-ink-muted text-xs">
                        {roleLabel(role)}
                        {org.archived ? ', archived' : hidden ? ', hidden from public lists' : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!org.archived && (
                        <Link href={manageHref(org.handle)} className={buttonClasses('secondary', 'md')}>
                          Manage
                        </Link>
                      )}
                      {!org.archived && (
                        <button
                          type="button"
                          disabled={busy === org.id}
                          onClick={() =>
                            void act(
                              org.id,
                              'setMyOrgMembershipHidden',
                              { orgId: org.id, hidden: !hidden },
                              hidden ? `You show on ${org.name}’s public lists.` : `You are hidden from ${org.name}’s public lists.`,
                              orgs.reload,
                            )
                          }
                          className={buttonClasses('ghost', 'md')}
                        >
                          {hidden ? 'Show on public lists' : 'Hide from public lists'}
                        </button>
                      )}
                      {!org.archived && (
                        <ConfirmButton
                          label={`Leave ${org.name}`}
                          confirm={`Yes, leave ${org.name}`}
                          busy={busy === org.id}
                          onConfirm={() => void act(org.id, 'leaveOrganization', { orgId: org.id }, `You left ${org.name}.`, orgs.reload)}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </div>
    </section>
  )
}
```

In `components/me/me-dashboard.tsx`, add `import { OrgMemberships } from './org-memberships'` and, inside `<div className="min-w-0 space-y-12" aria-busy=…>`, after the `{connections.status === 'ready' && ( … )}` block, add:

```tsx
          <OrgMemberships session={session} onToast={show} />
```

- [ ] **Step 8: Run the specs**

Run: `pnpm exec playwright test e2e/org-account.spec.ts e2e/me.spec.ts e2e/account-switch.spec.ts e2e/site-shell.spec.ts --reporter=line 2>&1 | tail -5`
Expected: PASS (the existing `/me`, account-switch and site-shell specs keep passing; their stub answers default to no organisations and no unread notifications).

- [ ] **Step 9: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed: 15 marketing pages load no wallet code."

```bash
git add lib/orgs/notifications.ts components/site components/notifications pages/notifications.tsx components/me scripts/check-wallet-chunks.mjs e2e/org-account.spec.ts
git commit -m "feat(orgs): notifications, organisation switcher and memberships on /me"
```

---

### Task 9: Layout guards and CI for the new pages

**Files:**
- Modify: `e2e/layout-invariants.spec.ts` (fixtures, `PAGES`, `STATES`), `.github/workflows/e2e.yml`
- Test: `e2e/layout-invariants.spec.ts`

**Interfaces:**
- Consumes: `installDirectoryFixture`, `organization`, `orgMember`, `serveOrgReads` (Task 1); `openManagePage` (Task 5); every page of Tasks 3–8.
- Produces: layout cases `orgs`, `org`, `invite`, `org-manage`, `notifications` (390/1280 × light/dark) and states `org: mobile menu open`, `org-manage: teams section`, `org-manage: settings section`, `org-manage: invite link created`, `trust: account menu with organisations`; CI runs every organisation spec.

- [ ] **Step 1: Add the fixtures and cases**

In `e2e/layout-invariants.spec.ts`, add imports:

```ts
import { installDirectoryFixture, organization, orgMember, orgSummary, serveOrgReads } from './support/org-fixtures'
import { openManagePage } from './support/org-manage'
```

After the `APP` constant, add:

```ts
const LAYOUT_ORG_ID = 'a0c0ffee-0000-4000-8000-00000000c001'
// Long name, handle and domain on purpose: the guards must hold for the worst case.
const LAYOUT_ORG = organization({
  id: LAYOUT_ORG_ID,
  did: `did:web:www.renown.id:org:${LAYOUT_ORG_ID}`,
  handle: 'acme-layout',
  name: 'The Extraordinarily Long Named Cooperative of Layout Testers Ltd',
  bio: 'We check that every organisation page keeps its shape, on every screen, in both themes, with long names and longer domains.',
  website: 'https://acme-layout.example',
  links: [{ id: 'l1', label: 'GitHub', url: 'https://github.com/acme-layout' }],
  verifiedDomains: ['a-rather-long-subdomain.acme-layout-verification.example'],
  apps: [{ appDid: APP_DID, addedAt: '2026-10-02T10:00:00.000Z', frozen: false }],
  memberCount: 7,
})
const LAYOUT_INVITE_TOKEN = 'layoutInviteTokenAAAAAAAAAAAAAAAAAAAAAAAAAA'
const LONG_MEMBERS = [
  orgMember({ orgId: LAYOUT_ORG_ID, address: '0x5e00000000000000000000000000000000001b01', role: 'OWNER', displayName: 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley' }),
  orgMember({ orgId: LAYOUT_ORG_ID, address: '0x5e00000000000000000000000000000000001b02', role: 'PUBLISHER', handle: 'a-very-long-handle-of-thirty-c' }),
]
```

In `test.beforeAll`, add:

```ts
  await installDirectoryFixture()
  await fixtureStub({ match: 'query OrgByRef', variables: '"acme-layout"', response: { data: { organization: LAYOUT_ORG } } })
  await fixtureStub({
    match: 'query OrganizationStats',
    variables: LAYOUT_ORG_ID,
    response: { data: { organizationStats: { orgId: LAYOUT_ORG_ID, apps: 1, activeUsers30d: 123456, activeDelegations: 42, attestations30d: 7 } } },
  })
  await fixtureStub({ match: 'query AppProfilesByOrg', variables: LAYOUT_ORG_ID, response: { data: { appProfiles: { items: [APP], next: null } } } })
  await fixtureStub({ match: 'query OrgMembers', variables: LAYOUT_ORG_ID, response: { data: { organizationMembers: LONG_MEMBERS } } })
  await fixtureStub({
    match: 'query OrgInviteLinkPreview',
    variables: LAYOUT_INVITE_TOKEN,
    response: {
      data: {
        orgInviteLink: {
          org: orgSummary({ id: LAYOUT_ORG_ID, handle: 'acme-layout', name: LAYOUT_ORG.name, verifiedDomains: LAYOUT_ORG.verifiedDomains }),
          role: 'PUBLISHER',
          expiresAt: '2036-10-19T10:00:00.000Z',
          expired: false,
          revoked: false,
          full: false,
          usable: true,
        },
      },
    },
  })
```

After `openSignedInMe`, add:

```ts
/** The members page for a signed-in owner of a long-named organisation (reads answered in the browser). */
async function openSignedInManage(page: Page): Promise<void> {
  await openManagePage(page, { role: 'OWNER', section: 'members', org: { name: LAYOUT_ORG.name, teams: [{ id: 't1', orgId: 'x', slug: 'core-platform-and-infrastructure', name: 'Core platform and infrastructure', appDids: [APP_DID], memberAddresses: [] }] } })
  await expect(page.getByRole('list', { name: 'Members' })).toBeVisible({ timeout: 30_000 })
}

/** The inbox for a stand-in session, with long notifications. */
async function openNotifications(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__renownE2eSession = { address: '0x5e00000000000000000000000000000000001c01', calls: [] }
    w.__renownE2eBearer = 'e2e-layout-bearer'
  })
  const org = orgSummary({ id: LAYOUT_ORG_ID, handle: 'acme-layout', name: LAYOUT_ORG.name })
  const at = '2026-10-12T10:00:00.000Z'
  await serveOrgReads(page, {
    MyUnreadNotificationCount: () => ({ myUnreadNotificationCount: 12 }),
    MyNotifications: () => ({
      myNotifications: {
        items: [
          { id: 'n1', kind: 'RECOVERY_STARTED', orgId: LAYOUT_ORG_ID, org, payload: JSON.stringify({ kind: 'RECOVER', domain: LAYOUT_ORG.verifiedDomains[0] }), createdAt: at, readAt: null },
          { id: 'n2', kind: 'INVITED', orgId: LAYOUT_ORG_ID, org, payload: JSON.stringify({ role: 'PUBLISHER' }), createdAt: at, readAt: at },
        ],
        next: null,
      },
    }),
  })
  await page.goto('/notifications')
  await expect(page.getByRole('list', { name: 'Notifications' })).toBeVisible({ timeout: 30_000 })
}

const openSection = (label: string) => async (page: Page): Promise<SurfaceSpec> => {
  await page.getByRole('navigation', { name: 'Organisation settings' }).getByRole('link', { name: label }).click()
  const heading = page.getByRole('heading', { level: 2, name: label })
  await expect(heading).toBeVisible({ timeout: 30_000 })
  return { panel: heading.locator('xpath=..') }
}

const createInviteLink = async (page: Page): Promise<SurfaceSpec> => {
  await page.route('**/api/org/createOrgInviteLink', (route) =>
    route.fulfill({
      json: {
        data: {
          link: { id: 'l1', orgId: LAYOUT_ORG_ID, role: 'MEMBER', maxUses: 10, uses: 0, expiresAt: '2036-10-19T10:00:00.000Z', revoked: false, createdBy: '0x', createdAt: '2026-10-12T10:00:00.000Z' },
          token: 'layoutCreatedTokenAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
      },
    }),
  )
  await page.getByRole('button', { name: 'Create invite link' }).click()
  const panel = page.getByRole('region', { name: 'New invite link' })
  await expect(panel).toBeVisible({ timeout: 30_000 })
  return { panel }
}

/** The site chrome's stand-in session with memberships of long-named organisations. */
async function standInMenuSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__renownE2eSession = { address: '0x5e00000000000000000000000000000000001d01', calls: [] }
    w.__renownE2eBearer = 'e2e-layout-bearer'
  })
  await serveOrgReads(page, {
    OrgsByMember: () => ({
      organizationsByMember: [
        { role: 'OWNER', hidden: false, org: { ...orgSummary({ id: 'org-layout-menu-1', handle: 'acme-layout', name: LAYOUT_ORG.name }), archived: false } },
        { role: 'PUBLISHER', hidden: false, org: { ...orgSummary({ id: 'org-layout-menu-2', handle: 'beta-layout', name: 'Beta' }), archived: false } },
      ],
    }),
  })
}

const openAccountMenu = async (page: Page): Promise<SurfaceSpec> => {
  await page.getByRole('button', { name: /Account menu/ }).click()
  const panel = page.getByRole('menu', { name: 'Account' })
  await expect(panel.getByRole('menuitem', { name: /Beta/ })).toBeVisible({ timeout: 30_000 })
  return { panel }
}
```

Add to `PAGES`:

```ts
  { name: 'orgs', open: visit('/orgs', 'Organisations on Renown') },
  { name: 'org', open: visit('/@acme-layout', LAYOUT_ORG.name) },
  { name: 'invite', open: visit(`/invite/${LAYOUT_INVITE_TOKEN}`, `Join ${LAYOUT_ORG.name}`) },
  { name: 'org-manage', open: openSignedInManage },
  { name: 'notifications', open: openNotifications },
```

Add to `STATES`:

```ts
  { name: 'mobile menu open', page: 'org', widths: [390], open: openMenu },
  { name: 'teams section', inline: true, page: 'org-manage', widths: [390, 1280], open: openSection('Teams') },
  { name: 'settings section', inline: true, page: 'org-manage', widths: [390, 1280], open: openSection('Settings') },
  { name: 'invite link created', inline: true, page: 'org-manage', widths: [390, 1280], open: createInviteLink },
  { name: 'account menu with organisations', page: 'trust', widths: [1280], prepare: standInMenuSession, open: openAccountMenu },
```

- [ ] **Step 2: Run the layout guards**

Run: `pnpm exec playwright test e2e/layout-invariants.spec.ts e2e/layout-invariants-guards.spec.ts --workers=2 --reporter=line 2>&1 | tail -8`
Expected: PASS. If a case fails, open its attached screenshot (`pnpm exec playwright show-report`) and fix the component (typically a missing `min-w-0`, `break-words`/`break-all` or `truncate` on a long name, handle or domain), never the guard.

- [ ] **Step 3: Run every organisation spec in CI**

In `.github/workflows/e2e.yml`, replace the `Run e2e specs` step's `run` with:

```yaml
        run: >-
          pnpm exec playwright test
          e2e/layout-invariants-guards.spec.ts
          e2e/layout-invariants.spec.ts
          e2e/wallet-split.spec.ts
          e2e/account-switch.spec.ts
          e2e/org-client.spec.ts
          e2e/org-write.spec.ts
          e2e/org-page.spec.ts
          e2e/orgs-directory.spec.ts
          e2e/org-join.spec.ts
          e2e/org-manage-members.spec.ts
          e2e/org-manage-teams-settings.spec.ts
          e2e/org-account.spec.ts
          --workers=2
```

and change the comment at the top of the file to "The layout guards, the wallet/account specs and the organisation specs, in a real browser."

- [ ] **Step 4: Run the whole CI set locally**

Run: `CI=1 pnpm exec playwright test e2e/layout-invariants-guards.spec.ts e2e/layout-invariants.spec.ts e2e/wallet-split.spec.ts e2e/account-switch.spec.ts e2e/org-client.spec.ts e2e/org-write.spec.ts e2e/org-page.spec.ts e2e/orgs-directory.spec.ts e2e/org-join.spec.ts e2e/org-manage-members.spec.ts e2e/org-manage-teams-settings.spec.ts e2e/org-account.spec.ts --workers=2 --reporter=line 2>&1 | tail -8`
Expected: all pass (with `CI=1` the config starts fresh servers and retries a flaky test twice; a test that needs a retry is reported as flaky and must be fixed before merging).

- [ ] **Step 5: Lint, build, commit**

Run: `pnpm lint 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: clean; "Wallet code check passed".

```bash
git add e2e/layout-invariants.spec.ts .github/workflows/e2e.yml
git commit -m "test(orgs): layout guards and CI for the organisation pages"
```

---

## B1 rollout

- [ ] After B2 is also complete on `feat/organisations`: push, open a PR into `deploy/staging`, let CI pass, merge, wait for the `staging-<sha7>` image and the renown staging rollout, then check on `https://renown-staging.vetra.io` against the staging switchboard (A1–A3 deployed there): `/orgs` lists, `/@<a staging org>` renders, `/org/<id>/did.json` answers JSON whose `id` is `did:web:renown-staging.vetra.io:org:<id>`, create an org with a staging wallet, invite a second staging wallet by link and accept it, and the bell shows the invite. Then PR into `main`.

- [ ] **Load check on staging (D23).** The switchboard throttles public reads to 60/min per client IP (bearer address, else first `X-Forwarded-For` hop, else one shared bucket). Before the PR into `main`, confirm on `https://renown-staging.vetra.io` that SSR `/orgs` and `/@<org>` pass the visitor's IP through `X-Forwarded-For` (several different clients each get 200, none share a bucket), and that a burst of more than 60 requests from one client answers 503 with `Retry-After` on `/orgs`, never an empty cacheable listing.

## Self-review

- **Spec coverage (section 5, B1 part):** routes `/orgs` (Task 4), `/org/new` (Task 5), `/@handle` org branch and org page with hero, verification, affiliation warning, bio, links, apps grid with totals, public members and JSON-LD (Task 3; the Report button is B2), `/org/[id]` canonical-by-handle and `did.json` (Task 3), `/invite/[token]` (Task 5), `/notifications` and the bell polled every 60 s while visible (Task 8), manage members with invite by address/handle, invite links, roles, app scope, remove and pending (Task 6), teams (Task 7), settings with profile, handle-change proposal, listed, membersPublic and delete proposal (Task 7), account-menu switcher remembering `renown.activeOrg` and "Create organisation" (Task 8), profile "Member of" (Task 3), `/me` memberships and invites (Task 8), the signed-message helper pinned to A1's vectors and the `/api/org/[mutation]` passthrough (Tasks 1–2), layout invariants `PAGES` (public pages and the signed-in ones) and `STATES` for manage pages, and CI (Task 9). Left to B2 by the split: manage apps/security/domains/webhooks/oidc/audit, app-page publisher, `/apps?org=`, `/verify`, `/admin/reports`, the Report button.
- **Placeholders:** none; every step has its code or exact edit.
- **Type consistency:** `OrgWriteResult`, `orgWriter`, `sessionSigner`, `ManageContext.run`, `useRemote` and the fixture builders have one signature each across tasks; `signedWrite(wallet, mutation, orgId, match?)` is used the same way in Tasks 5–8.
- **Review Focus** lines are pinned: 1 → Task 2 "signs exactly the arguments it posts" and Task 7 "settings send only what changed"; 2 → Task 3 "answers 503 when organisations cannot be read"; 3 → Task 5 "never sends the invite token to analytics" and the header checks; 4 → Task 6 "offers only the roles the viewer may grant"; 5 → Task 3 "a taken-down organisation shows only the notice".
