import { AuditSection } from './audit-section'
import { OidcSection } from './oidc-section'
import { DomainsSection } from './domains-section'
import { AppsSection } from './apps-section'
import type { ComponentType } from 'react'
import type { ManageSectionProps } from './manage-context'
import { MembersSection } from './members-section'
import { SecuritySection } from './security-section'
import { SettingsSection } from './settings-section'
import { TeamsSection } from './teams-section'
import { WebhooksSection } from './webhooks-section'

/** Each section key of lib/orgs/manage-sections.ts with its component. */
export const SECTION_COMPONENTS: Record<string, ComponentType<ManageSectionProps>> = {
  members: MembersSection,
  apps: AppsSection,
  teams: TeamsSection,
  security: SecuritySection,
  domains: DomainsSection,
  webhooks: WebhooksSection,
  oidc: OidcSection,
  audit: AuditSection,
  settings: SettingsSection,
}
