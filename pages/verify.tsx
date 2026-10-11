import type { NextPage } from 'next'
import { PageMeta } from '../components/site/page-meta'
import { Container, Heading, Lead } from '../components/site/primitives'
import { SiteLayout } from '../components/site/site-layout'
import { VerifyTool } from '../components/verify/verify-tool'

const DESCRIPTION =
  'Paste a Renown DID, credential, bearer token or signed operation to see whether it is genuine, who signed it, for which app, and whether it still holds.'

const NOTES = [
  {
    title: 'Checked in your browser',
    body: 'Credentials (EIP-712), bearer tokens (ES256) and signed operations (P-256) are verified on this page, with the Renown SDK and the hashing the reactor itself uses.',
  },
  {
    title: 'Only public lookups',
    body: 'To name the signer and see whether a credential was revoked, the page asks Renown for a wallet’s profile, an app’s profile, and credentials by id or by app key and wallet. For a smart wallet it asks the chain whether the wallet made the signature.',
  },
  {
    title: 'Private share links',
    body: 'A share link carries what you pasted after the #, the part of an address browsers never send to a server.',
  },
]

const VerifyPage: NextPage = () => (
  <SiteLayout>
    <PageMeta title="Verify a signature" description={DESCRIPTION} path="/verify" />
    <Container className="max-w-[1040px] pt-14 pb-16 md:pt-20 md:pb-20">
      <Heading level={1} className="max-w-[16ch]">
        Check who signed it
      </Heading>
      <Lead>{DESCRIPTION}</Lead>
      <div className="mt-10 md:mt-12">
        <VerifyTool />
      </div>
    </Container>
    <section aria-labelledby="verify-how" className="border-hairline border-t">
      <Container className="max-w-[1040px] py-14 md:py-20">
        <h2 id="verify-how" className="text-ink text-h3">
          How the check works
        </h2>
        <ul className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
          {NOTES.map((note) => (
            <li key={note.title}>
              <h3 className="text-ink font-semibold">{note.title}</h3>
              <p className="text-ink-muted mt-2 text-[15px] leading-7">{note.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  </SiteLayout>
)

export default VerifyPage
