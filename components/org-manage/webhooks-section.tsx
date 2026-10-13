import { useCallback, useState, type FormEvent } from 'react'
import { useNow } from '../../hooks/use-now'
import { useRemote } from '../../hooks/use-remote'
import { MAX_WEBHOOKS, ORG_WEBHOOK_EVENTS, webhookUrlProblem } from '../../lib/orgs/webhooks'
import { orgWebhookDeliveries, orgWebhooks, type OrgWebhook, type OrgWebhookCreated, type OrgWebhookDelivery } from '../../services/org-security'
import { formatRelative } from '../../utils/relative-time'
import { Field, inputClass } from '../profile-edit/field'
import { Badge, buttonClasses } from '../site/primitives'
import type { ManageContext, ManageSectionProps } from './manage-context'
import { ConfirmButton, Panel, RemoteView } from './manage-ui'
import { SecretOnce } from './secret-once'

const DELIVERY_STATUS: Record<OrgWebhookDelivery['status'], string> = {
  PENDING: 'Retrying',
  PAUSED: 'Paused while the organisation is taken down',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
}

function deliveryText(d: OrgWebhookDelivery): string {
  return `${DELIVERY_STATUS[d.status]}${d.responseStatus !== null ? `, HTTP ${d.responseStatus}` : d.lastError ? `, ${d.lastError}` : ''}`
}

function Deliveries({ ctx, hook }: { ctx: ManageContext; hook: OrgWebhook }) {
  const { org, getBearer } = ctx
  const now = useNow()
  const load = useCallback(async () => orgWebhookDeliveries(org.id, hook.id, await getBearer()), [org.id, hook.id, getBearer])
  const deliveries = useRemote(`deliveries:${hook.id}`, load)
  return (
    <div className="mt-3">
      <RemoteView remote={deliveries.state} what="deliveries" onRetry={deliveries.reload}>
        {(list) =>
          list.length === 0 ? (
            <p className="text-ink-muted text-sm">No deliveries yet.</p>
          ) : (
            <ul aria-label="Deliveries" className="border-hairline rounded-card divide-hairline divide-y border text-sm">
              {list.map((d) => (
                <li key={d.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span className="text-ink font-mono text-xs">{d.eventType}</span>
                  <span className={d.status === 'FAILED' ? 'text-danger-ink' : 'text-ink-muted'}>
                    {deliveryText(d)}, {formatRelative(d.createdAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </RemoteView>
    </div>
  )
}

export function WebhooksSection({ ctx }: ManageSectionProps) {
  const { org, getBearer } = ctx
  const load = useCallback(async () => orgWebhooks(org.id, await getBearer()), [org.id, getBearer])
  const hooks = useRemote(`webhooks:${org.id}`, load)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  // The signing secret lives only in this state: never stored, logged or tracked.
  const [secret, setSecret] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function create(event: FormEvent) {
    event.preventDefault()
    if (hooks.pending) return
    const found = webhookUrlProblem(url) ?? (events.length === 0 ? 'Choose at least one event.' : null)
    if (found) {
      setProblem(found)
      return
    }
    setBusy('create')
    // Events in the documented order, whatever order they were ticked in.
    const ordered = ORG_WEBHOOK_EVENTS.filter((name) => events.includes(name))
    // A lost answer may still have created the webhook: re-read before another create.
    const done = await ctx.run<OrgWebhookCreated>('createOrgWebhook', { orgId: org.id, url: url.trim(), events: ordered }, 'Webhook added.', { recheck: hooks.reload })
    setBusy(null)
    if (done) {
      setSecret(done.secret)
      setUrl('')
      setEvents([])
      hooks.reload()
    }
  }

  async function test(hook: OrgWebhook) {
    setBusy(hook.id)
    const delivery = await ctx.run<OrgWebhookDelivery>('testOrgWebhook', { orgId: org.id, webhookId: hook.id }, 'Test event sent.')
    setBusy(null)
    if (delivery) {
      const delivered = delivery.status === 'DELIVERED'
      const how = delivery.responseStatus !== null ? `HTTP ${delivery.responseStatus}` : (delivery.lastError ?? 'no answer')
      ctx.notify(delivered ? 'success' : 'error', `Test event ${delivered ? 'delivered' : 'failed'} (${how}).`)
    }
  }

  async function update(hook: OrgWebhook, enabled: boolean) {
    setBusy(hook.id)
    const done = await ctx.run<OrgWebhook>('updateOrgWebhook', { orgId: org.id, webhookId: hook.id, enabled }, enabled ? 'Webhook enabled.' : 'Webhook disabled.')
    setBusy(null)
    if (done) hooks.reload()
  }

  async function remove(hook: OrgWebhook) {
    setBusy(hook.id)
    const done = await ctx.run<boolean>('deleteOrgWebhook', { orgId: org.id, webhookId: hook.id }, 'Webhook deleted.')
    setBusy(null)
    if (done !== null) hooks.reload()
  }

  const count = hooks.state.status === 'ready' ? hooks.state.value.length : 0

  return (
    <div className="mt-6 space-y-8">
      <Panel id="add-webhook-title" title="Add a webhook" description={`Renown POSTs each chosen event, signed with the secret, to your https endpoint (port 443 or 8443) and retries for about 15 hours. Up to ${MAX_WEBHOOKS} webhooks.`}>
        <form onSubmit={(event) => void create(event)} noValidate className="space-y-4">
          <Field id="webhook-url" label="Endpoint URL" error={problem ?? undefined}>
            <input
              id="webhook-url"
              type="url"
              className={inputClass}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setProblem(null)
              }}
              placeholder="https://"
            />
          </Field>
          <fieldset>
            <legend className="text-ink text-sm font-semibold">Events</legend>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {ORG_WEBHOOK_EVENTS.map((name) => (
                <li key={name}>
                  <label className="text-ink flex items-center gap-2 font-mono text-xs">
                    <input type="checkbox" checked={events.includes(name)} onChange={(e) => setEvents((list) => (e.target.checked ? [...list, name] : list.filter((n) => n !== name)))} />
                    {name}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <button type="submit" disabled={busy === 'create' || hooks.pending || count >= MAX_WEBHOOKS} className={buttonClasses('primary', 'md')}>
            Add webhook
          </button>
        </form>
        {secret && (
          <SecretOnce label="Webhook signing secret" value={secret}>
            <p className="text-ink-muted mt-3 text-xs leading-5">
              Check each request&apos;s Renown-Signature header with <span className="font-mono">verifyWebhookSignature(secret, header, rawBody)</span> from
              @powerhousedao/renown-package/orgs.
            </p>
          </SecretOnce>
        )}
      </Panel>
      <Panel id="webhooks-title" title="Webhooks" description="A webhook is disabled after 50 failed delivery attempts in a row (each retry counts); enabling it again resets the count.">
        <RemoteView remote={hooks.state} what="webhooks" onRetry={hooks.reload}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-ink-muted text-sm">No webhooks yet.</p>
            ) : (
              <ul aria-label="Webhooks" className="divide-hairline divide-y">
                {list.map((hook) => (
                  <li key={hook.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink text-sm font-semibold break-all">{hook.url}</p>
                        <p className="text-ink-muted font-mono text-xs break-words">{hook.events.join(', ')}</p>
                        {hook.consecutiveFailures > 0 && <p className="text-caution-ink text-xs">{hook.consecutiveFailures} failed delivery attempts in a row</p>}
                      </div>
                      {!hook.enabled && <Badge>Disabled</Badge>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={busy === hook.id} onClick={() => void test(hook)} className={buttonClasses('secondary', 'md')}>
                        Send a test event
                      </button>
                      <button type="button" aria-expanded={open === hook.id} onClick={() => setOpen(open === hook.id ? null : hook.id)} className={buttonClasses('ghost', 'md')}>
                        {open === hook.id ? 'Hide deliveries' : 'Show deliveries'}
                      </button>
                      <button type="button" disabled={busy === hook.id} onClick={() => void update(hook, !hook.enabled)} className={buttonClasses('ghost', 'md')}>
                        {hook.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <ConfirmButton label="Delete" confirm="Yes, delete it" busy={busy === hook.id} onConfirm={() => void remove(hook)} />
                    </div>
                    {open === hook.id && <Deliveries ctx={ctx} hook={hook} />}
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
