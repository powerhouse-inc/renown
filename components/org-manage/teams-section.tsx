import { useCallback, useState, type FormEvent } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { memberLabel, plural } from '../../lib/orgs/format'
import { MAX_TEAMS, sameSet, slugFromName, teamPatch, teamProblems } from '../../lib/orgs/teams'
import { roleAtLeast } from '../../services/org-signed-messages'
import { organizationMembers, withBearer, type OrgMember, type OrgTeam } from '../../services/orgs'
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
    // A lost answer may still have created the team: re-read the organisation before another create.
    const done = await ctx.run<OrgTeam>('createOrgTeam', { orgId: ctx.org.id, slug, name: name.trim() }, `${name.trim()} was created.`, { recheck: ctx.reloadOrg })
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
        <button type="submit" disabled={busy || full || ctx.orgReading} className={buttonClasses('primary', 'md', 'justify-self-start sm:col-span-2')}>
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
      ok = (await ctx.run<OrgTeam>('updateOrgTeam', { orgId: ctx.org.id, teamId: team.id, ...patch }, `${name.trim()} was saved.`, { recheck: ctx.reloadOrg })) !== null
    }
    if (ok && membersChanged) {
      ok = (await ctx.run<OrgTeam>('setOrgTeamMembers', { orgId: ctx.org.id, teamId: team.id, addresses: people }, `Members of ${name.trim()} were saved.`, { recheck: ctx.reloadOrg })) !== null
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
  const loadMembers = useCallback(async () => withBearer(getBearer, (bearer) => organizationMembers(org.id, false, bearer)), [org.id, getBearer])
  const members = useRemote(admin ? `team-members:${org.id}` : null, loadMembers)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function remove(team: OrgTeam) {
    setBusy(team.id)
    const done = await ctx.run<boolean>('deleteOrgTeam', { orgId: org.id, teamId: team.id }, `${team.name} was deleted.`, { recheck: ctx.reloadOrg })
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
