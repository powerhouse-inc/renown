// Teams (renown-package A1: slug 1-40 lowercase, name 1-64, at most 50 per org). Pure.
import type { OrgTeam } from '../../services/orgs'

export const TEAM_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/
export const MAX_TEAMS = 50
export const MAX_TEAM_NAME = 64

export function teamProblems({ slug, name }: { slug: string; name: string }): { slug?: string; name?: string } {
  const problems: { slug?: string; name?: string } = {}
  if (!TEAM_SLUG_RE.test(slug)) problems.slug = 'Use 1 to 40 lowercase letters, digits or hyphens, starting and ending with a letter or digit.'
  const trimmed = name.trim()
  if (!trimmed) problems.name = 'Give the team a name.'
  else if (trimmed.length > MAX_TEAM_NAME) problems.name = `Use at most ${MAX_TEAM_NAME} characters.`
  return problems
}

/** A slug suggested from a team name ("Web & Mobile" → "web-mobile"); '' when none fits. */
export function slugFromName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return TEAM_SLUG_RE.test(slug) ? slug : ''
}

export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((value) => set.has(value))
}

/** The updateOrgTeam arguments that changed (slug, trimmed name, app list). */
export function teamPatch(team: OrgTeam, draft: { slug: string; name: string; appDids: string[] }): Record<string, unknown> {
  const name = draft.name.trim()
  return {
    ...(draft.slug !== team.slug && { slug: draft.slug }),
    ...(name !== team.name && { name }),
    ...(!sameSet(draft.appDids, team.appDids) && { appDids: draft.appDids }),
  }
}
