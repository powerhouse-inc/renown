import { ButtonLink, Container } from './primitives'

export interface ErrorStateProps {
  /** Status shown above the title ("404"); omitted when absent. */
  code?: string
  title: string
  message: string
}

/** A full-width error/empty page body: a broken signed edge, the message, and the way back. */
export function ErrorState({ code, title, message }: ErrorStateProps) {
  return (
    <Container className="flex flex-col items-center py-24 text-center md:py-32">
      <svg aria-hidden="true" viewBox="0 0 240 80" className="mb-10 w-60">
        <line x1="40" y1="40" x2="120" y2="40" style={{ stroke: 'var(--primary)', strokeOpacity: 0.45 }} strokeWidth="1.5" />
        <line x1="132" y1="40" x2="196" y2="40" style={{ stroke: 'var(--hairline-strong)' }} strokeWidth="1.5" strokeDasharray="3 6" />
        <circle cx="40" cy="40" r="18" style={{ fill: 'var(--primary-strong)' }} />
        <circle cx="200" cy="40" r="16" fill="none" style={{ stroke: 'var(--hairline-strong)' }} strokeWidth="1.5" strokeDasharray="4 4" />
      </svg>
      {code && <p className="text-primary-ink font-mono text-sm font-semibold">{code}</p>}
      <h1 className="text-ink text-h1 mt-3 max-w-[20ch] text-balance">{title}</h1>
      <p className="text-ink-muted text-lead mt-5 max-w-[52ch]">{message}</p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/">Go to the homepage</ButtonLink>
        <ButtonLink href="/apps" variant="secondary">
          Browse apps
        </ButtonLink>
      </div>
    </Container>
  )
}
