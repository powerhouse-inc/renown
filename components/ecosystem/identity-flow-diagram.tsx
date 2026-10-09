// How one Renown identity moves through the network (static SVG on /ecosystem).

interface Box {
  id: string
  x: number
  y: number
  label: string
  sub: string
  primary?: boolean
}

const W = 168
const H = 64
const BOXES: Box[] = [
  { id: 'you', x: 16, y: 152, label: 'You', sub: 'your wallet DID' },
  { id: 'renown', x: 330, y: 152, label: 'Renown', sub: 'credentials and profiles', primary: true },
  { id: 'app', x: 640, y: 40, label: 'Connect and apps', sub: 'act with an app key' },
  { id: 'switchboard', x: 640, y: 248, label: 'Switchboard', sub: 'stores signed changes' },
  { id: 'vetra', x: 330, y: 312, label: 'Vetra', sub: 'app identities' },
  { id: 'achra', x: 640, y: 376, label: 'Achra', sub: 'listings and reviews' },
]

interface Edge {
  d: string
  label: string
  lx: number
  ly: number
  anchor?: 'start' | 'middle' | 'end'
  dashed?: boolean
}

const EDGES: Edge[] = [
  { d: 'M184 184 H326', label: 'you sign a credential', lx: 257, ly: 172 },
  { d: 'M498 172 C572 172 566 72 636 72', label: 'authorises the app key', lx: 552, ly: 112, anchor: 'end' },
  { d: 'M724 104 V244', label: 'signed changes', lx: 734, ly: 180, anchor: 'start' },
  { d: 'M414 312 V220', label: 'registers apps', lx: 424, ly: 270, anchor: 'start' },
  { d: 'M498 204 C590 204 560 408 636 408', label: 'same identity', lx: 590, ly: 330, anchor: 'start', dashed: true },
]

const STEPS = [
  { label: 'You', text: 'Your wallet DID is your identity.' },
  { label: 'Renown', text: 'You sign a credential that authorises an app key.', primary: true },
  { label: 'Connect and apps', text: 'Act for you with that app key.' },
  { label: 'Switchboard', text: 'Stores the signed changes.' },
]

const SIDE_NOTES = [
  { label: 'Vetra', text: 'registers app identities on Renown.' },
  { label: 'Achra', text: 'uses the same identity for listings and reviews.' },
]

/** Stacked version of the flow for narrow screens. */
function IdentityFlowList() {
  return (
    <div className="md:hidden">
      <ol className="rn-flow-list">
        {STEPS.map((step) => (
          <li key={step.label} className={step.primary ? 'rn-flow-step rn-flow-step-primary' : 'rn-flow-step'}>
            <span className="text-ink block font-semibold">{step.label}</span>
            <span className="text-ink-muted mt-0.5 block text-sm">{step.text}</span>
          </li>
        ))}
      </ol>
      <ul className="border-hairline mt-6 space-y-3 border-t pt-5">
        {SIDE_NOTES.map((note) => (
          <li key={note.label} className="text-ink-muted text-sm leading-6">
            <span className="text-ink font-semibold">{note.label}</span> {note.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function IdentityFlowDiagram() {
  return (
    <>
      <IdentityFlowList />
      <IdentityFlowSvg />
    </>
  )
}

function IdentityFlowSvg() {
  return (
    <svg viewBox="0 0 824 456" role="img" aria-labelledby="flow-title-svg flow-desc-svg" className="rn-flow hidden h-auto w-full md:block">
      <title id="flow-title-svg">How a Renown identity flows through the Powerhouse network</title>
      <desc id="flow-desc-svg">
        You sign a credential on Renown that authorises an app key. Connect and other apps act with that key and send signed
        changes to Switchboard. Vetra registers app identities on Renown, and Achra uses the same identity for listings and
        reviews.
      </desc>
      <defs>
        <marker id="rn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" className="rn-flow-arrow" />
        </marker>
      </defs>
      {EDGES.map((edge) => (
        <g key={edge.label}>
          <path d={edge.d} className={edge.dashed ? 'rn-flow-edge rn-flow-dashed' : 'rn-flow-edge'} markerEnd="url(#rn-arrow)" />
          <text x={edge.lx} y={edge.ly} textAnchor={edge.anchor ?? 'middle'} className="rn-flow-edge-label">
            {edge.label}
          </text>
        </g>
      ))}
      {BOXES.map((box) => (
        <g key={box.id} transform={`translate(${box.x} ${box.y})`}>
          <rect width={W} height={H} rx={14} className={box.primary ? 'rn-flow-box rn-flow-primary' : 'rn-flow-box'} />
          <text x={W / 2} y={28} textAnchor="middle" className="rn-flow-label">
            {box.label}
          </text>
          <text x={W / 2} y={47} textAnchor="middle" className="rn-flow-sub">
            {box.sub}
          </text>
        </g>
      ))}
    </svg>
  )
}
