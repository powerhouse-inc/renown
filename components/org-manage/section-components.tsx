import type { ComponentType } from 'react'
import type { ManageSectionProps } from './manage-context'
import { MembersSection } from './members-section'
import { SettingsSection } from './settings-section'
import { TeamsSection } from './teams-section'

/** Each section key of lib/orgs/manage-sections.ts with its component. */
export const SECTION_COMPONENTS: Record<string, ComponentType<ManageSectionProps>> = {
  members: MembersSection,
  teams: TeamsSection,
  settings: SettingsSection,
}
