import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useState, type FormEvent } from 'react'
import { useNow } from '../../hooks/use-now'
import { useRemote, type Remote } from '../../hooks/use-remote'
import { orgPath, shortDid } from '../../lib/orgs/format'
import { normalizeOrgHandle } from '../../lib/orgs/handles'
import { expiryText } from '../../lib/orgs/members'
import { proposalAnchor } from '../../lib/orgs/proposals'
import { partyText, transferDirection } from '../../lib/orgs/transfers'
import { getAppProfilesByPublisher, listAppProfiles } from '../../services/app-profiles'
import { appTransfers, orgProposals, type AppTransfer } from '../../services/org-security'
import { roleAtLeast } from '../../services/org-signed-messages'
import {
  fetchOrganization,
  toOrgApiError,
  withBearer,
  type OrgApp,
  type OrgProposal,
} from '../../services/orgs'
import { Field, inputClass } from '../profile-edit/field'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext, ManageSectionProps } from './manage-context'
import { LONG_LABEL, Panel, RemoteView } from './manage-ui'

type AppName = (did: string) => string

function TransferOutForm({
  ctx,
  app,
  name,
  onDone,
  onRecheck,
  onProposed,
}: {
  ctx: ManageContext
  app: OrgApp
  name: string
  onDone: () => void
  onRecheck: () => void
  onProposed: () => void
}) {
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
      let target: Awaited<ReturnType<typeof fetchOrganization>>
      try {
        target = await fetchOrganization({ handle: normalizeOrgHandle(to) })
      } catch (error) {
        const failure = toOrgApiError(error)
        setProblem(
          failure.code === 'NOT_FOUND'
            ? 'No organisation has this handle.'
            : 'Could not look the organisation up. Try again.',
        )
        return
      }
      if (!target) {
        setProblem('No organisation has this handle.')
        return
      }
      if (target.id === ctx.org.id) {
        setProblem('The app already belongs to this organisation.')
        return
      }
      toId = target.id
    }
    setBusy(true)
    const done = await ctx.run(
      'proposeOrgChange',
      {
        orgId: ctx.org.id,
        kind: 'TRANSFER_APP_OUT',
        payload: { appDid: app.appDid, toKind: kind, toId },
      },
      `Transfer of ${name} proposed. Follow it under Security.`,
      { recheck: onRecheck },
    )
    setBusy(false)
    onProposed()
    if (done) onDone()
  }

  return (
    <form
      onSubmit={(event) => void propose(event)}
      noValidate
      className="border-hairline rounded-card mt-3 space-y-3 border p-4"
    >
      <fieldset>
        <legend className="text-ink text-sm font-semibold">Transfer {name} to</legend>
        <label className="text-ink mt-2 flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`to-${app.appDid}`}
            checked={kind === 'PERSON'}
            onChange={() => setKind('PERSON')}
          />
          A person (wallet address)
        </label>
        <label className="text-ink mt-1 flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`to-${app.appDid}`}
            checked={kind === 'ORG'}
            onChange={() => setKind('ORG')}
          />
          Another organisation (handle)
        </label>
      </fieldset>
      <Field id={`to-${app.appDid}`} label="Recipient" error={problem ?? undefined}>
        <input
          id={`to-${app.appDid}`}
          className={inputClass}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={kind === 'PERSON' ? '0x…' : 'handle'}
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <p className="text-ink-muted text-xs">
        It needs a second owner’s approval when there is one, and a waiting period; then the
        recipient accepts it.
      </p>
      <button type="submit" disabled={busy} className={buttonClasses('primary', 'md')}>
        {busy ? 'Proposing…' : 'Propose transfer'}
      </button>
    </form>
  )
}

type Proposals = { state: Remote<OrgProposal[]>; reload: () => void }

const APP_KINDS = ['FREEZE_APP', 'UNFREEZE_APP', 'TRANSFER_APP_OUT']

function OrgAppsPanel({
  ctx,
  appName,
  proposals,
}: {
  ctx: ManageContext
  appName: AppName
  proposals: Proposals
}) {
  const owner = ctx.role === 'OWNER'
  const [busy, setBusy] = useState<string | null>(null)
  const [transferring, setTransferring] = useState<string | null>(null)
  const onRecheck = proposals.reload
  const open =
    proposals.state.status === 'ready'
      ? proposals.state.value.filter((p) => p.status === 'PENDING' && APP_KINDS.includes(p.kind))
      : []
  const reading = owner && proposals.state.status === 'loading'

  async function freeze(app: OrgApp) {
    setBusy(app.appDid)
    const kind = app.frozen ? 'UNFREEZE_APP' : 'FREEZE_APP'
    await ctx.run(
      'proposeOrgChange',
      { orgId: ctx.org.id, kind, payload: { appDid: app.appDid } },
      `${app.frozen ? 'Unfreezing' : 'Freezing'} ${appName(app.appDid)} proposed. Follow it under Security.`,
      { recheck: onRecheck },
    )
    proposals.reload()
    setBusy(null)
  }

  return (
    <Panel
      id="org-apps-title"
      title="Apps"
      description="Apps the organisation publishes. A frozen app’s delegations stop counting and it gets no tokens until it is unfrozen."
    >
      {ctx.org.apps.length === 0 ? (
        <p className="text-ink-muted text-sm">
          The organisation has no apps yet. Bring one in below, or create one in the organisation on
          Vetra.
        </p>
      ) : (
        <ul aria-label="Organisation apps" className="divide-hairline divide-y">
          {ctx.org.apps.map((app) => {
            const name = appName(app.appDid)
            const pendingProposal = open.find((p) => p.payload.appDid === app.appDid)
            return (
              <li key={app.appDid} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/app/${app.appDid}`}
                      className="text-ink font-semibold break-words hover:underline"
                    >
                      {name}
                    </Link>
                    <p className="text-ink-muted font-mono text-xs break-all">{app.appDid}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {app.frozen && <Badge>Frozen</Badge>}
                    {pendingProposal && (
                      <Link
                        href={`${orgPath(ctx.org.handle)}/manage/security#${proposalAnchor(pendingProposal.id)}`}
                        className="text-ink-muted text-sm underline-offset-4 hover:underline"
                      >
                        Proposal pending
                      </Link>
                    )}
                    {owner && (
                      <button
                        type="button"
                        disabled={busy === app.appDid || reading || !!pendingProposal}
                        onClick={() => void freeze(app)}
                        className={buttonClasses('ghost', 'md', LONG_LABEL)}
                      >
                        {app.frozen ? `Propose unfreezing ${name}` : `Propose freezing ${name}`}
                      </button>
                    )}
                    {owner && !app.frozen && !pendingProposal && (
                      <button
                        type="button"
                        aria-expanded={transferring === app.appDid}
                        onClick={() =>
                          setTransferring(transferring === app.appDid ? null : app.appDid)
                        }
                        className={buttonClasses('ghost', 'md')}
                      >
                        Transfer {name} out
                      </button>
                    )}
                  </div>
                </div>
                {transferring === app.appDid && (
                  <TransferOutForm
                    ctx={ctx}
                    app={app}
                    name={name}
                    onDone={() => setTransferring(null)}
                    onRecheck={onRecheck}
                    onProposed={proposals.reload}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function TransfersPanel({
  ctx,
  appName,
  transfers,
  onChange,
}: {
  ctx: ManageContext
  appName: AppName
  transfers: ReturnType<typeof useRemote<AppTransfer[]>>
  onChange: () => void
}) {
  const admin = roleAtLeast(ctx.role, 'ADMIN')
  const now = useNow()
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(transfer: AppTransfer, accept: boolean, success: string) {
    setBusy(transfer.id)
    const done = await ctx.run(
      accept ? 'acceptAppTransfer' : 'declineAppTransfer',
      { transferId: transfer.id },
      success,
      { recheck: onChange },
    )
    setBusy(null)
    if (done) onChange()
  }

  return (
    <Panel
      id="transfers-title"
      title="Transfers"
      description="Apps on their way into or out of the organisation. A transfer expires after 14 days."
    >
      <RemoteView remote={transfers.state} what="transfers" onRetry={transfers.reload}>
        {(list) => {
          const pending = list.filter((t) => t.status === 'PENDING')
          const incoming = pending.filter((t) => transferDirection(t, ctx.org.id) === 'in')
          const outgoing = pending.filter((t) => transferDirection(t, ctx.org.id) === 'out')
          const moved = list.filter((t) => t.status === 'CANCELLED' && t.decidedBy === 'system')
          if (incoming.length === 0 && outgoing.length === 0 && moved.length === 0)
            return <p className="text-ink-muted text-sm">No transfers are waiting.</p>
          return (
            <div className="space-y-6">
              {incoming.length > 0 && (
                <ul aria-label="Incoming transfers" className="divide-hairline divide-y">
                  {incoming.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <p className="text-ink min-w-0 text-sm break-words">
                        {appName(t.appDid)} from {partyText(t.fromKind, t.fromId)}
                        <span className="text-ink-muted">
                          , {expiryText(t.expiresAt, now).toLowerCase()}
                        </span>
                      </p>
                      {admin && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy === t.id}
                            onClick={() =>
                              void decide(
                                t,
                                true,
                                `${appName(t.appDid)} now belongs to ${ctx.org.name}.`,
                              )
                            }
                            className={buttonClasses('primary', 'md')}
                          >
                            Accept {appName(t.appDid)}
                          </button>
                          <button
                            type="button"
                            disabled={busy === t.id}
                            onClick={() => void decide(t, false, 'Transfer declined.')}
                            className={buttonClasses('ghost', 'md')}
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {moved.length > 0 && (
                <ul aria-label="Ended transfers" className="divide-hairline divide-y">
                  {moved.map((t) => (
                    <li key={t.id} className="text-ink-muted py-3 text-sm break-words">
                      {appName(t.appDid)}: Cancelled because the app changed owner
                    </li>
                  ))}
                </ul>
              )}
              {outgoing.length > 0 && (
                <ul aria-label="Outgoing transfers" className="divide-hairline divide-y">
                  {outgoing.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <p className="text-ink min-w-0 text-sm break-words">
                        {appName(t.appDid)} to {partyText(t.toKind, t.toId)}, waiting for them to
                        accept
                      </p>
                      {(t.proposalId ? ctx.role === 'OWNER' : admin) && (
                        <button
                          type="button"
                          disabled={busy === t.id}
                          onClick={() => void decide(t, false, 'Transfer cancelled.')}
                          className={buttonClasses('ghost', 'md')}
                        >
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
  const { address, getBearer } = ctx
  const load = useCallback(async () => {
    const mine = await getAppProfilesByPublisher(address)
    // Person-owned apps only (an org-owned app's publisherDid is the org's did:web).
    return mine.filter((app) => (app.publisherDid ?? '').toLowerCase().endsWith(`:${address}`))
  }, [address])
  const apps = useRemote(`bring:${address}`, load)
  // The viewer's own transfers (they may read them at any role): a lost answer is re-read here.
  const loadMine = useCallback(
    async () => withBearer(getBearer, (bearer) => appTransfers({ address }, bearer)),
    [address, getBearer],
  )
  const mine = useRemote(`bring-transfers:${address}`, loadMine)
  const requested = new Set(
    mine.state.status === 'ready'
      ? mine.state.value
          .filter((t) => t.status === 'PENDING' && t.toKind === 'ORG' && t.toId === ctx.org.id)
          .map((t) => t.appDid)
      : [],
  )
  const preselect = typeof router.query.bring === 'string' ? router.query.bring : ''
  const [chosen, setChosen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Panel
      id="bring-title"
      title="Bring an app you publish"
      description={`The organisation then owns the app: its profile, stats and history stay as they are. An admin of ${ctx.org.name} accepts the transfer.`}
    >
      <RemoteView remote={apps.state} what="apps you publish" onRetry={apps.reload}>
        {(list) => {
          const candidates = list.filter(
            (app) =>
              !ctx.org.apps.some((own) => own.appDid === app.appDid) && !requested.has(app.appDid),
          )
          const waiting = list.filter((app) => requested.has(app.appDid))
          const unusable = preselect !== '' && !candidates.some((app) => app.appDid === preselect)
          const alreadyWaiting = requested.has(preselect)
          const unusableText = alreadyWaiting
            ? `A transfer of this app to ${ctx.org.name} is already waiting for an admin.`
            : 'This app isn’t one you publish, or it already belongs to an organisation.'
          if (candidates.length === 0 && waiting.length > 0 && (!unusable || alreadyWaiting))
            return (
              <p className="text-ink-muted text-sm">
                Your transfer request is waiting for an admin of {ctx.org.name}.
              </p>
            )
          if (candidates.length === 0)
            return (
              <p className="text-ink-muted text-sm">
                You do not personally publish any app that could move here.
              </p>
            )
          // A link for one specific app never falls back to another app.
          const value =
            chosen ??
            (preselect !== '' && !unusable ? preselect : unusable ? '' : candidates[0].appDid)
          return (
            <div className="space-y-3">
              {unusable && (
                <p role="alert" className="text-ink text-sm">
                  {unusableText}
                </p>
              )}
              <form
                noValidate
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (!value) return
                  setBusy(true)
                  const done = await ctx.run(
                    'proposeAppTransfer',
                    { appDid: value, toOrgId: ctx.org.id },
                    `Transfer requested. An admin of ${ctx.org.name} accepts it.`,
                    { recheck: mine.reload },
                  )
                  setBusy(false)
                  mine.reload()
                  if (done) onDone()
                }}
                className="flex flex-col gap-3 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <Field id="bring-app" label="App to bring">
                    <select
                      id="bring-app"
                      className={inputClass}
                      value={value}
                      onChange={(e) => setChosen(e.target.value)}
                    >
                      {unusable && chosen === null && (
                        <option value="" disabled>
                          Choose an app
                        </option>
                      )}
                      {candidates.map((app) => (
                        <option key={app.appDid} value={app.appDid}>
                          {app.name?.trim() || shortDid(app.appDid)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <button
                  type="submit"
                  disabled={busy || !value}
                  className={buttonClasses('primary', 'md', 'sm:mt-[1.625rem]')}
                >
                  {busy ? 'Requesting…' : `Request transfer to ${ctx.org.name}`}
                </button>
              </form>
            </div>
          )
        }}
      </RemoteView>
    </Panel>
  )
}

export function AppsSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const loadProfiles = useCallback(
    () =>
      org.apps.length > 0
        ? listAppProfiles({ limit: 50, orgId: org.id }).then((page) => page.items)
        : Promise.resolve([]),
    [org.id, org.apps.length],
  )
  const profiles = useRemote(`org-app-profiles:${org.id}`, loadProfiles)
  const admin = roleAtLeast(ctx.role, 'ADMIN')
  const loadTransfers = useCallback(
    async () => withBearer(getBearer, (bearer) => appTransfers({ orgId: org.id }, bearer)),
    [org.id, getBearer],
  )
  const loadProposals = useCallback(
    async () => withBearer(getBearer, (bearer) => orgProposals(org.id, bearer)),
    [org.id, getBearer],
  )
  // Only owners propose app changes, so only they read the proposals.
  const proposals = useRemote(
    ctx.role === 'OWNER' ? `org-app-proposals:${org.id}` : null,
    loadProposals,
  )
  // The orgId filter needs ADMIN: below that nothing is requested or shown.
  const transfers = useRemote(admin ? `org-transfers:${org.id}` : null, loadTransfers)
  const names = new Map(
    profiles.state.status === 'ready'
      ? profiles.state.value.map((p) => [p.appDid, p.name?.trim() ?? ''] as const)
      : [],
  )
  const appName: AppName = (did) => names.get(did) || shortDid(did)

  return (
    <div className="mt-6 space-y-8">
      <OrgAppsPanel ctx={ctx} appName={appName} proposals={proposals} />
      {admin && (
        <TransfersPanel
          ctx={ctx}
          appName={appName}
          transfers={transfers}
          onChange={() => {
            transfers.reload()
            ctx.reloadOrg()
          }}
        />
      )}
      <BringAppPanel ctx={ctx} onDone={transfers.reload} />
    </div>
  )
}
