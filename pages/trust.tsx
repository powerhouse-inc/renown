import type { NextPage } from 'next'
import Link from 'next/link'
import { PageMeta } from '../components/site/page-meta'
import { Card, Container, Eyebrow, Heading, Lead, Section } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'
import { MEDIA_SOURCE, NEVER_HELD, OPEN_SOURCE, STORAGE_SOURCE, STORED, TRUST_CLAIMS } from '../components/trust/trust-content'

const sourceLink = 'text-ink-muted hover:text-primary-ink mt-4 inline-flex items-center gap-1.5 font-mono text-xs transition-colors'

function SourceIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  )
}

const TrustPage: NextPage = () => (
  <SiteLayout>
    <PageMeta
      title="Trust"
      path="/trust"
      description="How Renown identities, keys and credentials work, what Renown stores, and what it never holds. Every claim links to the code."
    />
    <Container className="pt-14 pb-6 md:pt-20">
      <Eyebrow>Trust</Eyebrow>
      <Heading level={1} className="max-w-[20ch]">
        Check how Renown works, not just what we say
      </Heading>
      <Lead>
        Each claim below links to the public code that implements it.
      </Lead>
    </Container>

    <Section labelledBy="claims-title" spacing="sm">
      <h2 id="claims-title" className="sr-only">
        How it works
      </h2>
      <ol className="border-hairline divide-hairline divide-y border-y">
        {TRUST_CLAIMS.map((claim) => (
          <li key={claim.id} id={claim.id} className="grid gap-3 py-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12 md:py-10">
            <h3 className="text-ink text-h3 max-w-[28ch]">{claim.title}</h3>
            <div>
              <p className="text-ink-muted leading-7">{claim.body}</p>
              <a href={claim.source.href} target="_blank" rel="noopener noreferrer" className={sourceLink}>
                <SourceIcon />
                {claim.source.label}
                <span className="sr-only"> (source code)</span>
              </a>
              {claim.extra && (
                <a href={claim.extra.href} target="_blank" rel="noopener noreferrer" className={`${sourceLink} ml-5`}>
                  <SourceIcon />
                  {claim.extra.label}
                  <span className="sr-only"> (source code)</span>
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-ink-muted mt-6 text-sm">
        Want to see or revoke what you have approved?{' '}
        <Link href="/me" className="text-primary-ink font-medium underline underline-offset-4">
          Open Your Renown
        </Link>
        .
      </p>
    </Section>

    <Section labelledBy="data-title" spacing="sm">
      <Heading level={2} id="data-title">
        What Renown stores, and what it never holds
      </Heading>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Card className="p-6 md:p-8">
          <h3 className="text-ink text-h3">Stored</h3>
          <ul className="mt-5 space-y-4">
            {STORED.map((item) => (
              <li key={item} className="text-ink-muted flex gap-3 leading-7">
                <span aria-hidden="true" className="bg-primary mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                {item}
              </li>
            ))}
          </ul>
          <a href={STORAGE_SOURCE} target="_blank" rel="noopener noreferrer" className={sourceLink}>
            <SourceIcon />
            renown-user/migrations.ts
            <span className="sr-only"> (source code)</span>
          </a>
          <a href={MEDIA_SOURCE} target="_blank" rel="noopener noreferrer" className={`${sourceLink} ml-5`}>
            <SourceIcon />
            services/media.ts
            <span className="sr-only"> (source code)</span>
          </a>
        </Card>
        <Card className="border-signal/30 p-6 md:p-8">
          <h3 className="text-ink text-h3">Never held</h3>
          <ul className="mt-5 space-y-4">
            {NEVER_HELD.map((item) => (
              <li key={item} className="text-ink-muted flex gap-3 leading-7">
                <svg aria-hidden="true" className="text-signal mt-1.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Section>

    <Section labelledBy="oss-title" spacing="sm" className="pb-24">
      <Heading level={2} id="oss-title">
        Public code
      </Heading>
      <Lead>The Renown package and SDK are AGPL-3.0 licensed, and this website&apos;s code is public. Read it, run it, audit it.</Lead>
      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {OPEN_SOURCE.map((repo) => (
          <li key={repo.label}>
            <a
              href={repo.href}
              target="_blank"
              rel="noopener noreferrer"
              className="border-hairline bg-surface-1 rounded-card hover:border-primary/40 block h-full border p-6 transition-colors"
            >
              <span className="text-ink font-mono text-sm font-semibold">{repo.label}</span>
              <span className="text-ink-muted mt-2 block text-sm leading-6">{repo.detail}</span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  </SiteLayout>
)

export default TrustPage
