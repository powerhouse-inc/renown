// The organisation profile form in Settings. updateOrganization patches: an
// absent field is kept, '' clears bio, website or avatar, links replaces the
// list. Only changed fields are sent (and signed). Pure.
import type { Organization, OrgLink } from '../../services/orgs'
import { isHttpUrl, ORG_LIMITS } from './create-form'

export interface OrgSettingsForm {
  name: string
  bio: string
  website: string
  avatar: string | null
  links: OrgLink[]
}

export type SettingsField = 'name' | 'bio' | 'website' | 'links'

const MAX_LINKS = 8
const MAX_LINK_LABEL = 40

export function settingsFormFrom(org: Pick<Organization, 'name' | 'bio' | 'website' | 'avatar' | 'links'>): OrgSettingsForm {
  return { name: org.name, bio: org.bio ?? '', website: org.website ?? '', avatar: org.avatar, links: org.links.map(({ id, label, url }) => ({ id, label, url })) }
}

export function settingsProblems(form: OrgSettingsForm): Partial<Record<SettingsField, string>> {
  const problems: Partial<Record<SettingsField, string>> = {}
  const name = form.name.trim()
  if (!name) problems.name = 'Give the organisation a name.'
  else if (name.length > ORG_LIMITS.name) problems.name = `Use at most ${ORG_LIMITS.name} characters.`
  if (form.bio.trim().length > ORG_LIMITS.bio) problems.bio = `Use at most ${ORG_LIMITS.bio} characters.`
  const website = form.website.trim()
  if (website && !isHttpUrl(website)) problems.website = 'Use a full address starting with https://.'
  if (form.links.length > MAX_LINKS) problems.links = `Use at most ${MAX_LINKS} links.`
  else if (form.links.some((link) => !link.label.trim() || link.label.trim().length > MAX_LINK_LABEL || !isHttpUrl(link.url.trim()))) {
    problems.links = 'Every link needs a label of up to 40 characters and a full https:// address.'
  }
  return problems
}

function cleanLinks(links: OrgLink[]): OrgLink[] {
  return links.map(({ id, label, url }) => ({ id, label: label.trim(), url: url.trim() }))
}

export function settingsPatch(initial: OrgSettingsForm, current: OrgSettingsForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const name = current.name.trim()
  if (name !== initial.name.trim()) patch.name = name
  const bio = current.bio.trim()
  if (bio !== initial.bio.trim()) patch.bio = bio
  const website = current.website.trim()
  if (website !== initial.website.trim()) patch.website = website
  if ((current.avatar ?? '') !== (initial.avatar ?? '')) patch.avatar = current.avatar ?? ''
  const links = cleanLinks(current.links)
  if (JSON.stringify(links) !== JSON.stringify(cleanLinks(initial.links))) patch.links = links
  return patch
}
