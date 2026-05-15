import { useEffect } from 'react'
import {
  getEmbeddedConnectedWallet,
  useLogin,
  useLoginWithOAuth,
  useLogout,
  usePrivy,
  useSignMessage,
  useSignTypedData,
  useWallets,
  type SignTypedDataParams,
} from '@privy-io/react-auth'
import type { Hex } from 'viem'
import type { PrivyAdapter } from './adapter'

interface PrivyAdapterBridgeProps {
  adapter: PrivyAdapter
}

/**
 * Captures the React-only Privy hooks and wires them into PrivyAdapter so the
 * class-based adapter can drive Privy without owning React state. Must be
 * mounted inside <PrivyProvider>.
 */
export function PrivyAdapterBridge({ adapter }: PrivyAdapterBridgeProps) {
  const { ready, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { signMessage } = useSignMessage()
  const { signTypedData } = useSignTypedData()
  const { logout } = useLogout()
  const { login: openLoginModal } = useLogin({
    onError: error => adapter.handleLoginError(error),
  })
  const { initOAuth } = useLoginWithOAuth({
    onError: error => adapter.handleLoginError(error),
  })

  // Bind imperative handles into the adapter.
  useEffect(() => {
    return adapter.bind({
      openLoginModal,
      initOAuth: provider => initOAuth({ provider }),
      logout,
      signMessage: async (message, address) => {
        const result = await signMessage({ message }, { address })
        return result.signature as Hex
      },
      signTypedData: async (args, address) => {
        const result = await signTypedData(args as unknown as SignTypedDataParams, { address })
        return result.signature as Hex
      },
    })
  }, [adapter, openLoginModal, initOAuth, logout, signMessage, signTypedData])

  // Sync session state into the adapter.
  useEffect(() => {
    if (!ready) return
    if (!authenticated) {
      adapter.clearSession()
      return
    }
    const embedded = getEmbeddedConnectedWallet(wallets)
    if (embedded) {
      adapter.syncFromEmbeddedWallet(embedded)
    }
  }, [adapter, ready, authenticated, wallets])

  return null
}
