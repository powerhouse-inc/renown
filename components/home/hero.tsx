import type { RenownAppProfile } from '../../services/app-profiles'
import { Container } from '../site/primitives'
import { Constellation } from './constellation'
import { HeroCta } from './hero-cta'

export function Hero({ apps }: { apps: RenownAppProfile[] }) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <Container className="grid items-center gap-12 pt-14 pb-16 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pt-24 lg:pb-28">
        <div className="max-w-[640px]">
          <p className="text-ink-muted border-hairline bg-surface-1 mb-7 inline-flex items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-sm backdrop-blur">
            <span className="bg-signal/15 text-signal rounded-full px-2 py-0.5 font-mono text-xs">did:pkh</span>
            Your wallet is your identity
          </p>
          <h1 id="hero-title" className="text-ink text-display text-balance">
            One identity for the Powerhouse network
          </h1>
          <p className="text-ink-muted text-lead mt-6 max-w-[54ch] text-pretty">
            Renown turns your wallet into a portable identity. Sign in to every Powerhouse app, sign everything you
            create, and revoke an app&apos;s access whenever you choose.
          </p>
          <div className="mt-9">
            <HeroCta />
          </div>
          <p className="text-ink-muted mt-6 text-sm">No passwords. Your wallet keys never leave your wallet.</p>
        </div>
        <div className="relative mx-auto w-full max-w-[460px] lg:max-w-[540px]">
          <div
            aria-hidden="true"
            className="absolute inset-[12%] rounded-full blur-3xl"
            style={{ background: 'radial-gradient(closest-side, color-mix(in oklab, var(--grad-to) 30%, transparent), transparent)' }}
          />
          <Constellation apps={apps} />
        </div>
      </Container>
    </section>
  )
}
