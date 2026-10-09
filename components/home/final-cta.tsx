import { PhMotif } from '../site/ph-motif'
import { Container, Reveal } from '../site/primitives'
import { HeroCta } from './hero-cta'

export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="pt-8 pb-24 md:pb-32">
      <Container>
        <Reveal className="rounded-panel relative isolate overflow-hidden p-[1px]">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10"
            style={{ background: 'linear-gradient(120deg, var(--grad-from), var(--grad-to) 45%, transparent 80%)' }}
          />
          <div className="bg-background rounded-panel relative isolate overflow-hidden px-6 py-14 text-center md:px-12 md:py-20">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 -top-1/2 -z-10 h-full"
              style={{ background: 'radial-gradient(50% 60% at 50% 100%, color-mix(in oklab, var(--grad-to) 26%, transparent), transparent)' }}
            />
            <PhMotif className="-right-56 -bottom-72 -z-10 hidden opacity-50 md:block dark:opacity-80" />
            <PhMotif className="-top-80 -left-64 -z-10 hidden rotate-180 opacity-40 lg:block dark:opacity-60" />
            <h2 id="final-cta-title" className="text-ink text-h1 mx-auto max-w-[18ch] text-balance">
              Bring your identity to every app
            </h2>
            <p className="text-ink-muted text-lead mx-auto mt-5 max-w-[48ch]">
              Create your Renown ID with the wallet you already use. It takes one signature.
            </p>
            <div className="mt-9 flex justify-center">
              <HeroCta />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
