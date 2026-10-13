// The manage pages' body, inside the wallet shell: the session, the
// organisation as the viewer sees it, the section nav and the section.
import Link from 'next/link'
import { useCallback, useEffect, type ReactNode } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { writeActiveOrg } from '../../lib/orgs/active-org'
import { UNCONFIRMED_WRITE_TEXT } from '../../lib/orgs/errors'
import { orgPath, roleLabel } from '../../lib/orgs/format'
import { orgRef } from '../../lib/orgs/handles'
import { manageSection, minRoleText, sectionsFor } from '../../lib/orgs/manage-sections'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import type { OrgMutationName } from '../../services/org-mutations'
import { roleAtLeast } from '../../services/org-signed-messages'
import { fetchOrganization, withBearer, type Organization, type OrgRole } from '../../services/orgs'
import { useMeSession, type MeSession } from '../me/use-me-session'
import { OrgAvatar } from '../org/org-avatar'
import { SignInPanel } from '../org/sign-in-panel'
import { Badge, buttonClasses } from '../site/primitives'
import { ToastRegion, useToasts } from '../site/toast'
import type { ManageContext, RunOptions } from './manage-context'
import { ManageLoading } from './manage-loading'
import { ManageNav } from './manage-nav'
import { SECTION_COMPONENTS } from './section-components'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

/** A lost answer after the page re-read what the write would have changed. */
const UNCONFIRMED_RECHECKED_TEXT =
  "We couldn't confirm whether that went through. The page was checked again; look before you retry."

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
    return (
      <SignInPanel
        title="Manage an organisation"
        text="Sign in with the wallet that belongs to this organisation."
        login={session.login}
      />
    )
  }
  return (
    <ManageOrg key={session.address} session={session} reference={reference} section={section} />
  )
}

function ManageOrg({
  session,
  reference,
  section,
}: {
  session: SignedIn
  reference: string
  section: string
}) {
  const { toasts, show, dismiss } = useToasts()
  const { getBearer } = session
  const load = useCallback(
    () => withBearer(getBearer, (bearer) => fetchOrganization(orgRef(reference), bearer)),
    [reference, getBearer],
  )
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
        <button
          type="button"
          onClick={remote.reload}
          className={buttonClasses('primary', 'md', 'mt-6')}
        >
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
  // The two notices below keep the toasts: a write refused mid-session lands here.
  // Every write to an archived or taken-down organisation is refused, and a
  // taken-down one has no viewerMembership: say so before the membership check.
  if (org.takenDown || org.archived) {
    return (
      <>
        <Notice title={org.name}>
          <p role="status">
            {org.takenDown
              ? 'This organisation was taken down; nothing can be changed.'
              : 'This organisation is archived; nothing can be changed.'}
          </p>
          <Link href="/me" className={buttonClasses('secondary', 'md', 'mt-6')}>
            Go to Your Renown
          </Link>
        </Notice>
        <ToastRegion toasts={toasts} onDismiss={dismiss} />
      </>
    )
  }
  const membership = org.viewerMembership
  if (!membership) {
    return (
      <>
        <Notice title={`You are not a member of ${org.name}`}>
          <p>
            Only members can open these pages. If you were invited, accept the invite on Your Renown
            first.
          </p>
          <Link href={orgPath(org.handle)} className={buttonClasses('secondary', 'md', 'mt-6')}>
            View its public page
          </Link>
        </Notice>
        <ToastRegion toasts={toasts} onDismiss={dismiss} />
      </>
    )
  }

  const reloadOrg = remote.reload
  const writer = orgWriter(sessionSigner(session))
  async function run<T>(
    name: OrgMutationName,
    args: Record<string, unknown>,
    success: string,
    options: RunOptions = {},
  ): Promise<T | null> {
    const result = await writer.write<T>(name, args)
    if (result.ok) {
      show('success', success)
      return result.data
    }
    if (result.unconfirmed) {
      // The answer was lost, not the request: it may have been applied. Re-read
      // before anyone retries (writes are not idempotent).
      // Say "checked again" only when a re-read actually ran.
      if (options.recheck) {
        options.recheck()
        show('error', UNCONFIRMED_RECHECKED_TEXT)
      } else {
        show('error', UNCONFIRMED_WRITE_TEXT)
      }
      return null
    }
    show('error', options.errorText?.[result.code] ?? result.message)
    if (result.reason === 'replayed') {
      // The signed request was already applied once: re-read what it changed.
      options.recheck?.()
    } else if (result.code === 'FORBIDDEN') {
      // Refused for the viewer (role changed, removed) or the organisation
      // (archived, taken down) meanwhile: re-read it so the header, the nav and
      // the controls match what the switchboard allows now.
      reloadOrg()
    }
    return null
  }
  const ctx: ManageContext = {
    org,
    role: membership.role,
    address: session.address.toLowerCase(),
    getBearer,
    run,
    reloadOrg,
    orgReading: remote.pending,
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
              {meta
                ? `Only ${minRoleText(meta.minRole)} can open ${meta.label}.`
                : 'This section does not exist.'}
            </p>
          )}
        </div>
      </div>
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
