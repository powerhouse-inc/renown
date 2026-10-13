import { useState } from 'react'
import { memberLabel } from '../../lib/orgs/format'
import type { OrgMember } from '../../services/orgs'
import { buttonClasses } from '../site/primitives'
import type { ManageContext } from './manage-context'

/** Which of the organisation's apps a publisher may act for: all, or a chosen list. */
export function ScopeEditor({
  ctx,
  member,
  onSaved,
}: {
  ctx: ManageContext
  member: OrgMember
  onSaved: () => void
}) {
  const [all, setAll] = useState(member.appScope.all)
  const [chosen, setChosen] = useState<string[]>(member.appScope.appDids)
  const [busy, setBusy] = useState(false)
  const name = memberLabel(member)

  async function save() {
    setBusy(true)
    const done = await ctx.run(
      'setOrgMemberAppScope',
      { orgId: ctx.org.id, address: member.address, appScope: { all, appDids: all ? [] : chosen } },
      `App access of ${name} saved.`,
      { recheck: onSaved },
    )
    setBusy(false)
    if (done) onSaved()
  }

  return (
    <fieldset className="border-hairline rounded-card mt-4 border p-4">
      <legend className="text-ink px-1 text-sm font-semibold">App access for {name}</legend>
      <label className="text-ink flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={`scope-${member.id}`}
          checked={all}
          onChange={() => setAll(true)}
        />
        All of the organisation’s apps
      </label>
      <label className="text-ink mt-2 flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={`scope-${member.id}`}
          checked={!all}
          onChange={() => setAll(false)}
        />
        Only these apps
      </label>
      {!all &&
        (ctx.org.apps.length === 0 ? (
          <p className="text-ink-muted mt-3 pl-6 text-sm">The organisation has no apps yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 pl-6">
            {ctx.org.apps.map((app) => (
              <li key={app.appDid}>
                <label className="text-ink flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={chosen.includes(app.appDid)}
                    onChange={(e) =>
                      setChosen((current) =>
                        e.target.checked
                          ? [...current, app.appDid]
                          : current.filter((did) => did !== app.appDid),
                      )
                    }
                  />
                  <span className="font-mono text-xs break-all">{app.appDid}</span>
                </label>
              </li>
            ))}
          </ul>
        ))}
      <p className="text-ink-muted mt-3 text-xs">Teams add their apps on top of this.</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className={buttonClasses('primary', 'md', 'mt-4')}
      >
        {busy ? 'Saving…' : 'Save app access'}
      </button>
    </fieldset>
  )
}
