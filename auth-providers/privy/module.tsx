import { runtimeConfig } from '../../lib/runtime-config'
import type { AuthProviderModule } from '../../services/wallet/module'
import { LoginMethod } from '../../services/wallet/types'
import { PrivyAdapter } from './adapter'
import { PrivyAuthProvider } from './provider'

const PRIVY_APP_ID = runtimeConfig().privyAppId || undefined

export const privyModule: AuthProviderModule = {
  name: 'privy',
  enabled: Boolean(PRIVY_APP_ID),
  createAdapter: () =>
    new PrivyAdapter({
      supportedMethods: [LoginMethod.GOOGLE, LoginMethod.EMAIL],
    }),
  Provider: PrivyAuthProvider,
}
