import type { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'
import { InviteAcceptLoading } from '../../components/org/invite-accept-loading'
import { OrgAvatar } from '../../components/org/org-avatar'
import { OrgVerification } from '../../components/org/org-verification'
import { Container } from '../../components/site/primitives'
import { SiteLayout } from '../../components/site/site-layout'
import { NotFoundPage } from '../../components/ui/not-found-page'
import { withLazyWalletShell } from '../../components/wallet/lazy-wallet-shell'
import { roleLabel } from '../../lib/orgs/format'
import { loadInvitePage, type InvitePageProps } from '../../lib/orgs/invite-page-data'
import { INVITE_STATE_TEXT, inviteLinkState, ROLE_MEANING } from '../../lib/orgs/invites'
import { formatDay } from '../../lib/verify/format'

// Only the Join control loads the wallet stack; the preview is plain HTML.
const InviteAccept = withLazyWalletShell(
  () => import('../../components/org/invite-accept').then((m) => m.InviteAccept),
  InviteAcceptLoading,
)

const InvitePage: NextPage<InvitePageProps> = ({ preview, token, unavailable }) => {
  if (unavailable) return <NotFoundPage title="Something went wrong" message="Invites are temporarily unavailable. Please try again in a moment." />
  if (!preview) return <NotFoundPage title="Invite not found" message="This invite link does not exist. Ask the organisation for a new one." />
  const { org, role } = preview
  const state = inviteLinkState(preview)
  return (
    <SiteLayout>
      <Head>
        <title>{`Join ${org.name} - Renown`}</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <Container className="pt-14 pb-24 md:pt-20">
        <div className="border-hairline bg-surface-1 shadow-card rounded-panel mx-auto max-w-lg border px-6 py-10 text-center md:px-10">
          <span className="mx-auto block w-fit">
            <OrgAvatar org={org} className="h-20 w-20" />
          </span>
          <h1 className="text-ink text-h2 mt-6 text-balance break-words">Join {org.name}</h1>
          <p className="text-ink-muted mt-2 break-all">@{org.handle}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <OrgVerification verifiedDomains={org.verifiedDomains} />
          </div>
          <p className="text-ink mt-6 leading-7">
            You are invited to join as {roleLabel(role)}. <span className="text-ink-muted">{ROLE_MEANING[role]}</span>
          </p>
          {state === 'usable' ? (
            <>
              <p className="text-ink-muted mt-2 text-sm">This link expires on {formatDay(preview.expiresAt)}.</p>
              <div className="mt-8">
                <InviteAccept token={token} org={org} />
              </div>
            </>
          ) : (
            <p role="status" className="text-ink mt-8 font-semibold">
              {INVITE_STATE_TEXT[state]}
            </p>
          )}
          <p className="text-ink-muted mt-8 text-xs leading-5">
            Joining is signed with your wallet. The organisation sees your address, and your public profile if you have one.
          </p>
        </div>
      </Container>
    </SiteLayout>
  )
}

export const getServerSideProps: GetServerSideProps<InvitePageProps> = ({ params, req, res }) => loadInvitePage(params?.token, res, req)

export default InvitePage
