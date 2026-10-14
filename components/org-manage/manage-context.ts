import type { OrgFailureCode } from '../../lib/orgs/errors'
import type { OrgMutationName } from '../../services/org-mutations'
import type { Organization, OrgRole } from '../../services/orgs'

/** How one write reports a failure. */
export interface RunOptions {
  /**
   * Re-reads what the write would have changed. Called when the answer was lost
   * (the write may have gone through): writes are not idempotent, so the
   * section shows the re-read state before anyone retries.
   */
  recheck?: () => void
  /** Section-specific texts for some failure codes (e.g. a RATE_LIMITED limit). FORBIDDEN applies only to a denial, not to a replayed or read-only refusal. */
  errorText?: Partial<Record<OrgFailureCode, string>>
}

/** What every manage section gets from the shell. */
export interface ManageContext {
  /** The organisation as the viewer sees it (teams and apps included). */
  org: Organization
  /** The viewer's role. */
  role: OrgRole
  /** The viewer's address, lowercase. */
  address: string
  /** The session's Renown bearer; reads go through withBearer(getBearer, read). */
  getBearer: (options?: { fresh?: boolean }) => Promise<string | null>
  /** Signs and sends a write, then shows a toast with `success` or the failure. Resolves with the result, or null when it failed. */
  run: <T>(
    name: OrgMutationName,
    args: Record<string, unknown>,
    success: string,
    options?: RunOptions,
  ) => Promise<T | null>
  /** Re-reads the organisation (its teams, apps, settings and the viewer's role). */
  reloadOrg: () => void
  /** True while the organisation is being (re-)read: creating waits for it, so a lost answer is checked before a retry. */
  orgReading: boolean
  notify: (tone: 'success' | 'error', text: string) => void
}

export interface ManageSectionProps {
  ctx: ManageContext
}
