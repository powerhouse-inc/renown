import { cx } from '../../utils/cx'
import PhIconsBackground from '../ui/ph-icons-background'

/** The Powerhouse icon field as a decorative accent; position it with `className`. */
export function PhMotif({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cx('pointer-events-none absolute', className)}>
      <PhIconsBackground className="[mask-image:radial-gradient(closest-side,black_35%,transparent)]" />
    </div>
  )
}
