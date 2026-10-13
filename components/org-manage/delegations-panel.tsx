import { useCallback, useState } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { canUnsuspend, credentialStateText } from '../../lib/orgs/credentials'
import { roleLabel, shortAddress } from '../../lib/orgs/format'
import {
  orgCredentials,
  orgWorkloads,
  type OrgCredential,
  type OrgWorkload,
} from '../../services/org-security'
import { withBearer } from '../../services/orgs'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'

const live = (c: OrgCredential) => c.status.counts && !c.revoked

/** Keys members authorised for the organisation's apps, whether each still counts, and suspension. */
export function DelegationsPanel({
  ctx,
  appName,
}: {
  ctx: ManageContext
  appName: (did: string) => string
}) {
  const { org, getBearer } = ctx
  const load = useCallback(
    () => withBearer(getBearer, (bearer) => orgCredentials(org.id, bearer)),
    [org.id, getBearer],
  )
  const credentials = useRemote(`credentials:${org.id}`, load)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(
    key: string,
    name: 'suspendOrgCredentials' | 'unsuspendOrgCredential',
    args: Record<string, unknown>,
    success: string,
  ) {
    setBusy(key)
    const done = await ctx.run(name, { orgId: org.id, ...args }, success, {
      recheck: credentials.reload,
    })
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
          if (list.length === 0)
            return (
              <p className="text-ink-muted text-sm">No delegations for the organisation’s apps.</p>
            )
          // "Suspend every delegation" suspends the issuer's live ones, so it is offered only while one counts.
          const issuers = [...new Set(list.filter(live).map((c) => c.issuer.toLowerCase()))]
          return (
            <>
              <ul aria-label="Delegations" className="divide-hairline divide-y">
                {list.map((c) => {
                  const issuer = shortAddress(c.issuer.toLowerCase())
                  return (
                    <li
                      key={c.credentialId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-ink text-sm font-semibold break-words">
                          {appName(c.appDid)}, from {issuer}
                          {c.issuerRole ? ` (${roleLabel(c.issuerRole)})` : ''}
                        </p>
                        <p className="text-ink-muted font-mono text-xs break-all">
                          {c.credentialId}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={live(c) ? 'signal' : 'neutral'}>
                          {credentialStateText(c)}
                        </Badge>
                        {canUnsuspend(c) ? (
                          <button
                            type="button"
                            disabled={busy === c.credentialId}
                            onClick={() =>
                              void act(
                                c.credentialId,
                                'unsuspendOrgCredential',
                                { credentialId: c.credentialId },
                                'Suspension lifted.',
                              )
                            }
                            className={buttonClasses('ghost', 'md')}
                          >
                            Lift the suspension of the delegation from {issuer}
                          </button>
                        ) : (
                          live(c) && (
                            <button
                              type="button"
                              disabled={busy === c.credentialId}
                              onClick={() =>
                                void act(
                                  c.credentialId,
                                  'suspendOrgCredentials',
                                  { credentialIds: [c.credentialId] },
                                  'Delegation suspended.',
                                )
                              }
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
              {list.some(canUnsuspend) && (
                <p className="text-ink-muted mt-3 max-w-[70ch] text-xs leading-5">
                  When a member left or was removed, all their delegations were suspended together.
                  Lifting one of those suspensions keeps the member’s other delegations suspended,
                  each on its own.
                </p>
              )}
              {issuers.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {issuers.map((address) => (
                    <ConfirmButton
                      key={address}
                      label={`Suspend every delegation from ${shortAddress(address)}`}
                      confirm={`Yes, suspend every delegation from ${shortAddress(address)}`}
                      busy={busy === address}
                      onConfirm={() =>
                        void act(
                          address,
                          'suspendOrgCredentials',
                          { memberAddress: address },
                          `Every delegation from ${shortAddress(address)} is suspended.`,
                        )
                      }
                    />
                  ))}
                </div>
              )}
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
  const load = useCallback(
    () => withBearer(getBearer, (bearer) => orgWorkloads(org.id, bearer)),
    [org.id, getBearer],
  )
  const workloads = useRemote(`workloads:${org.id}`, load)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(w: OrgWorkload) {
    setBusy(w.did)
    const done = await ctx.run<OrgWorkload>(
      'setOrgWorkloadDisabled',
      { orgId: org.id, did: w.did, disabled: !w.disabled },
      w.disabled
        ? `${w.repository} can get tokens again.`
        : `${w.repository} gets no tokens until enabled.`,
      { recheck: workloads.reload },
    )
    setBusy(null)
    if (done) workloads.reload()
  }

  return (
    <Panel
      id="workloads-title"
      title="Service accounts"
      description="Deploy pipelines registered for the organisation’s apps. A disabled one gets no tokens."
    >
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
                      {w.repository}{' '}
                      <span className="text-ink-muted font-normal">({w.productionBranch})</span>
                    </p>
                    <p className="text-ink-muted font-mono text-xs break-all">{w.did}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {w.disabled && <Badge>Disabled</Badge>}
                    <button
                      type="button"
                      disabled={busy === w.did}
                      onClick={() => void toggle(w)}
                      className={buttonClasses('ghost', 'md')}
                    >
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
