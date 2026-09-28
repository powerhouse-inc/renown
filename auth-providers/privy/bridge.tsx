import { useEffect, useRef } from 'react'
import {
  getEmbeddedConnectedWallet,
  useCreateWallet,
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

// Privy normally creates the embedded wallet at login (`createOnLogin:
// 'users-without-wallets'`), but skips a user who already has any wallet
// linked, e.g. an external one. Give it this long, then create it explicitly.
const CREATE_WALLET_GRACE_MS = 5_000

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
  const { initOAuth, loading: oauthLoading } = useLoginWithOAuth({
    onError: error => adapter.handleLoginError(error),
  })
  const { createWallet } = useCreateWallet()

  // Privy returns fresh function references on every render. Storing them in
  // a ref and syncing inside a layout effect lets us bind once per adapter
  // without re-binding on every render (which would briefly null out
  // adapter.bindings between cleanup and effect).
  const fnsRef = useRef({ openLoginModal, initOAuth, logout, signMessage, signTypedData, createWallet })
  useEffect(() => {
    fnsRef.current = { openLoginModal, initOAuth, logout, signMessage, signTypedData, createWallet }
  }, [openLoginModal, initOAuth, logout, signMessage, signTypedData, createWallet])

  // One explicit creation attempt per authenticated session, after the grace
  // period. On failure the session is ended so the user gets back to the login
  // screen (with Privy's error in the console) instead of an endless spinner.
  const createTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const createAttemptedRef = useRef(false)
  useEffect(
    () => () => {
      if (createTimerRef.current) clearTimeout(createTimerRef.current)
    },
    [],
  )

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
    // OAuth callback in flight — Privy is about to flip `authenticated` to
    // true. Keep the UI in a loading state and defer markReady so we don't
    // flash pre-login between redirect-return and session arrival.
    if (oauthLoading) {
      adapter.setProvisioning(true)
      return
    }
    if (!authenticated) {
      createAttemptedRef.current = false
      adapter.setProvisioning(false)
      adapter.clearSession()
      adapter.markReady()
      return
    }
    const embedded = getEmbeddedConnectedWallet(wallets)
    if (embedded) {
      if (createTimerRef.current) {
        clearTimeout(createTimerRef.current)
        createTimerRef.current = null
      }
      adapter.setProvisioning(false)
      adapter.syncFromEmbeddedWallet(embedded)
    } else {
      // Authenticated but embedded wallet not yet provisioned — show busy
      // so the UI can render a coherent loading state instead of the
      // pre-login view while we wait.
      adapter.setProvisioning(true)
      if (!createAttemptedRef.current && !createTimerRef.current) {
        createTimerRef.current = setTimeout(() => {
          createTimerRef.current = null
          createAttemptedRef.current = true
          fnsRef.current.createWallet().catch((error: unknown) => {
            console.error('Privy could not create the embedded wallet:', error)
            adapter.setProvisioning(false)
            adapter.handleLoginError(error)
            void fnsRef.current.logout()
          })
        }, CREATE_WALLET_GRACE_MS)
      }
    }
    // Privy has answered the "are you logged in?" question. Even if the
    // embedded wallet is still provisioning, busy now covers the rest.
    adapter.markReady()
  }, [adapter, ready, authenticated, wallets, oauthLoading])

  return null
}
