import { createConfig, http } from 'wagmi'
import { foundry } from 'wagmi/chains'
import { mock, type MockParameters } from 'wagmi/connectors'

// Anvil's first dev account: public key, kept unlocked by anvil, so the
// mock connector's `eth_sign` passthrough produces real signatures.
export const E2E_WALLET_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

type MockFeatures = NonNullable<MockParameters['features']>

declare global {
  interface Window {
    /** Seeded by tests via addInitScript; read by the connector per request. */
    __e2eWallet?: MockFeatures
  }
}

const features: MockFeatures = {
  defaultConnected: false,
  reconnect: true,
  ...(typeof window !== 'undefined' ? window.__e2eWallet : undefined),
}
if (typeof window !== 'undefined') window.__e2eWallet = features

/** Test-only config: a mock connector backed by a local anvil node. */
export const e2eWagmiConfig = createConfig({
  chains: [foundry],
  connectors: [mock({ accounts: [E2E_WALLET_ADDRESS], features })],
  transports: { [foundry.id]: http() },
  ssr: true,
})
