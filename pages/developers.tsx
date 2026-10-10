import type { GetStaticProps, NextPage } from 'next'
import type { ReactNode } from 'react'
import { ConnectLinkBuilder } from '../components/developers/connect-link-builder'
import { ParamTable, type ParamRow } from '../components/developers/param-table'
import { SNIPPETS, type SnippetKey } from '../components/developers/snippets'
import { Toc, type TocItem } from '../components/developers/toc'
import { PageMeta } from '../components/site/page-meta'
import { APP_STATS_DOCS_URL, VETRA_URL } from '../components/site/nav'
import { CodeBlock, Container, Eyebrow, Heading, Lead } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'
import type { HighlightedCode } from '../lib/highlight'
import { DEFAULT_OIDC_ISSUER } from '../utils/oidc-issuer'
import { DEFAULT_CREDENTIAL_VALIDITY_DAYS, MAX_CREDENTIAL_VALIDITY_DAYS } from '../utils/credential-validity'

interface DevelopersProps {
  code: Record<SnippetKey, HighlightedCode>
}

const TOC: TocItem[] = [
  { id: 'how-login-works', label: 'How Renown login works' },
  { id: 'connect-link', label: 'Connect link reference' },
  { id: 'builder', label: 'Build a connect link' },
  { id: 'sdk', label: 'SDK quick start' },
  { id: 'app-identity', label: 'App identity and stats' },
  { id: 'oidc', label: 'Sign in with Renown (OIDC)' },
  { id: 'graphql', label: 'Public GraphQL reads' },
]

const FLOW = [
  { title: 'Your app sends the user to a connect link', body: 'The link names your app by its DID and says where to send the user afterwards.' },
  { title: 'The user approves', body: 'They sign in with their wallet and sign one credential that authorises your app key.' },
  { title: 'Renown stores the credential', body: 'It is public and revocable. The user is sent back with their DID in ?user=.' },
  { title: 'Your app verifies', body: 'Your server checks each request’s token and the credential behind it with @renown/sdk.' },
]

const Code = ({ value, label }: { value: HighlightedCode; label: string }) => (
  <CodeBlock code={value.code} html={value.html} label={label} className="mt-6" />
)

const Mono = ({ children }: { children: ReactNode }) => <code className="text-ink font-mono text-[0.9em] [overflow-wrap:anywhere]">{children}</code>

const PARAMS: ParamRow[] = [
  { name: 'connect', value: 'App DID (did:key:…)', description: 'The app asking for access. Required unless app is set.' },
  { name: 'app', value: 'App DID', description: 'Same as connect; when both are present, app wins.' },
  {
    name: 'returnUrl',
    value: 'Absolute http(s) URL',
    description: (
      <>
        After approval the user is sent here with <Mono>user=did:pkh:eip155:&lt;chainId&gt;:&lt;address&gt;</Mono> added.
        The DID is URL-encoded twice: decode it once more after reading the parameter. Anything that is not an absolute http(s) URL is ignored and the flow ends on Renown.
      </>
    ),
  },
  {
    name: 'deeplink',
    value: 'URL scheme',
    description: (
      <>
        For native apps: after approval Renown opens <Mono>&lt;deeplink&gt;://login/&lt;did&gt;</Mono>, where the DID is URL-encoded once. Takes precedence over
        returnUrl.
      </>
    ),
  },
  {
    name: 'expiresInDays',
    value: `Whole number, 1–${MAX_CREDENTIAL_VALIDITY_DAYS}`,
    description: `How long the credential is valid. Default ${DEFAULT_CREDENTIAL_VALIDITY_DAYS}; larger values are clamped to ${MAX_CREDENTIAL_VALIDITY_DAYS}; anything else falls back to ${DEFAULT_CREDENTIAL_VALIDITY_DAYS}. A non-default validity is shown to the user to confirm.`,
  },
]

function DocSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="border-hairline scroll-mt-24 border-t py-14 first:border-t-0 first:pt-0">
      <Heading level={2} size="h2" id={`${id}-title`} className="text-[1.75rem] md:text-[2rem]">
        {title}
      </Heading>
      {children}
    </section>
  )
}

const prose = 'text-ink-muted mt-4 max-w-[68ch] leading-7'
const link = 'text-primary-ink font-medium underline decoration-primary/30 underline-offset-4 hover:decoration-primary'

const DevelopersPage: NextPage<DevelopersProps> = ({ code }) => (
  <SiteLayout>
    <PageMeta
      title="Developers"
      path="/developers"
      description="Add Renown sign-in to your app: connect links, credentials, @renown/sdk, OpenID Connect and public GraphQL reads."
    />
    <Container className="pt-14 pb-10 md:pt-20">
      <Eyebrow>Developers</Eyebrow>
      <Heading level={1} size="h1" className="max-w-[18ch]">
        Build with Renown
      </Heading>
      <Lead>
        Let people sign in to your app with their Renown identity and act through a key they authorised, then verify it on
        your server. Everything here works against production today.
      </Lead>
    </Container>
    <Container className="grid gap-12 pb-24 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
      <aside className="hidden lg:block">
        <Toc items={TOC} />
      </aside>
      <div className="min-w-0">
        <DocSection id="how-login-works" title="How Renown login works">
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {FLOW.map((step, index) => (
              <li key={step.title} className="border-hairline bg-surface-1 rounded-card border p-5">
                <span className="text-primary-ink font-mono text-sm font-semibold">{index + 1}</span>
                <h3 className="text-ink mt-2 font-semibold">{step.title}</h3>
                <p className="text-ink-muted mt-1.5 text-sm leading-6">{step.body}</p>
              </li>
            ))}
          </ol>
        </DocSection>

        <DocSection id="connect-link" title="Connect link reference">
          <p className={prose}>
            A connect link opens the Renown sign-in flow for your app:
          </p>
          <p className="bg-code border-hairline text-ink mt-4 rounded-[var(--radius-control)] border px-4 py-3 font-mono text-sm break-all">
            https://www.renown.id/?connect=&lt;app DID&gt;&amp;returnUrl=&lt;url&gt;&amp;expiresInDays=&lt;n&gt;
          </p>
          <div className="mt-6">
            <ParamTable rows={PARAMS} />
          </div>
        </DocSection>

        <DocSection id="builder" title="Build a connect link">
          <p className={prose}>
            Fill in your app&apos;s details. The link is checked with the same rules the sign-in flow applies.
          </p>
          <div className="mt-8">
            <ConnectLinkBuilder />
          </div>
        </DocSection>

        <DocSection id="sdk" title="SDK quick start">
          <p className={prose}>
            <Mono>@renown/sdk</Mono> gives your app a key pair and identity in the browser, logs the user in once they
            approve, signs short-lived bearer tokens, and verifies them on your server.
          </p>
          <Code value={code.install} label={SNIPPETS.install.label} />
          <h3 className="text-ink text-h3 mt-10">1. Give your app an identity</h3>
          <Code value={code.identity} label={SNIPPETS.identity.label} />
          <h3 className="text-ink text-h3 mt-10">2. Complete the login when the user returns</h3>
          <Code value={code.callback} label={SNIPPETS.callback.label} />
          <h3 className="text-ink text-h3 mt-10">3. Call your API with a bearer token</h3>
          <Code value={code.bearer} label={SNIPPETS.bearer.label} />
          <h3 className="text-ink text-h3 mt-10">4. Verify requests on your server</h3>
          <Code value={code.verify} label={SNIPPETS.verify.label} />
        </DocSection>

        <DocSection id="app-identity" title="App identity and stats">
          <p className={prose}>
            Apps built and hosted on{' '}
            <a className={link} href={VETRA_URL} target="_blank" rel="noopener noreferrer">
              Vetra
            </a>{' '}
            get their Renown identity there, along with a public app profile at <Mono>renown.id/app/&lt;DID&gt;</Mono>. Apps
            can report per-user stats that appear on user profiles and app pages; see the{' '}
            <a className={link} href={APP_STATS_DOCS_URL} target="_blank" rel="noopener noreferrer">
              app stats docs
            </a>
            .
          </p>
        </DocSection>

        <DocSection id="oidc" title="Sign in with Renown (OIDC)">
          <p className={prose}>
            Renown is also an OpenID Connect provider (authorization code flow with PKCE, RS256 ID tokens). Registered OIDC
            clients use the issuer below:
          </p>
          <p className="bg-code border-hairline text-ink mt-4 rounded-[var(--radius-control)] border px-4 py-3 font-mono text-sm break-all">
            {DEFAULT_OIDC_ISSUER}
          </p>
          <Code value={code.oidc} label={SNIPPETS.oidc.label} />
          <p className={prose}>
            Client registration is not self-service yet: clients are registered by the Renown operators.
          </p>
        </DocSection>

        <DocSection id="graphql" title="Public GraphQL reads">
          <p className={prose}>
            Profiles, app profiles and app stats are public. Read app profiles and stats from{' '}
            <Mono>https://switchboard.renown.vetra.io/graphql/renown-stats</Mono> (queries <Mono>appProfile</Mono>,{' '}
            <Mono>appProfiles</Mono>, <Mono>appStats</Mono>, <Mono>userStats</Mono>) and user profiles from{' '}
            <Mono>https://switchboard.renown.vetra.io/graphql</Mono> (<Mono>renownUsers</Mono>).
          </p>
          <Code value={code.graphql} label={SNIPPETS.graphql.label} />
          <Code value={code.graphqlCurl} label={SNIPPETS.graphqlCurl.label} />
        </DocSection>
      </div>
    </Container>
  </SiteLayout>
)

export const getStaticProps: GetStaticProps<DevelopersProps> = async () => {
  const { highlightAll } = await import('../lib/highlight')
  const code = await highlightAll(SNIPPETS)
  return { props: { code } }
}

export default DevelopersPage
