import { useCallback, useState, type FormEvent } from 'react'
import { useAnchorScroll } from '../../hooks/use-anchor-scroll'
import { useNow } from '../../hooks/use-now'
import { useRemote, type Remote } from '../../hooks/use-remote'
import { memberLabel, shortAddress } from '../../lib/orgs/format'
import {
  canApprove,
  canCancel,
  canExecute,
  PROPOSAL_STATUS_LABELS,
  proposalAnchor,
  proposalConfirmation,
  proposalStage,
  proposalSummary,
  stageText,
} from '../../lib/orgs/proposals'
import { orgProposals } from '../../services/org-security'
import { withBearer, type OrgMember, type OrgProposal } from '../../services/orgs'
import { cx } from '../../utils/cx'
import { Field, inputClass } from '../profile-edit/field'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'
import { useConfirm } from './confirm-dialog'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'

/** A read with its reload (useRemote's state and reload). */
export type Reloadable<T> = { state: Remote<T>; reload: () => void }

/** The active owners' addresses, lowercase. */
export function ownerAddresses(members: OrgMember[]): string[] {
  return members
    .filter((m) => m.status === 'ACTIVE' && m.role === 'OWNER')
    .map((m) => m.address.toLowerCase())
}

const lower = (value: string) => value.toLowerCase()

/** Owners, and (for owners) proposals to add or remove one. */
export function OwnersPanel({
  ctx,
  members,
  proposals,
  onProposed,
}: {
  ctx: ManageContext
  members: Reloadable<OrgMember[]>
  proposals: Reloadable<OrgProposal[]>
  onProposed: () => void
}) {
  const owner = ctx.role === 'OWNER'
  const [candidate, setCandidate] = useState('')
  const [removal, setRemoval] = useState<Record<string, 'demote' | 'remove'>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const { ask, dialog } = useConfirm()
  // Writes are not idempotent: proposing waits for the proposals, and a pending one for the same address blocks a duplicate.
  const reading = proposals.state.status !== 'ready'
  const pending =
    proposals.state.status === 'ready'
      ? proposals.state.value.filter(
          (p) => p.status === 'PENDING' && (p.kind === 'ADD_OWNER' || p.kind === 'REMOVE_OWNER'),
        )
      : []
  const pendingFor = (address: string) =>
    pending.find((p) => p.payload.address !== null && lower(p.payload.address) === lower(address))

  async function propose(
    key: string,
    payload: Record<string, unknown>,
    kind: 'ADD_OWNER' | 'REMOVE_OWNER',
    success: string,
  ) {
    setBusy(key)
    const done = await ctx.run<OrgProposal>(
      'proposeOrgChange',
      { orgId: ctx.org.id, kind, payload },
      success,
      { recheck: onProposed },
    )
    setBusy(null)
    if (done) onProposed()
  }

  return (
    <Panel
      id="owners-title"
      title="Owners"
      description="Owners approve high-risk changes. With two or more owners, every such change needs two of them."
    >
      <RemoteView remote={members.state} what="owners" onRetry={members.reload}>
        {(list) => {
          const active = list.filter((m) => m.status === 'ACTIVE')
          const owners = active.filter((m) => m.role === 'OWNER')
          const others = active.filter((m) => m.role !== 'OWNER')
          const chosen = candidate || others[0]?.address || ''
          const chosenPending = chosen ? pendingFor(chosen) : undefined
          return (
            <>
              <ul aria-label="Owners" className="divide-hairline divide-y">
                {owners.map((member) => {
                  const label = memberLabel(member)
                  const mode = removal[member.address] ?? 'demote'
                  const open = pendingFor(member.address)
                  return (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-ink truncate font-semibold">
                          {label}
                          {lower(member.address) === ctx.address && (
                            <span className="text-ink-muted font-normal"> (you)</span>
                          )}
                        </p>
                        <p className="text-ink-muted truncate font-mono text-xs">
                          {member.address}
                        </p>
                      </div>
                      {owner && owners.length > 1 && open && (
                        <a
                          href={`#${proposalAnchor(open.id)}`}
                          className="text-ink-muted text-sm underline-offset-4 hover:underline"
                        >
                          Removal proposed
                        </a>
                      )}
                      {owner && owners.length > 1 && !open && (
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={`removal-${member.id}`} className="sr-only">
                            How to remove {label}
                          </label>
                          <select
                            id={`removal-${member.id}`}
                            className={cx(inputClass, 'w-auto')}
                            value={mode}
                            onChange={(e) =>
                              setRemoval((r) => ({
                                ...r,
                                [member.address]: e.target.value === 'remove' ? 'remove' : 'demote',
                              }))
                            }
                          >
                            <option value="demote">Demote to admin</option>
                            <option value="remove">Remove from the organisation</option>
                          </select>
                          <button
                            type="button"
                            disabled={busy === member.address || reading}
                            onClick={() =>
                              ask({
                                title: `Propose removing ${label}?`,
                                body: `${
                                  mode === 'demote'
                                    ? `Once it runs, ${label} stops being an owner of ${ctx.org.name} and becomes an admin.`
                                    : `Once it runs, ${label} leaves ${ctx.org.name}, and their delegations for its apps are suspended.`
                                } Other owners approve it first, and it runs after a waiting period unless an owner cancels it.`,
                                warning:
                                  lower(member.address) === ctx.address
                                    ? `This proposes ending your own ownership of ${ctx.org.name}.`
                                    : null,
                                confirm: `Yes, propose removing ${label}`,
                                onConfirm: () =>
                                  void propose(
                                    member.address,
                                    { address: member.address, demoteToAdmin: mode === 'demote' },
                                    'REMOVE_OWNER',
                                    `Removing ${label} as an owner was proposed.`,
                                  ),
                              })
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
                    if (chosen && !chosenPending)
                      void propose(
                        'add',
                        { address: chosen },
                        'ADD_OWNER',
                        'A new owner was proposed.',
                      )
                  }}
                  className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start"
                >
                  <div className="min-w-0 flex-1">
                    <Field
                      id="new-owner"
                      label="New owner"
                      hint={
                        others.length === 0
                          ? 'Invite someone first: only members can become owners.'
                          : chosenPending
                            ? 'A proposal for this member is already pending below.'
                            : undefined
                      }
                    >
                      <select
                        id="new-owner"
                        className={inputClass}
                        value={chosen}
                        onChange={(e) => setCandidate(e.target.value)}
                        disabled={others.length === 0}
                      >
                        {others.map((member) => (
                          <option key={member.id} value={member.address}>
                            {memberLabel(member)} ({shortAddress(member.address)})
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <button
                    type="submit"
                    disabled={!chosen || !!chosenPending || reading || busy === 'add'}
                    className={buttonClasses('primary', 'md', 'sm:mt-[1.625rem]')}
                  >
                    Propose a new owner
                  </button>
                </form>
              )}
              {owner && proposals.state.status === 'error' && (
                <div role="status" className="mt-3 text-sm">
                  <p className="text-ink-muted">
                    Proposing waits for the list of proposals, which did not load.
                  </p>
                  <button
                    type="button"
                    onClick={proposals.reload}
                    className={buttonClasses('secondary', 'md', 'mt-2')}
                  >
                    Load the proposals again
                  </button>
                </div>
              )}
              {dialog}
            </>
          )
        }}
      </RemoteView>
    </Panel>
  )
}

const isProposalAnchor = (id: string) => id.startsWith('proposal-')

/** Every proposal, pending first, with where it stands and what the viewer may do. */
export function ProposalsPanel({
  ctx,
  proposals,
  members,
  appName,
}: {
  ctx: ManageContext
  proposals: Reloadable<OrgProposal[]>
  members: Reloadable<OrgMember[]>
  appName: (did: string) => string
}) {
  const now = useNow(30_000)
  const [busy, setBusy] = useState<string | null>(null)
  const { ask, dialog } = useConfirm()
  useAnchorScroll(proposals.state.status === 'ready' && members.state.status === 'ready', isProposalAnchor)

  async function act(
    p: OrgProposal,
    name: 'approveOrgProposal' | 'cancelOrgProposal' | 'executeOrgProposal',
    success: string,
  ) {
    setBusy(p.id)
    const done = await ctx.run<OrgProposal>(
      name,
      { orgId: ctx.org.id, proposalId: p.id },
      success,
      { recheck: proposals.reload },
    )
    setBusy(null)
    if (done) {
      proposals.reload()
      if (name === 'executeOrgProposal') {
        members.reload()
        ctx.reloadOrg()
      }
    }
  }

  /** Approve or run; high-impact kinds ask first, naming what they act on and the consequence. */
  function confirmThen(
    p: OrgProposal,
    action: 'approve' | 'execute',
    person: (address: string) => string,
  ) {
    const run = () =>
      action === 'approve'
        ? void act(p, 'approveOrgProposal', 'Approved.')
        : void act(p, 'executeOrgProposal', 'Carried out.')
    const confirmation = proposalConfirmation(p, action, {
      org: ctx.org.name,
      app: appName,
      person,
      viewer: ctx.address,
    })
    if (!confirmation) run()
    else ask({ ...confirmation, onConfirm: run })
  }

  return (
    <Panel
      id="proposals-title"
      title="Proposals"
      description="High-risk changes wait for owners’ approval, then for a delay before they can run (freezing or unfreezing an app has none). Once ready, any owner can run it, or Renown runs it shortly. Any owner can cancel before it runs."
    >
      <RemoteView remote={proposals.state} what="proposals" onRetry={proposals.reload}>
        {(list) => {
          if (list.length === 0) return <p className="text-ink-muted text-sm">No proposals yet.</p>
          // Approvals count only from current owners, so the stages need the owner list. Its
          // failure (with a retry) shows once, in the Owners panel above.
          if (members.state.status === 'loading')
            return (
              <p role="status" className="text-ink-muted text-sm">
                Loading owners…
              </p>
            )
          if (members.state.status === 'error')
            return (
              <p className="text-ink-muted text-sm">
                Proposals show once the owners load (see Owners above).
              </p>
            )
          const memberList = members.state.value
          const person = (address: string) => {
            const member = memberList.find((m) => lower(m.address) === lower(address))
            return member
              ? `${memberLabel(member)} (${shortAddress(lower(address))})`
              : shortAddress(lower(address))
          }
          const owners = ownerAddresses(memberList)
          const sorted = [
            ...list.filter((p) => p.status === 'PENDING'),
            ...list.filter((p) => p.status !== 'PENDING').slice(0, 20),
          ]
          return (
            <>
              <ul aria-label="Proposals" className="divide-hairline divide-y">
                {sorted.map((p) => {
                  const summary = proposalSummary(p, appName)
                  const stage = proposalStage(p, now, owners)
                  const pending = p.status === 'PENDING'
                  return (
                    <li
                      key={p.id}
                      id={proposalAnchor(p.id)}
                      tabIndex={-1}
                      className="scroll-mt-24 py-4 outline-none target:ring-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-ink font-semibold break-words">{summary}</p>
                          <p className="text-ink-muted mt-1 text-xs">
                            {p.kind === 'RECOVER'
                              ? `Started by ${shortAddress(p.proposer)} through a verified domain. Owners were notified and any of them can cancel it.`
                              : `Proposed by ${shortAddress(p.proposer)}`}
                            {pending &&
                              stage.stage === 'approvals' &&
                              `, ${stage.have} of ${stage.need} owner approvals`}
                            {pending &&
                              stage.stage === 'ready' &&
                              '. Renown runs it shortly if no owner does'}
                            {p.reason ? `. ${p.reason}` : ''}
                          </p>
                        </div>
                        {pending && stage.stage !== 'closed' ? (
                          <Badge tone={stage.stage === 'ready' ? 'signal' : 'neutral'}>
                            {stageText(stage, now)}
                          </Badge>
                        ) : (
                          <Badge>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
                        )}
                      </div>
                      {pending && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canApprove(p, ctx.address, ctx.role, now) && (
                            <button
                              type="button"
                              disabled={busy === p.id}
                              onClick={() => confirmThen(p, 'approve', person)}
                              aria-label={`Approve: ${summary}`}
                              className={buttonClasses('primary', 'md')}
                            >
                              Approve
                            </button>
                          )}
                          {canExecute(p, ctx.address, ctx.role, now) && (
                            <button
                              type="button"
                              disabled={busy === p.id}
                              onClick={() => confirmThen(p, 'execute', person)}
                              aria-label={`Run now: ${summary}`}
                              className={buttonClasses('primary', 'md')}
                            >
                              Run now
                            </button>
                          )}
                          {canCancel(p, ctx.address, ctx.role) && (
                            <ConfirmButton
                              label={`Cancel: ${summary}`}
                              confirm={`Yes, cancel: ${summary}`}
                              busy={busy === p.id}
                              onConfirm={() => void act(p, 'cancelOrgProposal', 'Cancelled.')}
                            />
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {dialog}
            </>
          )
        }}
      </RemoteView>
    </Panel>
  )
}

/** The proposals read, shared by the panels that create and list them. */
export function useOrgProposals(ctx: ManageContext) {
  const { org, getBearer } = ctx
  const load = useCallback(
    () => withBearer(getBearer, (bearer) => orgProposals(org.id, bearer)),
    [org.id, getBearer],
  )
  return useRemote(`proposals:${org.id}`, load)
}
