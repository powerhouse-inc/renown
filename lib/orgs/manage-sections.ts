// The manage sections, their order and who may open them. The components live
// in components/org-manage/section-components.tsx (loaded with the wallet
// shell); this list is all the page route needs. Pure.
import { roleAtLeast, type OrgRole } from '../../services/org-signed-messages'

export interface ManageSectionMeta {
  key: string
  label: string
  minRole: OrgRole
}

export const MANAGE_SECTIONS: ManageSectionMeta[] = [
  { key: 'members', label: 'Members', minRole: 'MEMBER' },
  { key: 'teams', label: 'Teams', minRole: 'MEMBER' },
  { key: 'apps', label: 'Apps', minRole: 'MEMBER' },
  { key: 'settings', label: 'Settings', minRole: 'ADMIN' },
]

export function manageSection(key: string): ManageSectionMeta | null {
  return MANAGE_SECTIONS.find((section) => section.key === key) ?? null
}

export function sectionsFor(role: OrgRole): ManageSectionMeta[] {
  return MANAGE_SECTIONS.filter((section) => roleAtLeast(role, section.minRole))
}

/** "admins and owners", for "Only … can open Settings." */
export function minRoleText(role: OrgRole): string {
  if (role === 'OWNER') return 'owners'
  if (role === 'ADMIN') return 'admins and owners'
  if (role === 'PUBLISHER') return 'publishers, admins and owners'
  return 'members'
}
