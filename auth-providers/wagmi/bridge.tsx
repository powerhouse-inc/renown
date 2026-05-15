import { useEffect, useRef } from 'react'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import type { WagmiAdapter } from './adapter'

interface WagmiAdapterBridgeProps {
  adapter: WagmiAdapter
}

/**
 * Wires RainbowKit's connect-modal opener into the WagmiAdapter so the
 * adapter's class-based login(WALLET) can trigger the React-only modal.
 * Mount once under <RainbowKitProvider>.
 */
export function WagmiAdapterBridge({ adapter }: WagmiAdapterBridgeProps) {
  const { openConnectModal, connectModalOpen } = useConnectModal()
  const wasOpen = useRef(false)

  useEffect(() => {
    if (!openConnectModal) return
    return adapter.registerConnectModal(openConnectModal)
  }, [adapter, openConnectModal])

  useEffect(() => {
    if (connectModalOpen) {
      wasOpen.current = true
      return
    }
    if (wasOpen.current) {
      wasOpen.current = false
      adapter.cancelPendingLogin()
    }
  }, [adapter, connectModalOpen])

  return null
}
