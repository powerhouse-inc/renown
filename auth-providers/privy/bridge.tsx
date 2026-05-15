import { useEffect, useRef } from 'react'
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

  // Privy returns fresh function references on every render. Storing them in
  // a ref and syncing inside a layout effect lets us bind once per adapter
  // without re-binding on every render (which would briefly null out
  // adapter.bindings between cleanup and effect).
  const fnsRef = useRef({ openLoginModal, initOAuth, logout, signMessage, signTypedData })
  useEffect(() => {
    fnsRef.current = { openLoginModal, initOAuth, logout, signMessage, signTypedData }
  }, [openLoginModal, initOAuth, logout, signMessage, signTypedData])

  useEffect(() => {
    return adapter.bind({
      openLoginModal: opts => fnsRef.current.openLoginModal(opts),
      initOAuth: provider => fnsRef.current.initOAuth({ provider }),
      logout: () => fnsRef.current.logout(),
      signMessage: async (message, address) => {
        const result = await fnsRef.current.signMessage(
          { message },
          { address, uiOptions: { showWalletUIs: false } },
        )
        return result.signature as Hex
      },
      signTypedData: async (args, address) => {
        const result = await fnsRef.current.signTypedData(
          args as unknown as SignTypedDataParams,
          { address, uiOptions: { showWalletUIs: false } },
        )
        return result.signature as Hex
      },
    })
  }, [adapter])

  // Sync session state into the adapter.
  useEffect(() => {
    if (!ready) return
    if (!authenticated) {
      adapter.setProvisioning(false)
      adapter.clearSession()
      return
    }
    const embedded = getEmbeddedConnectedWallet(wallets)
    if (embedded) {
      adapter.setProvisioning(false)
      adapter.syncFromEmbeddedWallet(embedded)
    } else {
      // Authenticated but embedded wallet not yet provisioned — show busy
      // so the UI can render a coherent loading state instead of the
      // pre-login view while we wait.
      adapter.setProvisioning(true)
    }
  }, [adapter, ready, authenticated, wallets])

  return null
}
