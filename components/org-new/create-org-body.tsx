// /org/new's form. It signs with the wallet session, so pages/org/new.tsx
// loads it inside the wallet shell.
import { useRouter } from 'next/router'
import { useState, type FormEvent } from 'react'
import { createOrgArgs, createOrgProblems, EMPTY_CREATE_FORM, isCreateOrgField, ORG_LIMITS, type CreateOrgField, type CreateOrgForm } from '../../lib/orgs/create-form'
import { manageHref } from '../../lib/orgs/format'
import { handleFromName, normalizeOrgHandle } from '../../lib/orgs/handles'
import { ANALYTICS_EVENTS, useOpenPanelAnalytics } from '../../services/analytics'
import { orgWriter, sessionSigner } from '../../services/org-client-write'
import { fetchOrganization, withBearer, type Organization } from '../../services/orgs'
import { useMeSession, type MeSession } from '../me/use-me-session'
import { OrgBodyLoading } from '../org/org-body-loading'
import { SignInPanel } from '../org/sign-in-panel'
import { SwitchRow } from '../org/switch-row'
import { useOrgHandleAvailability, type HandleState } from '../org/use-org-handle-availability'
import { Field, inputClass } from '../profile-edit/field'
import { buttonClasses } from '../site/primitives'

type SignedIn = Extract<MeSession, { state: 'signed-in' }>

/**
 * After a lost answer (or HANDLE_TAKEN right after one): whether the
 * organisation at `handle` now exists and the viewer owns it. Writes are not
 * idempotent, so this is read before a retry is offered. Throws when Renown
 * does not answer.
 */
async function createdByViewer(session: SignedIn, handle: string): Promise<'mine' | 'taken' | 'absent'> {
  const org = await withBearer(session.getBearer, (bearer) => fetchOrganization({ handle }, bearer))
  if (!org) return 'absent'
  const viewer = org.viewerMembership
  return viewer?.role === 'OWNER' && viewer.status === 'ACTIVE' ? 'mine' : 'taken'
}

const UNCERTAIN = 'Renown did not answer, so it is not known whether the organisation was created. Check again in a moment.'
/** One read found nothing, but a create still in flight can land later: read once more before signing again. */
const NOT_CONFIRMED = 'We couldn’t confirm the organisation was created — check again.'
/** orgHandleAvailability answered INVALID for a handle the local rule accepts. */
const SERVER_INVALID = 'Renown does not accept this handle. Try another.'

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
  /** The handle of a create whose answer was lost: checked before anything is signed again. */
  const [uncertainHandle, setUncertainHandle] = useState<string | null>(null)
  /** Handles whose create lost its answer in this form: a later HANDLE_TAKEN for one may be our own create landing late. */
  const [lostHandles, setLostHandles] = useState<string[]>([])
  const handle = normalizeOrgHandle(form.handle)
  const availability = useOrgHandleAvailability(handle)
  const problems = { ...createOrgProblems(form), ...serverErrors }
  const handleError =
    problems.handle ??
    (availability === 'taken'
      ? 'This handle is taken.'
      : availability === 'reserved'
        ? 'This handle is reserved.'
        : availability === 'invalid'
          ? SERVER_INVALID
          : undefined)
  const handleHint = availability === 'available' ? `renown.id/@${handle} is available.` : HANDLE_HINT[availability]

  function set<K extends keyof CreateOrgForm>(key: K, value: CreateOrgForm[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'name' && !handleEdited && !uncertainHandle) next.handle = handleFromName(String(value))
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

  async function opened(orgHandle: string) {
    track(ANALYTICS_EVENTS.orgCreated)
    await router.push(manageHref(orgHandle))
  }

  /**
   * Reads whether an uncertain create went through; true when the form may sign
   * a new create. `afterWrite`: the read right after the lost answer, where
   * "not found" is not yet trusted (the create may still land), so the form
   * asks for one more check. The handle stays locked while a create is uncertain.
   */
  async function settleUncertain(orgHandle: string, afterWrite: boolean): Promise<boolean> {
    try {
      const outcome = await createdByViewer(session, orgHandle)
      if (outcome === 'mine') {
        setUncertainHandle(null)
        await opened(orgHandle)
        return false
      }
      if (outcome === 'taken') {
        setUncertainHandle(null)
        setServerErrors({ handle: 'This handle is taken.' })
        return false
      }
      if (afterWrite) {
        setUncertainHandle(orgHandle)
        setFailure(NOT_CONFIRMED)
        return false
      }
      setUncertainHandle(null)
      return true
    } catch {
      setUncertainHandle(orgHandle)
      setFailure(UNCERTAIN)
      return false
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setFailure(null)
    const localProblem = Object.values(createOrgProblems(form)).some(Boolean)
    if (uncertainHandle) {
      // Read first: the availability answer may be this viewer's own new organisation.
      setSaving(true)
      if (!(await settleUncertain(uncertainHandle, false)) || localProblem) {
        setSaving(false)
        return
      }
    } else {
      if (localProblem || availability === 'taken' || availability === 'reserved' || availability === 'invalid') return
      setSaving(true)
    }
    const args = createOrgArgs(form)
    const result = await orgWriter(sessionSigner(session)).write<Organization>('createOrganization', args)
    if (result.ok) {
      await opened(result.data.handle)
      return
    }
    if (result.unconfirmed) {
      setLostHandles((list) => [...list, String(args.handle)])
      await settleUncertain(String(args.handle), true)
      setSaving(false)
      return
    }
    if (result.code === 'HANDLE_TAKEN' && lostHandles.includes(String(args.handle))) {
      // Possibly our own earlier create, landed late.
      const absent = await settleUncertain(String(args.handle), false)
      setSaving(false)
      if (absent) setServerErrors({ handle: result.message })
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
          readOnly={uncertainHandle !== null}
          aria-readonly={uncertainHandle !== null}
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
        {saving ? 'Creating…' : uncertainHandle ? 'Check again' : 'Create organisation'}
      </button>
    </form>
  )
}
