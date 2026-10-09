import { mediaUrl } from '../../services/media'
import type { RenownAppProfile } from '../../services/app-profiles'

// The hero's signature visual: your DID at the centre, the apps you approved in
// orbit, each tied to you by a signed edge that pulses. Decorative (aria-hidden);
// all motion is CSS (globals.css, .rn-constellation) and stops under
// prefers-reduced-motion.

const C = 280
/** Glyphs (24x24 stroke paths) for nodes without an app logo. */
const GLYPHS = [
  'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6', // document
  'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3', // terminal
  'M5 19V11M10 19V5M15 19v-6M20 19V9', // stats
  'M5 5h14v10H9l-4 4z', // message
  'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5', // package
  'M15 7a3 3 0 1 1-3 3M12 10H4v4M7 10v3', // key
]

interface NodeSpec {
  orbit: 'inner' | 'outer'
  angle: number
}

const NODES: NodeSpec[] = [
  { orbit: 'inner', angle: -38 },
  { orbit: 'outer', angle: 22 },
  { orbit: 'inner', angle: 96 },
  { orbit: 'outer', angle: 158 },
  { orbit: 'inner', angle: 214 },
  { orbit: 'outer', angle: 280 },
]
const RADIUS = { inner: 150, outer: 236 }

function position(spec: NodeSpec): { x: number; y: number } {
  const rad = (spec.angle * Math.PI) / 180
  const r = RADIUS[spec.orbit]
  return { x: Math.round(C + r * Math.cos(rad)), y: Math.round(C + r * Math.sin(rad)) }
}

/** Only logos stored with Renown (/media): a legacy external URL would show every visitor to a third-party host. */
function logoSrc(app: RenownAppProfile): string | null {
  return app.logoRef ? mediaUrl(app.documentId, 'logo', '', app.logoRef) : null
}

function Node({ index, spec, app }: { index: number; spec: NodeSpec; app?: RenownAppProfile }) {
  const { x, y } = position(spec)
  const src = app ? logoSrc(app) : null
  const letter = app?.name?.trim().charAt(0).toUpperCase()
  const clipId = `rn-node-clip-${index}`
  return (
    <g>
      <line x1={x} y1={y} x2={C} y2={C} className="rn-edge" pathLength={100} />
      <line x1={x} y1={y} x2={C} y2={C} className="rn-pulse" pathLength={100} style={{ animationDelay: `${index * 0.9}s` }} />
      <g transform={`translate(${x} ${y})`}>
        <g className="rn-spin" data-orbit={spec.orbit}>
          <g className="rn-node" style={{ animationDelay: `${180 + index * 90}ms` }}>
            <circle r={30} className="rn-node-bg" />
            {letter && !src ? (
              <text textAnchor="middle" dominantBaseline="central" className="rn-letter">
                {letter}
              </text>
            ) : (
              <g transform="translate(-12 -12)">
                <path d={GLYPHS[index % GLYPHS.length]} className="rn-glyph" />
              </g>
            )}
            {src && (
              <>
                <clipPath id={clipId}>
                  <circle r={26} />
                </clipPath>
                <image href={src} x={-26} y={-26} width={52} height={52} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
              </>
            )}
            <circle r={30} className="rn-node-ring" />
          </g>
        </g>
      </g>
    </g>
  )
}

/** Up to six apps (those with logos first) orbiting the visitor's DID. */
export function Constellation({ apps = [] }: { apps?: RenownAppProfile[] }) {
  const ordered = [...apps].sort((a, b) => Number(Boolean(logoSrc(b))) - Number(Boolean(logoSrc(a)))).slice(0, NODES.length)
  const inner = NODES.map((spec, index) => ({ spec, index })).filter(({ spec }) => spec.orbit === 'inner')
  const outer = NODES.map((spec, index) => ({ spec, index })).filter(({ spec }) => spec.orbit === 'outer')
  return (
    <svg viewBox="0 0 560 560" aria-hidden="true" focusable="false" className="rn-constellation h-auto w-full">
      <defs>
        <radialGradient id="rn-core-glow">
          <stop offset="0" style={{ stopColor: 'var(--grad-to)', stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: 'var(--grad-to)', stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id="rn-core-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--grad-from)' }} />
          <stop offset="1" style={{ stopColor: 'var(--grad-to)' }} />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={RADIUS.inner} className="rn-orbit" />
      <circle cx={C} cy={C} r={RADIUS.outer} className="rn-orbit" />
      <circle cx={C} cy={C} r={268} className="rn-orbit rn-orbit-faint" />
      <circle cx={C} cy={C} r={130} fill="url(#rn-core-glow)" className="rn-core-glow" />
      <g className="rn-ring" data-orbit="inner">
        {inner.map(({ spec, index }) => (
          <Node key={index} index={index} spec={spec} app={ordered[index]} />
        ))}
      </g>
      <g className="rn-ring" data-orbit="outer">
        {outer.map(({ spec, index }) => (
          <Node key={index} index={index} spec={spec} app={ordered[index]} />
        ))}
      </g>
      <g transform={`translate(${C} ${C})`}>
        <circle r={54} className="rn-core-halo" />
        <circle r={44} fill="url(#rn-core-fill)" />
        <path
          transform="translate(-17 -17) scale(0.52)"
          d="M31.3 1C28.2 12 20 20.6 9.4 23.8c-1.3.4-1.3 2.3 0 2.7C20 29.7 28.2 38.3 31.3 49.3c.4 1.4 2.3 1.4 2.7 0 3.1-11 11.4-19.6 21.9-22.8 1.3-.4 1.3-2.3 0-2.7C45.4 20.6 37.1 12 34 1c-.4-1.4-2.3-1.4-2.7 0Z"
          className="rn-spark"
        />
      </g>
    </svg>
  )
}
