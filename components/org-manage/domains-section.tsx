import { useCallback, useState, type FormEvent } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { domainProblem, domainStatusText, normalizeDomain } from '../../lib/orgs/domains'
import { orgDomains, type OrgDomain } from '../../services/org-security'
import { Field, inputClass } from '../profile-edit/field'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageSectionProps } from './manage-context'
import { ConfirmButton, LONG_LABEL, Panel, RemoteView } from './manage-ui'

const OWNERS_ONLY = 'Only owners can remove a verified domain.'

function Proof({ domain }: { domain: OrgDomain }) {
  const code = 'text-ink bg-code rounded-md px-2 py-1 font-mono text-[13px] break-all'
  return (
    <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
      <div className="min-w-0">
        <p className="text-ink font-semibold">Either a DNS TXT record</p>
        <p className="text-ink-muted mt-1">Name</p>
        <p className={code}>{domain.txtName}</p>
        <p className="text-ink-muted mt-2">Value</p>
        <p className={code}>{domain.txtValue}</p>
      </div>
      <div className="min-w-0">
        <p className="text-ink font-semibold">Or a file on your site</p>
        <p className="text-ink-muted mt-1">At</p>
        <p className={code}>{domain.wellKnownUrl}</p>
        <p className="text-ink-muted mt-2">Containing</p>
        <p className={code}>{domain.wellKnownJson}</p>
      </div>
    </div>
  )
}

export function DomainsSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const load = useCallback(async () => orgDomains(org.id, await getBearer()), [org.id, getBearer])
  const domains = useRemote(`domains:${org.id}`, load)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const known = domains.state.status === 'ready' ? domains.state.value : []

  async function add(event: FormEvent) {
    event.preventDefault()
    if (domains.pending) return
    const domain = normalizeDomain(text)
    const found = domainProblem(domain) ?? (known.some((d) => d.domain === domain) ? 'This domain is already in the list.' : null)
    if (found) {
      setProblem(found)
      return
    }
    setBusy('add')
    // A lost answer may still have added the domain: re-read before another add.
    const done = await ctx.run<OrgDomain>('addOrgDomain', { orgId: org.id, domain }, `${domain} added. Publish one of the proofs, then check it.`, { recheck: domains.reload })
    setBusy(null)
    if (done) {
      setText('')
      domains.reload()
    }
  }

  async function check(domain: OrgDomain) {
    setBusy(domain.id)
    const done = await ctx.run<OrgDomain>('checkOrgDomain', { orgId: org.id, domainId: domain.id }, `${domain.domain} is verified.`)
    setBusy(null)
    if (done) {
      domains.reload()
      ctx.reloadOrg()
    }
  }

  async function remove(domain: OrgDomain) {
    setBusy(domain.id)
    const done = await ctx.run<boolean>('removeOrgDomain', { orgId: org.id, domainId: domain.id }, `${domain.domain} was removed.`, {
      errorText: { FORBIDDEN: OWNERS_ONLY },
    })
    setBusy(null)
    if (done !== null) {
      domains.reload()
      ctx.reloadOrg()
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <Panel
        id="add-domain-title"
        title="Add a domain"
        description="A verified domain shows as “Verified: <domain>” on the organisation’s page, appears in sign-ins that ask about organisations, and after 14 days lets you recover the organisation. Up to 10 domains."
      >
        <form onSubmit={(event) => void add(event)} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <Field id="domain-new" label="Domain" error={problem ?? undefined}>
              <input
                id="domain-new"
                className={inputClass}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setProblem(null)
                }}
                placeholder="acme.com"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          </div>
          <button type="submit" disabled={busy === 'add' || domains.pending} className={buttonClasses('primary', 'md', 'sm:mt-[1.625rem]')}>
            Add domain
          </button>
        </form>
      </Panel>
      <Panel id="domains-title" title="Domains" description="Renown re-checks verified domains every day; a domain whose proof is missing three days in a row lapses.">
        <RemoteView remote={domains.state} what="domains" onRetry={domains.reload}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">No domains yet.</p>
            ) : (
              <ul aria-label="Domains" className="divide-hairline divide-y">
                {list.map((domain) => (
                  <li key={domain.id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink font-semibold break-all">{domain.domain}</p>
                        <p className="text-ink-muted text-xs">{domainStatusText(domain)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={domain.status === 'VERIFIED' ? 'signal' : 'neutral'}>
                          {domain.status === 'VERIFIED' ? 'Verified' : domain.status === 'LAPSED' ? 'Lapsed' : 'Pending'}
                        </Badge>
                        {domain.status !== 'VERIFIED' && (
                          <button type="button" disabled={busy === domain.id} onClick={() => void check(domain)} className={buttonClasses('secondary', 'md', LONG_LABEL)}>
                            Check {domain.domain} now
                          </button>
                        )}
                        {domain.status === 'VERIFIED' && ctx.role !== 'OWNER' ? (
                          <span className="text-ink-muted text-xs">{OWNERS_ONLY}</span>
                        ) : (
                          <ConfirmButton label={`Remove ${domain.domain}`} confirm={`Yes, remove ${domain.domain}`} busy={busy === domain.id} onConfirm={() => void remove(domain)} />
                        )}
                      </div>
                    </div>
                    {domain.status !== 'VERIFIED' && <Proof domain={domain} />}
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </Panel>
    </div>
  )
}
