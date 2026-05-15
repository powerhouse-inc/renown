import type { AuthProviderModule } from '../../services/wallet/module'
import { wagmiConfig } from '../../utils/wagmi'
import { WagmiAdapter } from './adapter'
import { WagmiAuthProvider } from './provider'

export const wagmiModule: AuthProviderModule = {
  name: 'wagmi',
  enabled: true,
  createAdapter: () => new WagmiAdapter(wagmiConfig),
  Provider: WagmiAuthProvider,
}
