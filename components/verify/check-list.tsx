import type { Check, CheckStatus } from '../../lib/verify/types'
import { TONE_TEXT, type Tone } from './verdict-seal'

const STATUS: Record<CheckStatus, { tone: Tone; word: string }> = {
  pass: { tone: 'good', word: 'Passed' },
  fail: { tone: 'bad', word: 'Failed' },
  neutral: { tone: 'neutral', word: 'Note' },
  unknown: { tone: 'caution', word: 'Not checked' },
}

function StatusIcon({ status }: { status: CheckStatus }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8.5" strokeOpacity="0.5" strokeWidth="1.5" />
      {status === 'pass' && <path d="m6.5 10.2 2.4 2.4 4.6-5" />}
      {status === 'fail' && <path d="m7.2 7.2 5.6 5.6m0-5.6-5.6 5.6" />}
      {status === 'neutral' && <path d="M10 9.2v4.3M10 6.5v.1" />}
      {status === 'unknown' && <path d="M6.8 10h6.4" />}
    </svg>
  )
}

/** Every check in the order it was made, each with what it found. */
export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ol className="divide-hairline border-hairline divide-y border-y">
      {checks.map((check) => {
        const { tone, word } = STATUS[check.status]
        return (
          <li key={check.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-4 py-5" data-check={check.id} data-status={check.status}>
            <span className={`${TONE_TEXT[tone]} mt-0.5`}>
              <StatusIcon status={check.status} />
            </span>
            <div>
              <h3 className="text-ink font-semibold">
                {check.label}
                <span className="sr-only">: {word}</span>
              </h3>
              <p className="text-ink-muted mt-1 leading-7 break-words">{check.detail}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
