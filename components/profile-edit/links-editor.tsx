import type { ProfileLink } from '../../services/renown-signed-messages'
import { LIMITS } from '../../utils/profile-form'
import { Field, inputClass } from './field'

interface LinksEditorProps {
  links: ProfileLink[]
  onChange: (links: ProfileLink[]) => void
  error?: string
}

const iconButton =
  'text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:opacity-30 rounded-md p-2 transition-colors disabled:pointer-events-none'

function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

/** Up to 8 labelled links: add, edit, move up/down, remove. */
export function LinksEditor({ links, onChange, error }: LinksEditorProps) {
  const update = (index: number, patch: Partial<ProfileLink>) =>
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)))
  const move = (index: number, by: -1 | 1) => {
    const next = [...links]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    onChange(next)
  }

  return (
    <Field id="links" group label="Links" error={error} counter={`${links.length}/${LIMITS.links}`} hint="Website, GitHub, X, anything with an https:// address.">
      <ol className="space-y-2">
        {links.map((link, index) => (
          <li key={link.id} className="border-border bg-background/40 flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center">
            <input
              className={`${inputClass} sm:w-40`}
              value={link.label}
              maxLength={LIMITS.linkLabel}
              placeholder="Label"
              aria-label={`Link ${index + 1} label`}
              onChange={(e) => update(index, { label: e.target.value })}
            />
            <input
              className={inputClass}
              value={link.url}
              type="url"
              inputMode="url"
              placeholder="https://"
              aria-label={`Link ${index + 1} URL`}
              onChange={(e) => update(index, { url: e.target.value })}
            />
            <div className="flex shrink-0 justify-end">
              <button type="button" className={iconButton} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move link ${index + 1} up`}>
                ↑
              </button>
              <button type="button" className={iconButton} disabled={index === links.length - 1} onClick={() => move(index, 1)} aria-label={`Move link ${index + 1} down`}>
                ↓
              </button>
              <button type="button" className={`${iconButton} hover:text-destructive`} onClick={() => onChange(links.filter((_, i) => i !== index))} aria-label={`Remove link ${index + 1}`}>
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>
      {links.length < LIMITS.links && (
        <button
          type="button"
          onClick={() => onChange([...links, { id: newId(), label: '', url: '' }])}
          className="border-border text-foreground hover:bg-foreground/10 mt-2 w-full rounded-lg border border-dashed px-3 py-2 text-sm font-semibold transition-colors"
        >
          + Add link
        </button>
      )}
    </Field>
  )
}
