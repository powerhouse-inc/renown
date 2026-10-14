import { useCallback, useState, type FormEvent } from 'react'
import { useRemote } from '../../hooks/use-remote'
import { MAX_OIDC_CLIENTS, oidcIssuer, parseRedirectUris } from '../../lib/orgs/oidc'
import { withBearer } from '../../services/orgs'
import {
  orgOidcClients,
  type OrgOidcClient,
  type OrgOidcClientCredentials,
} from '../../services/org-security'
import { Field, inputClass } from '../profile-edit/field'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext, ManageSectionProps } from './manage-context'
import { useConfirm } from './confirm-dialog'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'
import { SecretOnce } from './secret-once'

function ClientRow({
  ctx,
  client,
  onChange,
}: {
  ctx: ManageContext
  client: OrgOidcClient
  onChange: () => void
}) {
  // D6: an archived or taken-down organisation reads its clients DISABLED and refuses writes.
  const readonly = ctx.org.archived || ctx.org.takenDown
  const [uri, setUri] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A rotated secret is shown once, in this client's own row.
  const [rotated, setRotated] = useState<OrgOidcClientCredentials | null>(null)
  const { ask, dialog } = useConfirm()

  async function update(args: Record<string, unknown>, success: string) {
    setBusy(true)
    const done = await ctx.run<OrgOidcClient>(
      'updateOrgOidcClient',
      { orgId: ctx.org.id, clientId: client.clientId, ...args },
      success,
      { recheck: onChange },
    )
    setBusy(false)
    if (done) onChange()
    return done !== null
  }

  async function addUri(event: FormEvent) {
    event.preventDefault()
    const parsed = parseRedirectUris(uri)
    if ('problem' in parsed) {
      setProblem(parsed.problem)
      return
    }
    if (await update({ addRedirectUris: parsed.uris }, 'Redirect URI added.')) setUri('')
  }

  async function rotate() {
    setBusy(true)
    const done = await ctx.run<OrgOidcClientCredentials>(
      'rotateOrgOidcClientSecret',
      { orgId: ctx.org.id, clientId: client.clientId },
      'New secret created. The old one no longer works.',
      { recheck: onChange },
    )
    setBusy(false)
    if (done) setRotated(done)
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink font-semibold break-words">{client.name}</p>
          <p className="text-ink-muted font-mono text-xs break-all">{client.clientId}</p>
        </div>
        {client.status === 'DISABLED' && <Badge>Disabled</Badge>}
      </div>
      <ul aria-label={`Registered URIs of ${client.name}`} className="mt-3 space-y-1">
        {client.redirectUris.map((value) => (
          <li key={value} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink font-mono text-xs break-all">{value}</span>
            {!readonly && client.redirectUris.length > 1 && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void update({ removeRedirectUris: [value] }, 'Redirect URI removed.')
                }
                aria-label={`Remove ${value}`}
                className={buttonClasses('ghost', 'md')}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readonly && (
        <form
          onSubmit={(event) => void addUri(event)}
          noValidate
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start"
        >
          <div className="min-w-0 flex-1">
            <Field
              id={`uri-${client.clientId}`}
              label="Add a redirect URI"
              error={problem ?? undefined}
            >
              <input
                id={`uri-${client.clientId}`}
                className={inputClass}
                value={uri}
                onChange={(e) => {
                  setUri(e.target.value)
                  setProblem(null)
                }}
                placeholder="https://"
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={busy}
            className={buttonClasses('secondary', 'md', 'sm:mt-[1.625rem]')}
          >
            Add URI
          </button>
        </form>
      )}
      {!readonly && (
        <div className="mt-3 flex flex-wrap gap-2">
          <ConfirmButton
            label={`Rotate the secret of ${client.name}`}
            confirm="Yes, rotate it"
            busy={busy}
            onConfirm={() => void rotate()}
          />
          <button
            type="button"
            disabled={busy}
            aria-label={`${client.status === 'ACTIVE' ? 'Disable' : 'Enable'} ${client.name}`}
            onClick={() =>
              client.status === 'ACTIVE'
                ? // Disabling stops sign-in for every member using the app: ask first.
                  ask({
                    title: `Disable ${client.name}?`,
                    body: `${client.name} stops signing anyone in with Renown until it is enabled again.`,
                    confirm: `Disable ${client.name}`,
                    onConfirm: () => void update({ status: 'DISABLED' }, 'Client disabled.'),
                  })
                : void update({ status: 'ACTIVE' }, 'Client enabled.')
            }
            className={buttonClasses('ghost', 'md')}
          >
            {client.status === 'ACTIVE' ? 'Disable' : 'Enable'}
          </button>
        </div>
      )}
      {rotated && <SecretOnce label={`New secret of ${client.name}`} value={rotated.clientSecret} />}
      {dialog}
    </li>
  )
}

export function OidcSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const load = useCallback(
    async () => withBearer(getBearer, (bearer) => orgOidcClients(org.id, bearer)),
    [org.id, getBearer],
  )
  const clients = useRemote(`oidc:${org.id}`, load)
  const [name, setName] = useState('')
  const [uris, setUris] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [secret, setSecret] = useState<OrgOidcClientCredentials | null>(null)
  const [busy, setBusy] = useState(false)

  const readonly = org.archived || org.takenDown
  const count = clients.state.status === 'ready' ? clients.state.value.length : 0
  const full = count >= MAX_OIDC_CLIENTS

  async function register(event: FormEvent) {
    event.preventDefault()
    if (clients.pending || full || readonly) return
    const parsed = parseRedirectUris(uris)
    if (!name.trim()) {
      setProblem('Give the client a name.')
      return
    }
    if ('problem' in parsed) {
      setProblem(parsed.problem)
      return
    }
    setBusy(true)
    // A lost answer may still have registered the client: re-read before another register (D21).
    const done = await ctx.run<OrgOidcClientCredentials>(
      'registerOrgOidcClient',
      { orgId: org.id, name: name.trim(), redirectUris: parsed.uris },
      'Client registered.',
      {
        recheck: clients.reload,
        errorText: {
          LIMIT_REACHED: `An organisation can have at most ${MAX_OIDC_CLIENTS} sign-in clients, disabled ones included.`,
        },
      },
    )
    setBusy(false)
    if (done) {
      setSecret(done)
      setName('')
      setUris('')
      clients.reload()
    }
  }

  return (
    <div className="mt-6 space-y-8">
      {!readonly && (
        <Panel
          id="register-client-title"
          title="Register a sign-in client"
          description={`An app of your own that signs people in with Renown, open only to members of ${org.name}. Issuer: ${oidcIssuer()}. Up to ${MAX_OIDC_CLIENTS} clients, disabled ones included (${count} of ${MAX_OIDC_CLIENTS} used).`}
        >
          <form onSubmit={(event) => void register(event)} noValidate className="space-y-4">
            <Field id="client-name" label="Client name">
              <input
                id="client-name"
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field
              id="client-uris"
              label="Redirect URIs"
              error={problem ?? undefined}
              hint="One per line."
            >
              <textarea
                id="client-uris"
                rows={3}
                className={inputClass}
                value={uris}
                onChange={(e) => setUris(e.target.value)}
              />
            </Field>
            <button
              type="submit"
              disabled={busy || clients.pending || full}
              className={buttonClasses('primary', 'md')}
            >
              Register client
            </button>
          </form>
          {secret && (
            <SecretOnce label="Client secret" value={secret.clientSecret}>
              <p className="text-ink-muted mt-3 text-xs">
                Client id <span className="text-ink font-mono break-all">{secret.clientId}</span>
              </p>
            </SecretOnce>
          )}
        </Panel>
      )}
      <Panel
        id="clients-title"
        title="Sign-in clients"
        description={
          readonly
            ? 'Clients are disabled while the organisation is archived or taken down.'
            : undefined
        }
      >
        <RemoteView remote={clients.state} what="sign-in clients" onRetry={clients.reload}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">No sign-in clients yet.</p>
            ) : (
              <ul aria-label="Sign-in clients" className="divide-hairline divide-y">
                {list.map((client) => (
                  <ClientRow
                    key={client.clientId}
                    ctx={ctx}
                    client={client}
                    onChange={clients.reload}
                  />
                ))}
              </ul>
            )
          }
        </RemoteView>
      </Panel>
    </div>
  )
}
