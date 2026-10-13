import Link from 'next/link'
import { AppTile } from '../app/app-tile'
import { IdentityArt } from '../identity/identity-art'
import { LinkChips } from '../identity/link-chip'
import { PageSection } from '../identity/page-section'
import { ShareMenu } from '../identity/share-menu'
import { ProfileAvatar } from '../profile/profile-avatar'
import { PageMeta } from '../site/page-meta'
import { Badge, Container, Heading } from '../site/primitives'
import { SiteLayout } from '../site/site-layout'
import { organizationJsonLd } from '../../lib/json-ld'
import { memberLabel, memberHref, orgPath, plural, roleLabel } from '../../lib/orgs/format'
import type { OrgPageData } from '../../lib/orgs/org-page-data'
import { memberSince } from '../../lib/profile-identity'
import { mediaUrl } from '../../services/media'
import type { Organization, OrganizationStats, OrgMember } from '../../services/orgs'
import { linkTarget } from '../../utils/link-service'
import { markdownPlainText } from '../../utils/markdown-lite'
import { OrgAvatar } from './org-avatar'
import { NotAffiliatedNote, OrgVerification } from './org-verification'

function OrgTotals({ stats }: { stats: OrganizationStats }) {
  const count = (n: number) => n.toLocaleString('en-GB')
  const items = [
    { label: 'Apps', value: count(stats.apps) },
    { label: 'Active users in the last 30 days', value: stats.activeUsers30d > 0 ? `Up to ${count(stats.activeUsers30d)}` : '0' },
    { label: 'Active delegations', value: count(stats.activeDelegations) },
    { label: 'Releases signed off in the last 30 days', value: count(stats.attestations30d) },
  ]
  return (
    <PageSection id="org-totals" title="At a glance">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="border-hairline bg-surface-1 rounded-card border p-4">
            <dt className="text-ink-muted text-xs font-medium">{item.label}</dt>
            <dd className="text-ink mt-1 text-2xl font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-ink-muted mt-3 text-xs">Active users are added up per app, so someone who uses two apps counts twice.</p>
    </PageSection>
  )
}

function OrgMembers({ members, total }: { members: OrgMember[]; total: number }) {
  return (
    <PageSection id="org-members" title="Members" aside={<span className="text-ink-muted text-sm">{plural(total, 'member', 'members')}</span>}>
      <ul aria-label="Members" className="space-y-1">
        {members.slice(0, 12).map((member) => (
          <li key={member.id}>
            <Link href={memberHref(member)} className="hover:bg-surface-2 -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors">
              <ProfileAvatar seed={member.address} alt="" className="h-9 w-9" />
              <span className="min-w-0">
                <span className="text-ink block truncate text-sm font-semibold">{memberLabel(member)}</span>
                <span className="text-ink-muted block text-xs">{roleLabel(member.role)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  )
}

function OrgIdentity({ org }: { org: Organization }) {
  const since = memberSince(org.createdAt)
  return (
    <PageSection id="org-identity" title="Identity">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-ink-muted text-xs font-medium">DID</dt>
          <dd className="text-ink font-mono text-[13px] leading-5 break-all">{org.did}</dd>
        </div>
        {since && (
          <div>
            <dt className="text-ink-muted text-xs font-medium">On Renown since</dt>
            <dd className="text-ink">{since}</dd>
          </div>
        )}
      </dl>
      <a href={`/org/${encodeURIComponent(org.id)}/did.json`} className="text-primary-ink mt-3 inline-block text-sm font-semibold underline-offset-4 hover:underline">
        DID document
      </a>
    </PageSection>
  )
}

/** The public page of an organisation (rendered at /@handle by pages/profile/[id].tsx). */
export function OrgPage({ data }: { data: OrgPageData }) {
  const { org, stats, apps, members, canonicalUrl, art, qr } = data
  const path = orgPath(org.handle)
  const title = org.handle.toLowerCase() !== org.name.toLowerCase() ? `${org.name} (@${org.handle})` : org.name

  if (org.takenDown) {
    return (
      <SiteLayout>
        <PageMeta title={org.name} documentTitle={`${title} on Renown`} description="This organisation was taken down by Renown's moderators." path={path} noindex />
        <Container className="max-w-[1120px] pt-16 pb-24 md:pt-24">
          <Heading level={1}>{org.name}</Heading>
          <p role="status" className="text-ink-muted mt-4 max-w-[60ch]">
            This organisation was taken down by Renown&apos;s moderators.
          </p>
        </Container>
      </SiteLayout>
    )
  }

  const origin = new URL(canonicalUrl).origin
  const image = org.avatar ? mediaUrl(org.id, 'avatar', origin, org.avatar) : null
  const description = markdownPlainText(org.bio ?? '') || `${org.name}, an organisation on Renown.`
  // Only http(s) links are ever shown.
  const links = org.links.filter((link) => linkTarget(link.url))
  const website = org.website ? linkTarget(org.website) : null

  return (
    <SiteLayout>
      <PageMeta
        title={title}
        documentTitle={`${title} on Renown`}
        description={description}
        path={path}
        noindex={org.archived}
        jsonLd={[organizationJsonLd({ org, url: canonicalUrl, image })]}
      />
      <Container className="max-w-[1120px] pt-6 pb-20 md:pt-10">
        <header className="border-hairline bg-surface-1 shadow-card rounded-panel overflow-hidden border">
          <IdentityArt art={art} className="h-28 md:h-36" />
          <div className="px-5 pb-6 sm:px-8">
            <div className="-mt-10 flex items-end justify-between gap-4">
              <span className="bg-background block rounded-full p-1" style={{ boxShadow: `0 0 0 2px ${art.accent}` }}>
                <OrgAvatar org={org} className="h-20 w-20" />
              </span>
              <div className="flex items-center gap-2 pb-1">
                <ShareMenu url={canonicalUrl} title={`${org.name} on Renown`} qr={qr} subject="this organisation" />
              </div>
            </div>
            <h1 className="text-ink text-h1 mt-4 break-words">{org.name}</h1>
            <p className="text-ink-muted mt-1 break-all">@{org.handle}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <OrgVerification verifiedDomains={org.verifiedDomains} />
              {org.archived && <Badge>Archived</Badge>}
            </div>
            {org.notAffiliatedWith && (
              <div className="mt-4 max-w-[60ch]">
                <NotAffiliatedNote other={org.notAffiliatedWith} />
              </div>
            )}
            {org.bio && <p className="text-ink mt-5 max-w-[68ch] leading-7 break-words whitespace-pre-line">{org.bio}</p>}
            {website && org.website && (
              <a href={org.website} target="_blank" rel="nofollow noopener noreferrer" className="text-primary-ink mt-3 inline-block text-sm font-semibold break-all underline-offset-4 hover:underline">
                {website.host}
              </a>
            )}
          </div>
        </header>

        <div className="mt-12 grid gap-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
          <div className="min-w-0 space-y-12">
            {stats && <OrgTotals stats={stats} />}
            {apps.length > 0 && (
              <PageSection
                id="org-apps"
                title="Apps"
                aside={
                  <Link href={`/apps?org=${encodeURIComponent(org.handle)}`} className="text-primary-ink text-sm font-semibold underline-offset-4 hover:underline">
                    See in the app directory
                  </Link>
                }
              >
                <ul className="grid gap-5 sm:grid-cols-2">
                  {apps.map((app) => (
                    <li key={app.appDid}>
                      <AppTile app={app} />
                    </li>
                  ))}
                </ul>
              </PageSection>
            )}
            {links.length > 0 && (
              <PageSection id="org-links" title="Links">
                <LinkChips links={links} />
              </PageSection>
            )}
            {!stats && apps.length === 0 && links.length === 0 && (
              <p className="text-ink-muted">{org.name} has not published any apps on Renown yet.</p>
            )}
          </div>
          <aside className="min-w-0 space-y-10">
            {members.length > 0 && <OrgMembers members={members} total={org.memberCount} />}
            <OrgIdentity org={org} />
          </aside>
        </div>
      </Container>
    </SiteLayout>
  )
}
