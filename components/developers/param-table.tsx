import type { ReactNode } from 'react'

export interface ParamRow {
  name: string
  value: ReactNode
  description: ReactNode
}

/** The connect-link parameter reference; stacks into cards below md. */
export function ParamTable({ rows }: { rows: ParamRow[] }) {
  return (
    <div className="border-hairline rounded-card overflow-hidden border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-surface-2 hidden md:table-header-group">
          <tr>
            <th scope="col" className="text-ink px-4 py-3 font-semibold">Parameter</th>
            <th scope="col" className="text-ink px-4 py-3 font-semibold">Value</th>
            <th scope="col" className="text-ink px-4 py-3 font-semibold">Behaviour</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-hairline block border-t first:border-t-0 md:table-row md:first:border-t">
              <th scope="row" className="text-primary-ink block px-4 pt-4 font-mono font-medium md:table-cell md:py-4 md:align-top">
                {row.name}
              </th>
              <td className="text-ink block px-4 pt-1 md:table-cell md:py-4 md:align-top">{row.value}</td>
              <td className="text-ink-muted block px-4 pt-1 pb-4 leading-6 md:table-cell md:py-4 md:align-top">{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
