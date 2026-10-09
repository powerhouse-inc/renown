import { identicon } from '../../utils/identicon'

interface IdenticonProps {
  seed: string
  className?: string
}

/** Generated fallback avatar: a mirrored 5×5 pattern derived from `seed`. */
export function Identicon({ seed, className = '' }: IdenticonProps) {
  const { color, cells } = identicon(seed)
  return (
    <svg viewBox="0 0 5 5" className={`bg-secondary ${className}`} role="img" aria-label="Generated avatar">
      {cells.map((filled, i) =>
        filled ? <rect key={i} x={i % 5} y={Math.floor(i / 5)} width={1} height={1} fill={color} /> : null,
      )}
    </svg>
  )
}
