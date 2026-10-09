import type { HighlightedCode } from '../../lib/highlight'
import { ButtonLink, CodeBlock, Eyebrow, Heading, Lead, Section } from '../site/primitives'

/** The 6-line server check shown on the homepage (highlighted in getServerSideProps). */
export const TEASER_CODE = `import { verifyAuthBearerToken, fetchDelegationCredential } from '@renown/sdk'

const jwt = await verifyAuthBearerToken(token)
if (!jwt) throw new Error('Invalid or expired token')
const { address, chainId } = jwt.verifiableCredential.credentialSubject
const grant = await fetchDelegationCredential({ address, chainId, appDid: jwt.issuer })`

export function DevelopersTeaser({ code }: { code: HighlightedCode }) {
  return (
    <Section labelledBy="dev-teaser-title">
      <div className="grid items-center gap-12 lg:grid-cols-[0.72fr_1.28fr]">
        <div>
          <Eyebrow>For developers</Eyebrow>
          <Heading level={2} id="dev-teaser-title">
            Add Renown sign‑in to your app
          </Heading>
          <Lead>
            Send people to a connect link, get their approval back as a signed credential, and verify every request on
            your server with <span className="text-ink font-mono text-[0.92em]">@renown/sdk</span>.
          </Lead>
          <ButtonLink href="/developers" variant="secondary" className="mt-8">
            Read the developer guide
          </ButtonLink>
        </div>
        <CodeBlock code={code.code} html={code.html} label="server.ts" className="min-w-0" />
      </div>
    </Section>
  )
}
