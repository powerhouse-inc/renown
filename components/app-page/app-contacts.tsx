import { PageSection } from '../identity/page-section'

type Contact = { href: string; label: string }

function Row({ term, contact }: { term: string; contact: Contact }) {
  const mail = contact.href.startsWith('mailto:')
  return (
    <div>
      <dt className="text-ink-muted text-xs font-medium">{term}</dt>
      <dd>
        <a
          href={contact.href}
          target={mail ? undefined : '_blank'}
          rel="nofollow noopener noreferrer"
          className="text-primary-ink text-sm font-semibold break-all underline-offset-4 hover:underline"
        >
          {contact.label}
        </a>
      </dd>
    </div>
  )
}

/** Where to ask for help and where to report a security problem, as the publisher states them. */
export function AppContacts({ support, security }: { support: Contact | null; security: Contact | null }) {
  return (
    <PageSection id="app-contacts" title="Contact">
      <dl className="space-y-3">
        {support && <Row term="Support" contact={support} />}
        {security && <Row term="Security" contact={security} />}
      </dl>
    </PageSection>
  )
}
