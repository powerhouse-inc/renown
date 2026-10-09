import type { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Hex } from 'viem'
import { useEnsAvatar, useEnsName } from 'wagmi'
import { AvatarUploader } from '../../components/profile-edit/avatar-uploader'
import { Field, inputClass } from '../../components/profile-edit/field'
import { HandleField } from '../../components/profile-edit/handle-field'
import { LinksEditor } from '../../components/profile-edit/links-editor'
import { ProfileSummary } from '../../components/profile/profile-summary'
import PageBackground from '../../components/ui/page-background'
import RenownCard from '../../components/ui/renown-card'
import { useProfileEditorAuth } from '../../hooks/use-profile-editor-auth'
import { profileMessage } from '../../services/renown-signed-messages'
import { getProfile, type RenownProfile } from '../../services/switchboard'
import {
  changedFields,
  formFromProfile,
  formProblems,
  handleFromEns,
  hasChanges,
  LIMITS,
  type FormField,
  type FormProblems,
  type ProfileForm,
} from '../../utils/profile-form'
import { profilePath } from '../../utils/profile-url'

type Toast = { kind: 'success' | 'error'; text: string } | null

const glass =
  'rounded-2xl border border-gray-200 bg-white/80 shadow-2xl backdrop-blur-lg dark:border-white/20 dark:bg-white/10'

function Editor({ address, profileId, signMessage, getBearer }: {
  address: Hex
  profileId: string | null
  signMessage: (message: string) => Promise<Hex>
  getBearer: () => Promise<string>
}) {
  const [loaded, setLoaded] = useState<RenownProfile | null | undefined>(undefined)
  const [initial, setInitial] = useState<ProfileForm>(formFromProfile(null))
  const [form, setForm] = useState<ProfileForm>(formFromProfile(null))
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverErrors, setServerErrors] = useState<FormProblems>({})
  const [toast, setToast] = useState<Toast>(null)
  const { data: ensName } = useEnsName({ address, chainId: 1 })
  const { data: ensAvatar } = useEnsAvatar({ name: ensName ?? undefined, chainId: 1 })

  useEffect(() => {
    let cancelled = false
    void getProfile({ driveId: `renown-${address.toLowerCase()}`, ethAddress: address.toLowerCase() }).then((profile) => {
      if (cancelled) return
      const start = formFromProfile(profile)
      setLoaded(profile)
      setInitial(start)
      setForm(start)
    })
    return () => {
      cancelled = true
    }
  }, [address])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const ensHandle = useMemo(() => handleFromEns(ensName), [ensName])
  const fields = changedFields(initial, form)
  const problems = { ...formProblems(form), ...serverErrors }
  const documentId = loaded?.documentId ?? profileId

  function set<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in serverErrors) setServerErrors((e) => ({ ...e, [key as FormField]: undefined }))
  }

  async function save() {
    if (!hasChanges(fields) || Object.values(formProblems(form)).some(Boolean)) return
    setSaving(true)
    setServerErrors({})
    try {
      const timestamp = new Date().toISOString()
      let signature: Hex
      try {
        signature = await signMessage(await profileMessage(address, fields, timestamp))
      } catch {
        setToast({ kind: 'error', text: 'Signature declined — nothing was saved.' })
        return
      }
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, ...fields, signature, timestamp }),
      })
      const body = (await response.json().catch(() => ({}))) as { documentId?: string; error?: string; field?: FormField }
      if (!response.ok) {
        if (body.field) setServerErrors({ [body.field]: body.error ?? 'Invalid value' })
        setToast({ kind: 'error', text: body.error ?? `Saving failed (${response.status}).` })
        return
      }
      setInitial(form)
      setLoaded((p) => ({ ...(p ?? { documentId: body.documentId ?? '' }), documentId: body.documentId ?? p?.documentId ?? '' }))
      setToast({ kind: 'success', text: 'Profile saved.' })
    } finally {
      setSaving(false)
    }
  }

  if (loaded === undefined) {
    return <p className="text-muted-foreground py-24 text-center">Loading your profile…</p>
  }

  const handle = form.handle.trim().toLowerCase()
  const viewHref = documentId ? profilePath({ handle: initial.handle || null, documentId }) : null

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <form
        className={`${glass} space-y-6 p-6 sm:p-8`}
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        noValidate
      >
        <div>
          <h1 className="text-foreground text-2xl font-bold">Edit profile</h1>
          <p className="text-muted-foreground text-sm">One signature saves everything below.</p>
        </div>

        <div className="space-y-1.5">
          <span className="text-foreground block text-sm font-semibold">Avatar</span>
          <AvatarUploader
            hasAvatar={!!form.avatar}
            ensAvatar={ensAvatar}
            getBearer={getBearer}
            onBusyChange={setUploading}
            onUploaded={(ref, url) => {
              set('avatar', ref)
              setPreviewUrl(url)
            }}
            onClear={() => {
              set('avatar', null)
              setPreviewUrl(null)
            }}
            onUseEnsAvatar={(url) => {
              set('avatar', null)
              set('userImage', url)
              setPreviewUrl(null)
            }}
            error={serverErrors.avatar}
          />
        </div>

        <Field
          id="displayName"
          label="Display name"
          error={problems.displayName}
          counter={`${form.displayName.trim().length}/${LIMITS.displayName}`}
          hint={ensName ? (
            <button type="button" className="text-accent underline underline-offset-2" onClick={() => set('displayName', ensName)}>
              Use ENS name ({ensName})
            </button>
          ) : 'How your name appears on Renown.'}
        >
          <input
            id="displayName"
            className={inputClass}
            value={form.displayName}
            maxLength={LIMITS.displayName + 10}
            onChange={(e) => set('displayName', e.target.value)}
            aria-invalid={!!problems.displayName}
            placeholder={loaded?.username ?? 'Your name'}
          />
        </Field>

        <HandleField
          value={form.handle}
          onChange={(value) => set('handle', value)}
          address={address}
          current={initial.handle}
          serverError={serverErrors.handle}
          ensSuggestion={!initial.handle ? ensHandle : null}
        />

        <Field id="bio" label="Bio" error={problems.bio} counter={`${form.bio.trim().length}/${LIMITS.bio}`}>
          <textarea
            id="bio"
            className={`${inputClass} min-h-24 resize-y`}
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            aria-invalid={!!problems.bio}
            placeholder="A few words about you"
          />
        </Field>

        <LinksEditor links={form.links} onChange={(links) => set('links', links)} error={problems.links} />

        <div className="border-border flex flex-wrap items-center justify-end gap-3 border-t pt-6">
          {viewHref && (
            <Link href={viewHref} className="text-muted-foreground hover:text-foreground mr-auto text-sm underline underline-offset-4">
              View profile
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setForm(initial)
              setPreviewUrl(null)
              setServerErrors({})
            }}
            disabled={!hasChanges(fields) || saving}
            className="text-foreground hover:bg-foreground/10 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={!hasChanges(fields) || saving || uploading || Object.values(formProblems(form)).some(Boolean)}
            className="bg-primary text-primary-foreground hover:bg-primary/80 rounded-lg px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>

      <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Preview">
        <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Preview</p>
        <RenownCard>
          <div className="p-6">
            <ProfileSummary
              profile={{
                documentId,
                address,
                displayName: form.displayName.trim() || null,
                username: loaded?.username,
                handle: handle || null,
                bio: form.bio.trim() || null,
                links: form.links,
                hasAvatar: !!form.avatar,
                userImage: form.userImage,
                previewUrl,
              }}
            />
          </div>
        </RenownCard>
      </aside>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-3 text-sm font-semibold shadow-modal ${
            toast.kind === 'success' ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'
          }`}
        >
          {toast.text}
          {toast.kind === 'success' && viewHref && (
            <Link href={profilePath({ handle: handle || null, documentId: documentId ?? '' })} className="ml-3 underline underline-offset-2">
              View
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

const EditProfilePage: NextPage = () => {
  const auth = useProfileEditorAuth()
  return (
    <PageBackground>
      <Head>
        <title>Edit profile - Renown</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="relative mx-auto min-h-screen w-full max-w-5xl px-4 pt-24 pb-16">
        {auth.status === 'loading' && <p className="text-muted-foreground py-24 text-center">Loading…</p>}
        {auth.status === 'signed-out' && (
          <div className={`${glass} mx-auto max-w-md space-y-4 p-8 text-center`}>
            <h1 className="text-foreground text-2xl font-bold">Edit your profile</h1>
            <p className="text-muted-foreground text-sm">Sign in with your wallet to edit your Renown profile.</p>
            <button
              type="button"
              onClick={auth.login}
              className="bg-primary text-primary-foreground hover:bg-primary/80 rounded-lg px-5 py-2 text-sm font-semibold transition-colors"
            >
              Sign in
            </button>
          </div>
        )}
        {auth.status === 'ready' && (
          <Editor address={auth.address} profileId={auth.profileId} signMessage={auth.signMessage} getBearer={auth.getBearer} />
        )}
      </div>
    </PageBackground>
  )
}

export default EditProfilePage
