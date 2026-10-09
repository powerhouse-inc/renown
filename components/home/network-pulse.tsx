import type { NetworkPulse } from './types'

/**
 * Slot for the network pulse section. Phase A renders nothing; Phase B
 * replaces this body (keep the export and props stable).
 */
export function NetworkPulseSection({ pulse }: { pulse?: NetworkPulse | null }) {
  void pulse
  return null
}
