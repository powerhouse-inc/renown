import type { NextPage } from 'next'
import { ECOSYSTEM } from '../components/ecosystem/ecosystem-data'
import { IdentityFlowDiagram } from '../components/ecosystem/identity-flow-diagram'
import { PageMeta } from '../components/site/page-meta'
import { Card, Container, Eyebrow, Heading, Lead, Section } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'
import { isExternal } from '../components/site/nav'

const EcosystemPage: NextPage = () => (
  <SiteLayout>
    <PageMeta
      title="Ecosystem"
      path="/ecosystem"
      description="Renown, Vetra, Achra, Connect and Switchboard: how one identity flows through the Powerhouse network."
    />
    <Container className="pt-14 pb-6 md:pt-20">
      <Eyebrow>Ecosystem</Eyebrow>
      <Heading level={1} className="max-w-[20ch]">
        One identity across the Powerhouse network
      </Heading>
      <Lead>Renown is the identity layer. Here is what each part of the network does, and how your identity moves between them.</Lead>
    </Container>

    <Section labelledBy="flow-title" spacing="sm">
      <h2 id="flow-title" className="text-ink text-h3">
        How identity flows
      </h2>
      <Card className="mt-6 p-5 md:p-8">
        <IdentityFlowDiagram />
      </Card>
    </Section>

    <Section labelledBy="systems-title" spacing="sm" className="pb-24">
      <h2 id="systems-title" className="sr-only">
        Systems
      </h2>
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {ECOSYSTEM.map((entry) => (
          <li key={entry.id} id={entry.id} className="scroll-mt-24">
            <Card className={`flex h-full flex-col p-6 ${entry.id === 'renown' ? 'border-primary/40 shadow-glow' : ''}`}>
              <h3 className="text-ink text-h3">{entry.name}</h3>
              <p className="text-primary-ink mt-1 text-sm font-medium">{entry.role}</p>
              <p className="text-ink-muted mt-4 flex-1 leading-7">{entry.detail}</p>
              <a
                href={entry.href}
                {...(isExternal(entry.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="text-ink hover:text-primary-ink mt-6 text-sm font-semibold underline decoration-hairline-strong underline-offset-4"
              >
                {entry.id === 'renown' ? 'Back to Renown' : `Visit ${entry.name}`}
              </a>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  </SiteLayout>
)

export default EcosystemPage
