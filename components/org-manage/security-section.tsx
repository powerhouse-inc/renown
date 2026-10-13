import Link from 'next/link'
import { useCallback } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { manageHref, shortDid } from '../../lib/orgs/format'
import { listAppProfiles } from '../../services/app-profiles'
import { organizationMembers, withBearer } from '../../services/orgs'
import { DelegationsPanel, WorkloadsPanel } from './delegations-panel'
import type { ManageSectionProps } from './manage-context'
import { Panel } from './manage-ui'
import { OwnersPanel, ProposalsPanel, useOrgProposals } from './proposals-panel'

export function SecuritySection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const loadMembers = useCallback(
    () => withBearer(getBearer, (bearer) => organizationMembers(org.id, false, bearer)),
    [org.id, getBearer],
  )
  const members = useRemote(`security-members:${org.id}`, loadMembers)
  const proposals = useOrgProposals(ctx)
  const loadNames = useCallback(
    () =>
      org.apps.length > 0
        ? listAppProfiles({ limit: 50, orgId: org.id }).then((page) => page.items)
        : Promise.resolve([]),
    [org.id, org.apps.length],
  )
  const profiles = useRemote(`security-apps:${org.id}`, loadNames)
  const names = new Map(
    profiles.state.status === 'ready'
      ? profiles.state.value.map((p) => [p.appDid, p.name?.trim() ?? ''] as const)
      : [],
  )
  const appName = (did: string) => names.get(did) || shortDid(did)

  return (
    <div className="mt-6 space-y-8">
      {org.securityWarnings.includes('SINGLE_OWNER') && (
        <p
          role="note"
          className="border-caution-ink/35 bg-caution-ink/[0.07] text-ink rounded-card border px-4 py-3 text-sm leading-6"
        >
          Only one owner. If that wallet is lost, the organisation can only be recovered through a
          domain verified for it, after a waiting period. Propose a second owner below.
        </p>
      )}
      <OwnersPanel
        ctx={ctx}
        members={members}
        proposals={proposals}
        onProposed={proposals.reload}
      />
      <ProposalsPanel ctx={ctx} proposals={proposals} members={members} appName={appName} />
      <DelegationsPanel ctx={ctx} appName={appName} />
      <WorkloadsPanel ctx={ctx} />
      <Panel id="recovery-title" title="Recovery">
        <p className="text-ink-muted max-w-[70ch] text-sm leading-6">
          If every owner loses access, whoever controls a domain verified for the organisation for
          at least 14 days can publish a recovery record naming a new owner and start a recovery.
          Every owner is notified, and it shows under Proposals with a countdown: it runs when the
          waiting period ends unless an owner cancels it there. Verify a domain under{' '}
          <Link
            href={manageHref(org.handle, 'domains')}
            className="text-primary-ink font-semibold underline-offset-4 hover:underline"
          >
            Domains
          </Link>{' '}
          to make recovery possible.
        </p>
      </Panel>
    </div>
  )
}
