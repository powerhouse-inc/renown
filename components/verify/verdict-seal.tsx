import type { Verdict } from '../../lib/verify/types'

export type Tone = 'good' | 'bad' | 'caution' | 'neutral' | 'info'

export const VERDICT_TONE: Record<Verdict, Tone> = {
  genuine: 'good',
  'not-genuine': 'bad',
  revoked: 'caution',
  expired: 'caution',
  'not-yet-valid': 'caution',
  'not-valid': 'caution',
  unchecked: 'neutral',
  unrecorded: 'caution',
  identity: 'info',
}

/** Text colour class of each tone (all AA on the page and on their own tint). */
export const TONE_TEXT: Record<Tone, string> = {
  good: 'text-signal',
  bad: 'text-danger-ink',
  caution: 'text-caution-ink',
  neutral: 'text-ink-muted',
  info: 'text-primary-ink',
}

function Glyph({ verdict }: { verdict: Verdict }) {
  switch (verdict) {
    case 'genuine':
      return <path d="M34 49.5 44.5 60 63 39" />
    case 'not-genuine':
      return <path d="m37 37 24 24M61 37 37 61" />
    case 'revoked':
      return (
        <>
          <circle cx="49" cy="49" r="14" />
          <path d="m39 59 20-20" />
        </>
      )
    case 'expired':
      return (
        <>
          <circle cx="49" cy="49" r="14" />
          <path d="M49 41v8.5l5.5 3.5" />
        </>
      )
    case 'not-yet-valid':
      return (
        <>
          <path d="M40 36h18M40 62h18" />
          <path d="M42.5 36c0 7 13 9.5 13 13s-13 6-13 13M55.5 36c0 7-13 9.5-13 13s13 6 13 13" />
        </>
      )
    case 'not-valid':
      return (
        <>
          <circle cx="49" cy="49" r="14" />
          <path d="M42 49h14" />
        </>
      )
    case 'unchecked':
      return <path d="M42.5 43a6.5 6.5 0 1 1 9 6c-1.8.8-2.5 2-2.5 3.8V55M49 61.5v.5" />
    case 'unrecorded':
      // a mark of caution: a valid signature, but no record behind it
      return <path d="M49 39v13M49 59.5v.5" />
    case 'identity':
      return (
        <>
          <circle cx="49" cy="44" r="6" />
          <path d="M37.5 60.5c2-5 6.3-7.5 11.5-7.5s9.5 2.5 11.5 7.5" />
        </>
      )
  }
}

/**
 * The verdict as a seal: a ring of 36 ticks (in the signer's identity colour
 * when there is a signer and it is genuine) around one glyph. The ring draws
 * itself once when a result appears; reduced motion shows it complete.
 */
export function VerdictSeal({ verdict, accent }: { verdict: Verdict; accent: string | null }) {
  const tone = VERDICT_TONE[verdict]
  const ringColour = verdict === 'genuine' && accent ? accent : 'currentColor'
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10)
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 98 98"
      className={`verify-seal ${TONE_TEXT[tone]} h-20 w-20 shrink-0 md:h-24 md:w-24`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="49" cy="49" r="30" className="fill-current opacity-[0.12]" stroke="none" />
      <g stroke={ringColour} strokeWidth="2.2">
        {ticks.map((deg, i) => (
          <line
            key={deg}
            x1="49"
            y1="6"
            x2="49"
            y2={i % 3 === 0 ? 13 : 10.5}
            transform={`rotate(${deg} 49 49)`}
            className="verify-seal-tick"
            style={{ animationDelay: `${i * 14}ms` }}
          />
        ))}
      </g>
      <circle cx="49" cy="49" r="30" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
      <g stroke="currentColor" strokeWidth="4">
        <Glyph verdict={verdict} />
      </g>
    </svg>
  )
}
