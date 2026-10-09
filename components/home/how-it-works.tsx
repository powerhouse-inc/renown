import { Heading, Lead, Reveal, Section } from '../site/primitives'

const STEPS = [
  {
    title: 'Connect a wallet',
    body: 'Use the wallet you already have. Renown never asks for a password and never sees your private key.',
  },
  {
    title: 'Your DID is created',
    body: (
      <>
        Your identity is derived from your address, like{' '}
        <span className="text-ink font-mono text-[0.9em] break-all">did:pkh:eip155:1:0x5e…0a01</span>. There is nothing to
        register.
      </>
    ),
  },
  {
    title: 'Apps ask, you approve',
    body: 'An app requests access and you sign one credential for it, valid for 7 days unless the app asks for longer. Revoke it any time.',
  },
]

export function HowItWorks() {
  return (
    <Section labelledBy="how-title" tone="raised">
      <div className="max-w-[720px]">
        <Heading level={2} id="how-title">
          From wallet to signed in, in three steps
        </Heading>
        <Lead>No accounts to create and no passwords to remember. Just signatures you can check.</Lead>
      </div>
      <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
        <span
          aria-hidden="true"
          className="via-primary/40 absolute top-5 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent to-transparent md:block"
        />
        {STEPS.map((step, index) => (
          <Reveal as="li" key={step.title} delay={index * 120} className="relative">
            <span className="border-primary/40 bg-background text-primary-ink relative z-10 flex h-10 w-10 items-center justify-center rounded-full border font-mono text-sm font-semibold shadow-glow">
              {index + 1}
            </span>
            <h3 className="text-ink text-h3 mt-6">{step.title}</h3>
            <p className="text-ink-muted mt-3 leading-7">{step.body}</p>
          </Reveal>
        ))}
      </ol>
    </Section>
  )
}
