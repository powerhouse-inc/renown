// The profile editor's form model: what the user edits, how it is checked
// before signing, and the patch that is signed (only what changed).
import type { ProfileFields, ProfileLink } from '../services/renown-signed-messages'
import type { RenownProfile } from '../services/switchboard'

export const LIMITS = { displayName: 64, bio: 280, links: 8, linkLabel: 40, linkUrl: 2048 } as const
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/

export interface ProfileForm {
  displayName: string
  handle: string
  bio: string
  links: ProfileLink[]
  /** attachment://v1 ref of the uploaded avatar, or null for none. */
  avatar: string | null
  /** External image URL (ENS avatar); shown when there is no upload. */
  userImage: string | null
}

export type FormField = 'displayName' | 'handle' | 'bio' | 'links' | 'avatar'
export type FormProblems = Partial<Record<FormField, string>>

export function formFromProfile(profile: RenownProfile | null): ProfileForm {
  return {
    displayName: profile?.displayName ?? '',
    handle: profile?.handle ?? '',
    bio: profile?.bio ?? '',
    links: (profile?.links ?? []).map(({ id, label, url }) => ({ id, label, url })),
    avatar: profile?.avatar ?? null,
    userImage: profile?.userImage ?? null,
  }
}

/** Lowercased, trimmed: the form a handle is stored and checked in. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase()
}

/** A handle suggestion from an ENS name: "Frank.eth" → "frank", or null when it can't be a handle. */
export function handleFromEns(ensName: string | null | undefined): string | null {
  if (!ensName) return null
  const candidate = normalizeHandle(ensName.replace(/\.eth$/i, '')).replace(/[^a-z0-9-]/g, '-')
  return HANDLE_RE.test(candidate) ? candidate : null
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/** Problems that would make the switchboard refuse the save (same rules, checked first for inline errors). */
export function formProblems(form: ProfileForm): FormProblems {
  const problems: FormProblems = {}
  if (form.displayName.trim().length > LIMITS.displayName) {
    problems.displayName = `At most ${LIMITS.displayName} characters.`
  }
  const handle = normalizeHandle(form.handle)
  if (handle && !HANDLE_RE.test(handle)) {
    problems.handle = '3–30 lowercase letters, digits or hyphens; no hyphen at the start or end.'
  }
  if (form.bio.trim().length > LIMITS.bio) problems.bio = `At most ${LIMITS.bio} characters.`
  if (form.links.length > LIMITS.links) problems.links = `At most ${LIMITS.links} links.`
  for (const link of form.links) {
    const label = link.label.trim()
    if (!label || label.length > LIMITS.linkLabel) {
      problems.links = `Every link needs a label of 1–${LIMITS.linkLabel} characters.`
      break
    }
    if (!isHttpUrl(link.url.trim()) || link.url.length > LIMITS.linkUrl) {
      problems.links = 'Links must start with https:// or http://.'
      break
    }
  }
  return problems
}

function sameLinks(a: ProfileLink[], b: ProfileLink[]): boolean {
  return a.length === b.length && a.every((l, i) => l.id === b[i].id && l.label === b[i].label && l.url === b[i].url)
}

/**
 * The signed patch: only fields that differ from what was loaded. Cleared
 * text and a removed avatar become "" (clear); links are sent whole.
 */
export function changedFields(initial: ProfileForm, current: ProfileForm): ProfileFields {
  const out: ProfileFields = {}
  const text = (a: string, b: string) => a.trim() !== b.trim()
  if (text(initial.displayName, current.displayName)) out.displayName = current.displayName.trim()
  if (normalizeHandle(initial.handle) !== normalizeHandle(current.handle)) out.handle = normalizeHandle(current.handle)
  if (text(initial.bio, current.bio)) out.bio = current.bio.trim()
  const links = current.links.map((l) => ({ id: l.id, label: l.label.trim(), url: l.url.trim() }))
  if (!sameLinks(initial.links, links)) out.links = links
  if (initial.avatar !== current.avatar) out.avatar = current.avatar ?? ''
  if (initial.userImage !== current.userImage && current.userImage) out.userImage = current.userImage
  return out
}

export function hasChanges(fields: ProfileFields): boolean {
  return Object.keys(fields).length > 0
}
