import type { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Hex } from 'viem'
import { useEnsAvatar, useEnsName } from 'wagmi'
import { AvatarUploader } from '../../components/profile-edit/avatar-uploader'
import { Field, inputClass } from '../../components/profile-edit/field'
import { HandleField } from '../../components/profile-edit/handle-field'
import { LinksEditor } from '../../components/profile-edit/links-editor'
import { ProfileSummary } from '../../components/profile/profile-summary'
import { SiteLayout } from '../../components/site/site-layout'
import RenownCard from '../../components/ui/renown-card'
import { useProfileEditorAuth } from '../../hooks/use-profile-editor-auth'
import { profileMessage } from '../../services/renown-signed-messages'
import { fetchProfile, type RenownProfile } from '../../services/switchboard'
import {
  changedFields,
  formFromProfile,
  formProblems,
  handleFromEns,
  hasChanges,
  LIMITS,
  normalizeHandle,
  type FormField,
  type FormProblems,
  type ProfileForm,
} from '../../utils/profile-form'
import { profilePath } from '../../utils/profile-url'

type Toast = { kind: 'success' | 'error'; text: string } | null

/** The form as it is stored after a save: everything trimmed, handle lowercased. */
function normalizedForm(form: ProfileForm): ProfileForm {
  return {
    ...form,
    displayName: form.displayName.trim(),
    handle: normalizeHandle(form.handle),
    bio: form.bio.trim(),
    links: form.links.map((l) => ({ id: l.id, label: l.label.trim(), url: l.url.trim() })),
  }
}

const glass =
  'rounded-2xl border border-gray-200 bg-white/80 shadow-2xl backdrop-blur-lg dark:border-white/20 dark:bg-white/10'

function Editor({ address, profileId, signMessage, getBearer }: {
  address: Hex
  profileId: string | null
  signMessage: (message: string) => Promise<Hex>
  getBearer: () => Promise<string>
}) {
  const router = useRouter()
  const [loaded, setLoaded] = useState<RenownProfile | null | undefined>(undefined)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [handleBlocked, setHandleBlocked] = useState(false)
  const previewRef = useRef<string | null>(null)
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
    // A failed read must never look like an empty profile: saving would send an
    // empty links list over the real one.
    fetchProfile({ driveId: `renown-${address.toLowerCase()}`, ethAddress: address.toLowerCase() })
      .then((profile) => {
        if (cancelled) return
        const start = formFromProfile(profile)
        setLoaded(profile)
        setInitial(start)
        setForm(start)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [address, attempt])

  // Object URLs for previews are released when replaced and on unmount.
  const setPreview = useCallback((url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = url
    setPreviewUrl(url)
  }, [])
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const ensHandle = useMemo(() => handleFromEns(ensName), [ensName])
  const fields = changedFields(initial, form)
  const problems: FormProblems = { ...formProblems(form) }
  for (const [key, message] of Object.entries(serverErrors)) {
    if (message) problems[key as FormField] = message
  }
  const dirty = hasChanges(fields)
  const guardActive = dirty && !saving
  const documentId = loaded?.documentId ?? profileId

  function set<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in serverErrors) {
      setServerErrors((e) => {
        const next = { ...e }
        delete next[key as FormField]
        return next
      })
    }
  }

  async function save() {
    if (!hasChanges(fields) || handleBlocked || Object.values(formProblems(form)).some(Boolean)) return
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
      const stored = normalizedForm(form)
      setInitial(stored)
      setForm(stored)
      setLoaded((p) => ({ ...(p ?? { documentId: body.documentId ?? '' }), documentId: body.documentId ?? p?.documentId ?? '' }))
      setToast({ kind: 'success', text: 'Profile saved.' })
    } finally {
      setSaving(false)
    }
  }

  // Unsaved changes: warn on tab close and on in-app navigation.
  useEffect(() => {
    if (!guardActive) return
    const message = 'You have unsaved changes. Leave without saving?'
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = message
    }
    const onRouteChange = () => {
      if (!window.confirm(message)) {
        router.events.emit('routeChangeError')
        throw 'Route change aborted: unsaved profile changes'
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    router.events.on('routeChangeStart', onRouteChange)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      router.events.off('routeChangeStart', onRouteChange)
    }
  }, [guardActive, router])

  if (loadError) {
    return (
      <div className={`${glass} mx-auto max-w-md space-y-4 p-8 text-center`} role="alert">
        <h1 className="text-foreground text-2xl font-bold">Couldn&apos;t load your profile</h1>
        <p className="text-muted-foreground text-sm">
          Nothing was changed. Editing is paused so an unloaded profile is never overwritten.
        </p>
        <button
          type="button"
          onClick={() => {
            setLoadError(false)
            setAttempt((n) => n + 1)
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/80 rounded-lg px-5 py-2 text-sm font-semibold transition-colors"
        >
          Retry
        </button>
      </div>
    )
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
              setPreview(url)
            }}
            onClear={() => {
              set('avatar', null)
              setPreview(null)
            }}
            onUseEnsAvatar={(url) => {
              set('avatar', null)
              set('userImage', url)
              setPreview(null)
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
          onBlockedChange={setHandleBlocked}
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

        <div className="border-border flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {viewHref && (
            <Link href={viewHref} className="text-muted-foreground hover:text-foreground text-center text-sm underline underline-offset-4 sm:mr-auto">
              View profile
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setForm(initial)
              setPreview(null)
              setServerErrors({})
            }}
            disabled={!hasChanges(fields) || saving}
            className="text-foreground hover:bg-foreground/10 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={!dirty || saving || uploading || handleBlocked || Object.values(problems).some(Boolean)}
            className="bg-primary text-primary-foreground hover:bg-primary/80 w-full rounded-lg px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-40 sm:w-auto"
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
                avatar: form.avatar,
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
    <SiteLayout>
      <Head>
        <title>Edit profile - Renown</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="relative mx-auto w-full max-w-5xl px-4 pt-12 pb-20 md:pt-16">
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
    </SiteLayout>
  )
}

export default EditProfilePage
