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
    const done = await ctx.run<OrgProposal>('proposeOrgChange', { orgId: ctx.org.id, kind: 'CHANGE_HANDLE', payload: { handle } }, 'Handle change proposed. Follow it under Security.', { recheck: ctx.reloadOrg })
    setBusy(false)
    if (done) setText('')
  }

  return (
    <Panel
      id="handle-title"
      title="Handle"
      description={`renown.id/@${ctx.org.handle}. A new handle needs a second owner’s approval when there is one, then waits before it takes effect; Renown runs it shortly if no owner does. The old handle stays reserved for this organisation for 30 days.`}
    >
      <form onSubmit={(event) => void propose(event)} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <Field id="settings-handle" label="New handle" error={problem ?? undefined} hint={availability === 'available' ? `renown.id/@${handle} is available.` : undefined}>
            <input id="settings-handle" className={inputClass} value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="none" spellCheck={false} />
          </Field>
        </div>
        <button type="submit" disabled={busy || ctx.orgReading || !handle || Boolean(problem)} className={buttonClasses('primary', 'md', 'sm:mt-[1.625rem]')}>
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
    const done = await ctx.run<OrgProposal>('proposeOrgChange', { orgId: ctx.org.id, kind: 'DELETE_ORG', payload: {} }, 'Deletion proposed. Follow it under Security.', { recheck: ctx.reloadOrg })
    setBusy(false)
    if (done) setConfirm('')
  }

  return (
    <Panel
      id="delete-title"
      title="Delete the organisation"
      description="Deleting archives it: its page says Archived, every membership ends and the handle stays reserved for 90 days. It needs a second owner’s approval when there is one, then waits before it takes effect; Renown runs it shortly if no owner does."
    >
      {hasApps && <p className="text-caution-ink mb-4 text-sm">It still has apps. Transfer every app away first.</p>}
      <Field id="settings-delete" label={`Type ${ctx.org.handle} to confirm`}>
        <input id="settings-delete" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="none" spellCheck={false} />
      </Field>
      <button type="button" disabled={!ready || busy || ctx.orgReading} onClick={() => void propose()} className={buttonClasses('secondary', 'md', 'border-danger-ink/50 text-danger-ink mt-4')}>
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
