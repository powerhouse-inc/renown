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
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 hidden md:block"
              style={{ maskImage: 'radial-gradient(ellipse 58% 75% at 50% 50%, transparent 55%, black 100%)', WebkitMaskImage: 'radial-gradient(ellipse 58% 75% at 50% 50%, transparent 55%, black 100%)' }}
            >
              <PhMotif className="-right-72 -bottom-80 opacity-40 dark:opacity-70" />
              <PhMotif className="-top-96 -left-72 rotate-180 opacity-30 dark:opacity-50" />
            </div>
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
