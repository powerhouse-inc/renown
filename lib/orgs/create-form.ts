// The create-organisation form: what it checks before signing and the exact
// arguments it signs. The switchboard checks everything again. Pure.
import { normalizeOrgHandle, orgHandleProblem } from './handles'

export const ORG_LIMITS = { name: 64, bio: 280, url: 2048 } as const

export interface CreateOrgForm {
  name: string
  handle: string
  bio: string
  website: string
  listed: boolean
  membersPublic: boolean
}

export type CreateOrgField = 'name' | 'handle' | 'bio' | 'website'

export const EMPTY_CREATE_FORM: CreateOrgForm = { name: '', handle: '', bio: '', website: '', listed: false, membersPublic: false }

export function isHttpUrl(value: string): boolean {
  if (value.length > ORG_LIMITS.url) return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export function isCreateOrgField(value: string): value is CreateOrgField {
  return value === 'name' || value === 'handle' || value === 'bio' || value === 'website'
}

export function createOrgProblems(form: CreateOrgForm): Partial<Record<CreateOrgField, string>> {
  const problems: Partial<Record<CreateOrgField, string>> = {}
  const name = form.name.trim()
  if (!name) problems.name = 'Give the organisation a name.'
  else if (name.length > ORG_LIMITS.name) problems.name = `Use at most ${ORG_LIMITS.name} characters.`
  const handle = orgHandleProblem(normalizeOrgHandle(form.handle))
  if (handle) problems.handle = handle
  if (form.bio.trim().length > ORG_LIMITS.bio) problems.bio = `Use at most ${ORG_LIMITS.bio} characters.`
  const website = form.website.trim()
  if (website && !isHttpUrl(website)) problems.website = 'Use a full address starting with https://.'
  return problems
}

/** The createOrganization arguments: trimmed, handle normalised, blank optional fields left out (not sent, not signed). */
export function createOrgArgs(form: CreateOrgForm): Record<string, unknown> {
  const bio = form.bio.trim()
  const website = form.website.trim()
  return {
    handle: normalizeOrgHandle(form.handle),
    name: form.name.trim(),
    ...(bio && { bio }),
    ...(website && { website }),
    listed: form.listed,
    membersPublic: form.membersPublic,
  }
}
