import type { IdentityArtSvgs } from '../../lib/identity-art'
import { IdentityArt } from '../identity/identity-art'
import { Container, Reveal } from '../site/primitives'
import { HeroCta } from './hero-cta'

// A continuous frame: brand gradient there and back again, softened towards the
// hairline border colour so it reads as a premium edge, not a neon tube.
const FRAME =
  'conic-gradient(from 210deg at 50% 50%, color-mix(in oklab, var(--grad-from) 70%, var(--border)), color-mix(in oklab, var(--grad-to) 75%, var(--border)) 30%, color-mix(in oklab, var(--grad-to) 35%, var(--border)) 50%, color-mix(in oklab, var(--grad-to) 75%, var(--border)) 70%, color-mix(in oklab, var(--grad-from) 70%, var(--border)))'

// The glow sits around the heading and is fully transparent before every edge of the panel.
const GLOW = 'radial-gradient(ellipse 48% 42% at 50% 44%, color-mix(in oklab, var(--grad-to) 20%, transparent), transparent)'

// The constellation shows towards the edges and fades out behind the centred copy.
const ART_MASK = 'radial-gradient(ellipse 70% 75% at 50% 48%, transparent 40%, rgba(0, 0, 0, 0.5) 75%, black 100%)'

export function FinalCta({ art }: { art: IdentityArtSvgs }) {
  return (
    <section aria-labelledby="final-cta-title" className="pt-8 pb-24 md:pb-32">
      <Container>
        <Reveal className="rounded-panel relative isolate overflow-hidden p-[1px]">
          <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: FRAME }} />
          <div className="bg-background rounded-panel relative isolate overflow-hidden px-6 py-14 text-center md:px-12 md:py-20">
            <IdentityArt
              art={art}
              className="absolute inset-0 -z-10 opacity-35 md:opacity-50 dark:opacity-45 md:dark:opacity-60"
              style={{ maskImage: ART_MASK, WebkitMaskImage: ART_MASK }}
            />
            <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: GLOW }} />
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
